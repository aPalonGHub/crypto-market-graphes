const coinCheckboxes = document.querySelectorAll('[name="coins"]');
const rangeSelect = document.getElementById('rangeSelect');
const statusText = document.getElementById('statusText');
const chartSummary = document.getElementById('chartSummary');
const selectedCoinsDisplay = document.getElementById('selectedCoinsDisplay');
const chartCanvas = document.getElementById('cryptoChart');
const chartButtons = document.querySelectorAll('[data-type]');
const themeToggle = document.getElementById('themeToggle');

const coinNames = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  cardano: 'Cardano',
  binancecoin: 'Binance Coin',
  solana: 'Solana',
};

const coinColors = {
  bitcoin: 'rgba(35, 125, 255, 1)',
  ethereum: 'rgba(0, 200, 170, 1)',
  cardano: 'rgb(190, 32, 183)',
  binancecoin: 'rgba(255, 175, 75, 1)',
  solana: 'rgba(135, 90, 255, 1)',
};

const rangeLabels = {
  '7': '7 days',
  '14': '14 days',
  '30': '30 days',
  '90': '90 days',
  '365': '1 year',
};

const yearRanges = new Set(['365']);
const allowedCoinIds = new Set(Object.keys(coinNames));
const allowedRanges = new Set(Object.keys(rangeLabels));
const allowedChartTypes = new Set(['line', 'bar', 'area', 'mixed']);

const historyCache = new Map();
let cryptoChart = null;
let activeChartType = 'line';
let renderQueued = false;

const formatDate = timestamp => new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const isoDateKey = timestamp => new Date(timestamp).toISOString().slice(0, 10);

