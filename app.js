const coinCheckboxes = [...document.querySelectorAll('[name="coins"]')];
const rangeSelect = document.getElementById('rangeSelect');
const statusText = document.getElementById('statusText');
const chartSummary = document.getElementById('chartSummary');
const selectedCoinsDisplay = document.getElementById('selectedCoinsDisplay');
const chartCanvas = document.getElementById('cryptoChart');
const chartButtons = [...document.querySelectorAll('[data-type]')];
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
  7: '7 days',
  14: '14 days',
  30: '30 days',
  90: '90 days',
  365: '1 year',
};

const yearRangeTicks = { 365: 12 };
const allowedCoinIds = new Set(Object.keys(coinNames));
const allowedRanges = new Set(Object.keys(rangeLabels));
const allowedChartTypes = new Set(['line', 'bar', 'area', 'mixed']);
const defaultRange = '30';
const defaultCoin = 'bitcoin';
const sampleBaseDates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];

let cryptoChart = null;
let activeChartType = 'line';

const formatDate = timestamp => new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const isoDateKey = timestamp => new Date(timestamp).toISOString().slice(0, 10);
const normalizeRange = days => (allowedRanges.has(days) ? days : defaultRange);
const normalizeCoin = coinId => (allowedCoinIds.has(coinId) ? coinId : defaultCoin);
const getRangeLabel = days => rangeLabels[days] ?? `${days} days`;
const setStatus = message => { statusText.textContent = message; };

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

const toChartPoint = ([timestamp, value], scale = 1, precision = 2) => ({
  x: isoDateKey(timestamp),
  y: Number((value * scale).toFixed(precision)),
});

const setTheme = theme => {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  themeToggle.textContent = isLight ? 'Dark mode' : 'Light mode';
  localStorage.setItem('siteTheme', theme);
};

const toggleTheme = () => {
  const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
};

const getSelectedCoins = () => coinCheckboxes
  .filter(({ checked, value }) => checked && allowedCoinIds.has(value))
  .map(({ value }) => value);

async function fetchCryptoHistory(coinId, days) {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${normalizeCoin(coinId)}/market_chart`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('interval', 'daily');
  url.searchParams.set('days', normalizeRange(days));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load market data for ${coinId}`);
  return response.json();
}

function createChart(datasets, days, selectedCoins = []) {
  cryptoChart?.destroy();

  const isYearRange = days === '365';
  const monthCount = isYearRange ? yearRangeTicks[days] : undefined;
  const legendTextColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#f4f4f8';
  const mutedTextColor = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#d8a8a8';

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
            generateLabels: () => selectedCoins.map((coinId, index) => ({
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
            label: ({ dataset, parsed }) => {
              const value = parsed.y;
              return dataset.label && typeof value === 'number'
                ? `${dataset.label}: $${value.toLocaleString()}`
                : dataset.label || '';
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
            color: mutedTextColor,
            autoSkip: false,
            maxTicksLimit: isYearRange ? monthCount : 18,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: mutedTextColor, callback: value => `$${value.toLocaleString()}` },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
      },
      layout: { padding: { right: 24 } },
    },
  });
}

function getChartTypeSettings(type, coinsData) {
  return coinsData.flatMap(({ coinId, prices, volumes }) => {
    const labelPrefix = coinNames[coinId] ?? coinId;
    const datasets = [];

    if (type === 'line' || type === 'area' || type === 'mixed') {
      datasets.push(buildDataset(prices, `${labelPrefix} (Price)`, coinColors[coinId] ?? '#bbb', type !== 'line', 'line'));
    }

    if (type === 'bar' || type === 'mixed') {
      datasets.push(buildDataset(volumes, `${labelPrefix} (Volume)`, coinColors[coinId] ?? '#bbb', false, 'bar'));
    }

    return datasets;
  });
}

function buildSampleData(selectedCoins) {
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

  return sampleCoinsData;
}

async function renderChart() {
  const selectedCoins = getSelectedCoins();
  const days = normalizeRange(rangeSelect.value);
  const rangeLabel = getRangeLabel(days);

  setStatus('Loading chart data...');

  try {
    if (selectedCoins.length === 0) {
      createChart([], days);
      chartSummary.textContent = '';
      selectedCoinsDisplay.textContent = 'Selected: None';
      setStatus('No cryptocurrency selected.');
      return;
    }

    const allData = await Promise.all(
      selectedCoins.map(async coinId => {
        const history = await fetchCryptoHistory(coinId, days);
        return {
          coinId,
          prices: history.prices.map(entry => toChartPoint(entry)),
          volumes: history.total_volumes.map(entry => toChartPoint(entry, 1 / 1_000_000)),
        };
      })
    );

    const lastDate = allData.reduce((last, current) => {
      const maxPoint = current.prices[current.prices.length - 1];
      return maxPoint && maxPoint.x > last ? maxPoint.x : last;
    }, '');
    const lastDateLabel = lastDate ? formatDate(lastDate) : 'latest data';

    const coinList = selectedCoins.map(coinId => coinNames[coinId]).join(', ');
    const datasets = getChartTypeSettings(activeChartType, allData);

    createChart(datasets, days, selectedCoins);
    chartSummary.textContent = `${coinList} · ${rangeLabel} · ${lastDateLabel}`;
    selectedCoinsDisplay.textContent = `Selected: ${coinList}`;
    setStatus(`${coinList} · ${rangeLabel} market history updated.`);
  } catch (error) {
    console.error(error);
    setStatus('Unable to fetch crypto data. Showing sample data instead.');

    createChart(getChartTypeSettings(activeChartType, buildSampleData(selectedCoins)), '30');
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

setTheme(localStorage.getItem('siteTheme') || 'dark');
renderChart();
