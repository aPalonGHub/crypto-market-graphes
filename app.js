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

let cryptoChart = null;
let activeChartType = 'line';

const formatDate = timestamp => new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const isoDateKey = timestamp => new Date(timestamp).toISOString().slice(0, 10);

const buildDataset = (data, label, color, fill = false, type = 'line') => ({
  label,
  data,
  borderColor: color,
  backgroundColor: fill ? color.replace('1)', '0.18)') : color,
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
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${validatedCoinId}/market_chart`);

  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('interval', 'daily');
  url.searchParams.set('days', validatedDays);

  const response = await fetch(url.href);
  if (!response.ok) throw new Error('Unable to load market data');
  return response.json();
}

function createChart(datasets, days, selectedCoins = []) {
  if (cryptoChart) cryptoChart.destroy();

  const yearRangeTicks = { '365': 12 };
  const isYearRange = yearRanges.has(days);
  const monthCount = isYearRange ? yearRangeTicks[days] : undefined;

  const legendTextColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#f4f4f8';

  cryptoChart = new Chart(chartCanvas, {
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
            generateLabels: chart => selectedCoins.map((coinId, index) => ({
              text: coinNames[coinId] ?? coinId,
              fillStyle: coinColors[coinId] ?? '#bbb',
              strokeStyle: coinColors[coinId] ?? '#bbb',
              fontColor: legendTextColor,
              hidden: false,
              datasetIndex: 0,
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

async function renderChart() {
  const selectedCoins = getSelectedCoins();
  const days = rangeSelect.value;
  const validatedDays = allowedRanges.has(days) ? days : '30';
  const rangeLabel = getRangeLabel(validatedDays);

  updateStatus('Loading chart data...');

  try {
    if (selectedCoins.length === 0) {
      createChart([], validatedDays);
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
    createChart(datasets, validatedDays, selectedCoins);

    const coinList = selectedCoins.map(c => coinNames[c]).join(', ');
    chartSummary.textContent = `${coinList} · ${rangeLabel} · ${lastDateLabel}`;
    selectedCoinsDisplay.textContent = `Selected: ${coinList}`;
    updateStatus(`${coinList} · ${rangeLabel} market history updated.`);
  } catch (error) {
    console.error(error);
    updateStatus('Unable to fetch crypto data. Showing sample data instead.');

    const sampleBaseDates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];
    const sampleCoinsData = [
      {
        coinId: 'bitcoin',
        prices: [36000, 37000, 36250, 37900, 38400, 39800, 39100].map((value, index) => ({ x: sampleBaseDates[index], y: value })),
        volumes: [30, 27, 34, 38, 41, 39, 45].map((value, index) => ({ x: sampleBaseDates[index], y: value })),
      },
    ];

    if (selectedCoins.includes('ethereum')) {
      sampleCoinsData.push({
        coinId: 'ethereum',
        prices: [2200, 2250, 2180, 2320, 2400, 2480, 2420].map((value, index) => ({ x: sampleBaseDates[index], y: value })),
        volumes: [25, 22, 28, 32, 35, 38, 40].map((value, index) => ({ x: sampleBaseDates[index], y: value })),
      });
    }

    createChart(getChartTypeSettings(activeChartType, sampleCoinsData), '30');
    chartSummary.textContent = 'Sample data · recent 7 days';
  }
}

chartButtons.forEach(button => {
  button.addEventListener('click', () => {
    chartButtons.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeChartType = allowedChartTypes.has(button.dataset.type) ? button.dataset.type : 'line';
    renderChart();
  });
});

coinCheckboxes.forEach(checkbox => checkbox.addEventListener('change', renderChart));
rangeSelect.addEventListener('change', renderChart);
themeToggle.addEventListener('click', toggleTheme);

const initialTheme = localStorage.getItem('siteTheme') || 'dark';
setTheme(initialTheme);
renderChart();