const colorWithAlpha = (color, alpha) => {
  if (typeof color !== 'string') return `rgba(255, 255, 255, ${alpha})`;

  if (color.startsWith('rgba(')) {
    const [red, green, blue] = color
      .replace('rgba(', '')
      .replace(')', '')
      .split(',')
      .slice(0, 3)
      .map(part => Number.parseFloat(part.trim()));

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (color.startsWith('rgb(')) {
    const [red, green, blue] = color
      .replace('rgb(', '')
      .replace(')', '')
      .split(',')
      .map(part => Number.parseFloat(part.trim()));

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (color.startsWith('#') && color.length === 7) {
    const hex = color.slice(1);
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return `rgba(255, 255, 255, ${alpha})`;
};

const buildDataset = (data, label, color, fill = false, type = 'line') => ({
  label,
  data,
  borderColor: color,
  backgroundColor: fill ? colorWithAlpha(color, 0.18) : colorWithAlpha(color, 0.12),
  fill,
  tension: 0,
  pointRadius: 0,
  borderWidth: 2,
  spanGaps: type !== 'bar',
  type,
});

const getRangeLabel = days => rangeLabels[days] ?? `${days} days`;
const updateStatus = message => { statusText.textContent = message; };

const setTheme = theme => {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggle.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
  localStorage.setItem('siteTheme', theme);
};

const toggleTheme = () => {
  const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
};

const getSelectedCoins = () => Array.from(coinCheckboxes)
  .filter(checkbox => checkbox.checked && allowedCoinIds.has(checkbox.value))
  .map(checkbox => checkbox.value);

async function fetchCryptoHistory(coinId, days) {
  const validatedCoinId = allowedCoinIds.has(coinId) ? coinId : 'bitcoin';
  const validatedDays = allowedRanges.has(days) ? days : '30';
  const cacheKey = `${validatedCoinId}:${validatedDays}`;

  if (historyCache.has(cacheKey)) {
    return historyCache.get(cacheKey);
  }

  const url = new URL(`https://api.coingecko.com/api/v3/coins/${validatedCoinId}/market_chart`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('interval', 'daily');
  url.searchParams.set('days', validatedDays);

  const response = await fetch(url.href);
  if (!response.ok) throw new Error('Unable to load market data');

  const data = await response.json();
  historyCache.set(cacheKey, data);
  return data;
}

function createChart(datasets, days, selectedCoins = []) {
  if (cryptoChart) {
    cryptoChart.destroy();
    cryptoChart = null;
  }

  const yearRangeTicks = { '365': 12 };
  const isYearRange = yearRanges.has(days);
  const monthCount = isYearRange ? yearRangeTicks[days] : undefined;
  const legendTextColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#f4f4f8';

  cryptoChart = new Chart(chartCanvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'right',
          align: 'start',
          labels: {
            color: legendTextColor,
            boxWidth: 12,
            padding: 14,
            usePointStyle: true,
            generateLabels: () => selectedCoins.map((coinId, index) => ({
              text: coinNames[coinId] ?? coinId,
              fillStyle: coinColors[coinId] ?? '#bbb',
              strokeStyle: coinColors[coinId] ?? '#bbb',
              fontColor: legendTextColor,
              hidden: false,
              datasetIndex: index,
              index,
              pointStyle: 'circle',
            })),
          },
          onClick: () => {},
        },
        tooltip: {
          backgroundColor: '#2a0d0d',
          titleColor: '#fff',
          bodyColor: '#ffdddd',
          borderColor: '#ff5555',
          borderWidth: 1,
          callbacks: {
            label: context => {
              const value = context.parsed.y;
              return context.dataset.label && typeof value === 'number'
                ? `${context.dataset.label}: $${value.toLocaleString()}`
                : context.dataset.label || '';
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: isYearRange ? 'month' : 'day',
            tooltipFormat: 'MMM dd, yyyy',
            displayFormats: { month: 'MMM yyyy', day: 'MMM d' },
            unitStepSize: isYearRange ? 1 : undefined,
            stepSize: isYearRange ? 1 : undefined,
          },
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#d8a8a8',
            autoSkip: false,
            maxTicksLimit: isYearRange ? monthCount : 18,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: '#d8a8a8', callback: value => `$${value.toLocaleString()}` },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
      },
      layout: { padding: { right: 24 } },
    },
  });
}

function getChartTypeSettings(type, coinsData) {
  return coinsData.flatMap(({ coinId, prices, volumes }) => {
    const entries = [];

    if (type === 'line' || type === 'area' || type === 'mixed') {
      entries.push(buildDataset(prices, `${coinNames[coinId]} (Price)`, coinColors[coinId], type !== 'line', 'line'));
    }

    if (type === 'bar' || type === 'mixed') {
      entries.push(buildDataset(volumes, `${coinNames[coinId]} (Volume)`, coinColors[coinId], false, 'bar'));
    }

    return entries;
  });
}

function buildSampleCoinData(coinId, baseDates) {
  const priceMap = {
    bitcoin: [36000, 37000, 36250, 37900, 38400, 39800, 39100],
    ethereum: [2200, 2250, 2180, 2320, 2400, 2480, 2420],
    cardano: [0.38, 0.41, 0.4, 0.44, 0.47, 0.5, 0.52],
    binancecoin: [320, 330, 325, 338, 345, 352, 350],
    solana: [110, 118, 120, 126, 132, 138, 140],
  };

  const volumeMap = {
    bitcoin: [30, 27, 34, 38, 41, 39, 45],
    ethereum: [25, 22, 28, 32, 35, 38, 40],
    cardano: [16, 18, 17, 21, 24, 25, 27],
    binancecoin: [12, 14, 13, 15, 18, 19, 20],
    solana: [20, 24, 27, 30, 31, 35, 36],
  };

  return {
    coinId,
    prices: priceMap[coinId].map((value, index) => ({ x: baseDates[index], y: value })),
    volumes: volumeMap[coinId].map((value, index) => ({ x: baseDates[index], y: value })),
  };
}

async function renderChart() {
  const selectedCoins = getSelectedCoins();
  const days = rangeSelect.value;
  const validatedDays = allowedRanges.has(days) ? days : '30';
  const rangeLabel = getRangeLabel(validatedDays);

  updateStatus('Loading chart data...');

  try {
    if (!selectedCoins.length) {
      createChart([], validatedDays, []);
      chartSummary.textContent = '';
      selectedCoinsDisplay.textContent = 'Selected: None';
      updateStatus('No cryptocurrency selected.');
      return;
    }

    const allData = await Promise.all(
      selectedCoins.map(async coinId => {
        const history = await fetchCryptoHistory(coinId, validatedDays);

        return {
          coinId,
          prices: history.prices.map(([timestamp, value]) => ({ x: isoDateKey(timestamp), y: Number(value.toFixed(2)) })),
          volumes: history.total_volumes.map(([timestamp, value]) => ({ x: isoDateKey(timestamp), y: Number((value / 1_000_000).toFixed(2)) })),
        };
      })
    );

    const lastDate = allData.reduce((last, current) => {
      const maxPoint = current.prices[current.prices.length - 1];
      return maxPoint && maxPoint.x > last ? maxPoint.x : last;
    }, '');

    const lastDateLabel = lastDate ? formatDate(lastDate) : 'latest data';
    const datasets = getChartTypeSettings(activeChartType, allData);
    const coinList = selectedCoins.map(coinId => coinNames[coinId]).join(', ');

    createChart(datasets, validatedDays, selectedCoins);
    chartSummary.textContent = `${coinList} · ${rangeLabel} · ${lastDateLabel}`;
    selectedCoinsDisplay.textContent = `Selected: ${coinList}`;
    updateStatus(`${coinList} · ${rangeLabel} market history updated.`);
  } catch (error) {
    console.error(error);
    updateStatus('Unable to fetch crypto data. Showing sample data instead.');

    const sampleBaseDates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];
    const fallbackCoins = selectedCoins.length ? selectedCoins : ['bitcoin'];
    const sampleCoinsData = fallbackCoins.map(coinId => buildSampleCoinData(coinId, sampleBaseDates));
    const coinList = fallbackCoins.map(coinId => coinNames[coinId]).join(', ');

    createChart(getChartTypeSettings(activeChartType, sampleCoinsData), validatedDays, fallbackCoins);
    chartSummary.textContent = `Sample data · ${rangeLabel}`;
    selectedCoinsDisplay.textContent = `Selected: ${coinList}`;
  }
}

function scheduleRender() {
  if (renderQueued) return;

  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderChart();
  });
}

chartButtons.forEach(button => {
  button.addEventListener('click', () => {
    chartButtons.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeChartType = allowedChartTypes.has(button.dataset.type) ? button.dataset.type : 'line';
    scheduleRender();
  });
});

coinCheckboxes.forEach(checkbox => checkbox.addEventListener('change', scheduleRender));
rangeSelect.addEventListener('change', scheduleRender);
themeToggle.addEventListener('click', toggleTheme);

const initialTheme = localStorage.getItem('siteTheme') || 'dark';
setTheme(initialTheme);
renderChart();
