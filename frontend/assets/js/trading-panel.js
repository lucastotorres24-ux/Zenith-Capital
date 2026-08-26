// Lógica del panel de trading estilo IQ Option (trading-panel.html):
// gráfico de velas con datos históricos reales de CoinGecko + operaciones
// Sube/Baja de tiempo corto sobre el mismo balance de cuenta que el resto
// de la plataforma.

// Mismo criterio que el ticker del dashboard, pero sin monedas estables
// (tether/usd-coin) — en una apuesta Sube/Baja un activo que casi no se
// mueve solo produce empates. Lista amplia (igual que una plataforma real
// con muchas opciones para estudiar) pero sin nada de relleno: todas son
// criptomonedas reales y conocidas, con precio real de CoinGecko.
const CRYPTO_META = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  binancecoin: { symbol: 'BNB', name: 'BNB' },
  solana: { symbol: 'SOL', name: 'Solana' },
  ripple: { symbol: 'XRP', name: 'XRP' },
  cardano: { symbol: 'ADA', name: 'Cardano' },
  dogecoin: { symbol: 'DOGE', name: 'Dogecoin' },
  polkadot: { symbol: 'DOT', name: 'Polkadot' },
  chainlink: { symbol: 'LINK', name: 'Chainlink' },
  'avalanche-2': { symbol: 'AVAX', name: 'Avalanche' },
  litecoin: { symbol: 'LTC', name: 'Litecoin' },
  tron: { symbol: 'TRX', name: 'TRON' },
  'bitcoin-cash': { symbol: 'BCH', name: 'Bitcoin Cash' },
  'polygon-ecosystem-token': { symbol: 'POL', name: 'Polygon' },
  toncoin: { symbol: 'TON', name: 'Toncoin' },
  'shiba-inu': { symbol: 'SHIB', name: 'Shiba Inu' },
  uniswap: { symbol: 'UNI', name: 'Uniswap' },
  stellar: { symbol: 'XLM', name: 'Stellar' },
  cosmos: { symbol: 'ATOM', name: 'Cosmos' },
  near: { symbol: 'NEAR', name: 'NEAR Protocol' },
  'internet-computer': { symbol: 'ICP', name: 'Internet Computer' },
  filecoin: { symbol: 'FIL', name: 'Filecoin' },
  'hedera-hashgraph': { symbol: 'HBAR', name: 'Hedera' },
  vechain: { symbol: 'VET', name: 'VeChain' },
  algorand: { symbol: 'ALGO', name: 'Algorand' },
  aptos: { symbol: 'APT', name: 'Aptos' },
  sui: { symbol: 'SUI', name: 'Sui' },
  arbitrum: { symbol: 'ARB', name: 'Arbitrum' },
  optimism: { symbol: 'OP', name: 'Optimism' },
  'injective-protocol': { symbol: 'INJ', name: 'Injective' },
  'the-graph': { symbol: 'GRT', name: 'The Graph' },
  aave: { symbol: 'AAVE', name: 'Aave' },
  'render-token': { symbol: 'RENDER', name: 'Render' },
  pepe: { symbol: 'PEPE', name: 'Pepe' },
  bonk: { symbol: 'BONK', name: 'Bonk' },
  'the-sandbox': { symbol: 'SAND', name: 'The Sandbox' },
  decentraland: { symbol: 'MANA', name: 'Decentraland' },
};

// Metales reales (oro, plata, platino, paladio, cobre) vía gold-api.com —
// una API gratuita, sin llave, con precio real y en vivo (no de
// criptomonedas). Esta API no ofrece historial gratuito, así que el
// gráfico de velas de un metal se construye 100% en vivo, en tiempo real,
// a partir del momento en que se abre (ver loadMetalChartData más abajo) —
// nunca se inventa historial que no exista.
const METAL_META = {
  'metal-xau': { symbol: 'XAU', name: 'Oro', metalSymbol: 'XAU' },
  'metal-xag': { symbol: 'XAG', name: 'Plata', metalSymbol: 'XAG' },
  'metal-xpt': { symbol: 'XPT', name: 'Platino', metalSymbol: 'XPT' },
  'metal-xpd': { symbol: 'XPD', name: 'Paladio', metalSymbol: 'XPD' },
  'metal-cu': { symbol: 'XCU', name: 'Cobre', metalSymbol: 'HG' },
};

const PANEL_META = {};
Object.keys(CRYPTO_META).forEach((id) => { PANEL_META[id] = { ...CRYPTO_META[id], category: 'crypto' }; });
Object.keys(METAL_META).forEach((id) => { PANEL_META[id] = { ...METAL_META[id], category: 'metal' }; });
const PANEL_ASSETS = [...Object.keys(CRYPTO_META), ...Object.keys(METAL_META)];

const PRICE_POLL_MS = 5_000;
const CHART_REFRESH_MS = 60_000;
const PAYOUT_PERCENT = 85;

// Distintos plazos para estudiar el mismo activo, como en una plataforma
// real — CoinGecko elige solo el tamaño de vela según cuántos días se
// pidan, así que cada plazo trae velas de un tamaño distinto (más cortas
// en "1D", más largas en "1A"). No se inventa nada: todo sale de datos
// históricos reales.
const TIMEFRAME_CONFIG = {
  '1D': { days: 1, label: '1D' },
  '7D': { days: 7, label: '7D' },
  '1M': { days: 30, label: '1M' },
  '3M': { days: 90, label: '3M' },
  '1A': { days: 365, label: '1A' },
};
const CHART_TYPES = [
  { key: 'candles', label: 'Velas' },
  { key: 'line', label: 'Línea' },
  { key: 'area', label: 'Área' },
];

let accountsCache = [];
let optionsCache = [];
let activeOptions = []; // operaciones con status 'abierta', vistas por esta pantalla
let currentPrices = {};
let previousPrices = {};
let dayChangePercents = {};

let selectedAsset = 'bitcoin';
let selectedDuration = 60;
let selectedTimeframe = '1D';
let selectedChartType = 'candles';
let indicatorsOn = { sma: false, bb: false, volume: false, rsi: false };

let chart = null;
let priceSeries = null; // la serie principal (velas, línea o área, según selectedChartType)
let livePriceLine = null;
let volumeSeries = null;
let smaFastSeries = null;
let smaSlowSeries = null;
let bbUpperSeries = null;
let bbLowerSeries = null;
let rsiChart = null;
let rsiSeries = null;

let rawCandles = []; // últimas velas cargadas para el activo/plazo actual (con volumen ya emparejado)
let barDurationSeconds = 1800; // se recalcula con cada carga según el tamaño real de vela recibido

// Para metales: como no hay historial gratuito, las velas se acumulan en
// vivo aquí (por activo) mientras la pestaña esté abierta, para que si
// cambias a otro activo y vuelves, no se pierda lo ya construido.
let metalCandleCache = {};
const METAL_BAR_SECONDS = 30;

// Cuenta fallas seguidas al pedir el precio en vivo de cada metal a
// gold-api.com, para poder distinguir "todavía no ha llegado el primer
// precio" (normal, se resuelve solo en unos segundos) de "de verdad no se
// puede conectar" (por ejemplo sin internet, o la API caída) — este segundo
// caso antes fallaba en silencio total y dejaba el gráfico en blanco para
// siempre, sin ningún aviso, lo cual se ve exactamente como un error de la
// página aunque en realidad sea un problema de conexión con gold-api.com.
let metalFailStreak = {};
const METAL_FAIL_THRESHOLD = 3; // ~15 segundos de fallas seguidas (un ciclo de precio son 5s)

// Caché del histórico real ya traído por activo+plazo, para que volver a
// un activo que ya se visitó en esta sesión se vea al instante (en vez de
// esperar otra vez a CoinGecko) mientras se refresca en segundo plano.
// chartLoadToken evita el "medio bug" de una respuesta vieja llegando
// tarde y pisando a una más nueva cuando se cambia de activo rápido.
let cryptoCandleCache = {};
let chartLoadToken = 0;

let instrumentCategory = 'all'; // 'all' | 'crypto' | 'metal'
let instrumentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  renderInstrumentList();
  wireInstrumentControls();
  updatePanelChartTitle();
  wireDurationPills();
  wireDirectionButtons();
  document.getElementById('panel-amount').addEventListener('input', updatePayoutPreview);
  document.getElementById('panel-account').addEventListener('change', updateAccountAvailability);

  initChart();
  renderToolbar();
  updateToolbarForCategory();
  wireFullscreen();

  loadAccounts();
  loadOptionsHistory();
  loadChartData(selectedAsset, selectedTimeframe);
  pollPrices();

  updatePayoutPreview();

  setInterval(pollPrices, PRICE_POLL_MS);
  setInterval(() => loadChartData(selectedAsset, selectedTimeframe), CHART_REFRESH_MS);
  setInterval(tickActiveOptions, 1000);
});

// ---------------------------------------------------------------------
// Cabecera de usuario
// ---------------------------------------------------------------------

function renderUserChip() {
  const user = Api.getUser();
  const name = user?.username || 'Usuario';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-initial').textContent = name.charAt(0).toUpperCase();
}

function wireLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    Api.clearSession();
    window.location.href = 'index.html';
  });
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------

async function loadAccounts() {
  try {
    accountsCache = await Api.getAccounts();
    const select = document.getElementById('panel-account');
    const previousValue = select.value;
    select.innerHTML = accountsCache
      .map((a) => `<option value="${a.id}">${escapeHtml(a.walletName || a.accountNumber)} (${escapeHtml(a.accountNumber)}) · ${money(a.balance)}</option>`)
      .join('');
    if (previousValue && accountsCache.some((a) => String(a.id) === previousValue)) {
      select.value = previousValue;
    }
    updateAccountAvailability();
  } catch (err) {
    showToast(err.message, 'error');
    if (!Api.isLoggedIn()) window.location.href = 'index.html';
  }
}

// Si el usuario todavía no tiene ninguna cuenta creada, el selector de
// cuenta queda vacío y no hay nada que elegir — en vez de dejar el
// desplegable "muerto" sin explicación, se oculta y se muestra un aviso
// claro con un enlace para crear la primera cuenta.
//
// Si ya tiene cuenta pero esa cuenta todavía está en $0 (normal para una
// cuenta recién creada — el saldo lo asigna Zenith Capital después de
// confirmar un depósito, nunca el usuario), se muestra un aviso distinto
// de "no tienes saldo" en vez del de "crea una cuenta", porque el problema
// real no es la cuenta (ya existe) sino que todavía no tiene fondos. En
// ambos casos se deshabilita el resto del panel para no dejar intentar
// operar sin poder.
function updateAccountAvailability() {
  const hasAccounts = accountsCache.length > 0;
  const select = document.getElementById('panel-account');
  const selected = accountsCache.find((a) => String(a.id) === select.value) || accountsCache[0];
  const hasFunds = hasAccounts && Number(selected?.balance) > 0;

  document.getElementById('panel-no-accounts').classList.toggle('is-visible', !hasAccounts);
  document.getElementById('panel-no-funds').classList.toggle('is-visible', hasAccounts && !hasFunds);
  document.getElementById('panel-account-fields').style.display = hasAccounts ? 'block' : 'none';

  const canOperate = hasAccounts && hasFunds;
  document.getElementById('panel-amount').disabled = !canOperate;
  document.querySelectorAll('.duration-pill').forEach((btn) => { btn.disabled = !canOperate; });
  document.getElementById('btn-higher').disabled = !canOperate;
  document.getElementById('btn-lower').disabled = !canOperate;
}

// ---------------------------------------------------------------------
// Selector de activo: lista de instrumentos (buscador + categorías),
// como el panel "Instrumentos" de una plataforma de trading real —
// reemplaza las pestañas simples de antes ahora que hay muchos más
// activos (criptomonedas + metales) para que quepan cómodamente.
// ---------------------------------------------------------------------

function wireInstrumentControls() {
  document.getElementById('instrument-search').addEventListener('input', (e) => {
    instrumentSearch = e.target.value;
    renderInstrumentList();
  });

  document.querySelectorAll('.instrument-category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      instrumentCategory = btn.dataset.category;
      document.querySelectorAll('.instrument-category-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderInstrumentList();
    });
  });
}

function renderInstrumentList() {
  const container = document.getElementById('instrument-list');
  const term = instrumentSearch.trim().toLowerCase();

  const filtered = PANEL_ASSETS.filter((id) => {
    const meta = PANEL_META[id];
    if (instrumentCategory !== 'all' && meta.category !== instrumentCategory) return false;
    if (!term) return true;
    return meta.symbol.toLowerCase().includes(term) || meta.name.toLowerCase().includes(term);
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="instrument-list-empty">Ningún activo coincide con tu búsqueda.</div>';
    return;
  }

  container.innerHTML = filtered.map((id) => {
    const meta = PANEL_META[id];
    return `
      <button type="button" class="instrument-row ${id === selectedAsset ? 'is-active' : ''}" data-asset="${id}">
        <span class="instrument-row-icon is-${meta.category}">${meta.symbol.charAt(0)}</span>
        <span class="instrument-row-name">
          <strong>${meta.symbol}</strong>
          <small>${escapeHtml(meta.name)}</small>
        </span>
        <span class="instrument-row-price">
          <strong id="instrument-price-${id}">—</strong>
          <span class="instrument-row-change is-flat" id="instrument-change-${id}">·</span>
        </span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.instrument-row').forEach((btn) => {
    btn.addEventListener('click', () => selectAsset(btn.dataset.asset));
  });

  updateInstrumentPrices();
}

function selectAsset(assetId) {
  if (assetId === selectedAsset || !PANEL_META[assetId]) return;
  selectedAsset = assetId;

  document.querySelectorAll('.instrument-row').forEach((b) => b.classList.toggle('is-active', b.dataset.asset === assetId));
  updatePanelChartTitle();
  updatePriceDisplay();
  updateToolbarForCategory();
  // Importante: se limpia el gráfico ANTES de pedir el historial nuevo, no
  // después. Si no se hace así, mientras se espera la respuesta (o si esa
  // respuesta falla), el precio en vivo del activo recién elegido puede
  // llegar por otro lado (el ticker de precios, que no depende del gráfico)
  // y terminar mezclado con las velas viejas del activo anterior — eso era
  // el "medio bug" reportado: números de un activo y velas de otro a la vez.
  resetChartDisplay();
  updateLivePriceLine();
  loadChartData(selectedAsset, selectedTimeframe);
}

function updatePanelChartTitle() {
  const meta = PANEL_META[selectedAsset];
  const iconEl = document.getElementById('panel-chart-icon');
  iconEl.textContent = meta.symbol.charAt(0);
  iconEl.className = `panel-chart-title-icon is-${meta.category}`;
  document.getElementById('panel-chart-name').textContent = meta.name;
  document.getElementById('panel-chart-symbol').textContent = meta.symbol;
}

// Actualiza el precio y el porcentaje de cambio (24h) de cada fila de la
// lista de instrumentos, para poder comparar de un vistazo cuál se está
// moviendo más sin tener que entrar uno por uno — igual que un watchlist
// real. Los metales no traen variación 24h (gold-api.com solo da el
// precio actual), así que ahí se muestra "—" en vez de inventar un número.
function updateInstrumentPrices() {
  PANEL_ASSETS.forEach((id) => {
    const price = currentPrices[id];
    const priceEl = document.getElementById(`instrument-price-${id}`);
    if (priceEl) priceEl.textContent = typeof price === 'number' ? money(price) : '—';

    const change = dayChangePercents[id];
    const changeEl = document.getElementById(`instrument-change-${id}`);
    if (!changeEl) return;
    changeEl.classList.remove('is-up', 'is-down', 'is-flat');
    if (typeof change !== 'number') {
      changeEl.classList.add('is-flat');
      changeEl.textContent = '—';
    } else if (change > 0.01) {
      changeEl.classList.add('is-up');
      changeEl.textContent = `+${change.toFixed(1)}%`;
    } else if (change < -0.01) {
      changeEl.classList.add('is-down');
      changeEl.textContent = `${change.toFixed(1)}%`;
    } else {
      changeEl.classList.add('is-flat');
      changeEl.textContent = '0.0%';
    }
  });
}

function wireDurationPills() {
  document.querySelectorAll('.duration-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDuration = Number(btn.dataset.seconds);
      document.querySelectorAll('.duration-pill').forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });
}

function updatePayoutPreview() {
  const amount = Number(document.getElementById('panel-amount').value) || 0;
  const gain = amount * (PAYOUT_PERCENT / 100);
  document.getElementById('panel-payout-amount').textContent = money(gain);
}

// ---------------------------------------------------------------------
// Gráfico de velas (lightweight-charts + histórico real de CoinGecko)
// ---------------------------------------------------------------------

let isHoveringChart = false;

function baseChartOptions(isLight) {
  return {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: isLight ? '#4c4b47' : '#c3c2b7',
    },
    grid: {
      vertLines: { color: isLight ? 'rgba(20,20,15,0.06)' : 'rgba(255,255,255,0.05)' },
      horzLines: { color: isLight ? 'rgba(20,20,15,0.06)' : 'rgba(255,255,255,0.05)' },
    },
    rightPriceScale: { borderColor: isLight ? 'rgba(20,20,15,0.12)' : 'rgba(255,255,255,0.10)' },
    timeScale: { borderColor: isLight ? 'rgba(20,20,15,0.12)' : 'rgba(255,255,255,0.10)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  };
}

function createPriceSeriesForType(type) {
  if (type === 'line') {
    return chart.addLineSeries({ color: '#3987e5', lineWidth: 2 });
  }
  if (type === 'area') {
    return chart.addAreaSeries({
      lineColor: '#3987e5',
      topColor: 'rgba(57,135,229,0.35)',
      bottomColor: 'rgba(57,135,229,0.02)',
      lineWidth: 2,
    });
  }
  return chart.addCandlestickSeries({
    upColor: '#0ca30c',
    downColor: '#e66767',
    borderVisible: false,
    wickUpColor: '#0ca30c',
    wickDownColor: '#e66767',
  });
}

function initChart() {
  const container = document.getElementById('panel-chart-container');

  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="empty-state"><div>No se pudo cargar el gráfico (librería no disponible). Los precios en vivo y las operaciones siguen funcionando normalmente.</div></div>';
    return;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const chartOptions = baseChartOptions(isLight);

  chart = LightweightCharts.createChart(container, chartOptions);
  priceSeries = createPriceSeriesForType(selectedChartType);

  volumeSeries = chart.addHistogramSeries({
    color: isLight ? 'rgba(76,75,71,0.35)' : 'rgba(195,194,183,0.28)',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  volumeSeries.applyOptions({ visible: !!indicatorsOn.volume });

  const rsiContainer = document.getElementById('panel-rsi-chart');
  if (rsiContainer) {
    rsiChart = LightweightCharts.createChart(rsiContainer, {
      ...chartOptions,
      timeScale: { ...chartOptions.timeScale, visible: false },
      handleScroll: false,
      handleScale: false,
    });
    rsiSeries = rsiChart.addLineSeries({ color: '#c98a3e', lineWidth: 2 });
    rsiSeries.createPriceLine({ price: 70, color: 'rgba(230,103,103,0.4)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    rsiSeries.createPriceLine({ price: 30, color: 'rgba(12,163,12,0.4)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });

    // Sincroniza el desplazamiento/zoom entre el gráfico principal y el de
    // RSI, como en una plataforma real con paneles apilados.
    let syncingRanges = false;
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncingRanges || !range || !rsiChart) return;
      syncingRanges = true;
      rsiChart.timeScale().setVisibleLogicalRange(range);
      syncingRanges = false;
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (syncingRanges || !range || !chart) return;
      syncingRanges = true;
      chart.timeScale().setVisibleLogicalRange(range);
      syncingRanges = false;
    });
  }

  wireCrosshair();

  const resize = () => {
    chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    if (rsiChart && rsiContainer) {
      rsiChart.applyOptions({ width: rsiContainer.clientWidth, height: rsiContainer.clientHeight });
    }
  };
  window.addEventListener('resize', resize);
  resize();
}

function renderPriceSeries() {
  if (!priceSeries || !rawCandles.length) return;
  if (selectedChartType === 'candles') {
    priceSeries.setData(rawCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
  } else {
    priceSeries.setData(rawCandles.map((c) => ({ time: c.time, value: c.close })));
  }
}

function renderVolumeSeries() {
  if (!volumeSeries || !rawCandles.length) return;
  volumeSeries.setData(rawCandles.map((c) => ({
    time: c.time,
    value: c.volume || 0,
    color: c.close >= c.open ? 'rgba(12,163,12,0.5)' : 'rgba(230,103,103,0.5)',
  })));
}

function setChartType(type) {
  if (!chart || type === selectedChartType) return;
  selectedChartType = type;
  document.querySelectorAll('#charttype-tabs .chart-tool-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.type === type));
  if (priceSeries) chart.removeSeries(priceSeries);
  priceSeries = createPriceSeriesForType(type);
  livePriceLine = null; // pertenecía a la serie anterior, que ya no existe
  renderPriceSeries();
  updateLivePriceLine();
}

function toggleIndicator(key) {
  indicatorsOn[key] = !indicatorsOn[key];
  document.querySelectorAll('#indicator-toggles .chart-tool-btn').forEach((b) => {
    if (b.dataset.indicator === key) b.classList.toggle('is-active', indicatorsOn[key]);
  });
  if (key === 'rsi') {
    const rsiPanel = document.getElementById('panel-rsi-container');
    rsiPanel.style.display = indicatorsOn.rsi ? 'block' : 'none';
    const rsiContainer = document.getElementById('panel-rsi-chart');
    if (rsiChart && rsiContainer) {
      setTimeout(() => rsiChart.applyOptions({ width: rsiContainer.clientWidth, height: rsiContainer.clientHeight }), 0);
    }
  }
  updateIndicatorSeries();
}

function renderToolbar() {
  const tfContainer = document.getElementById('timeframe-tabs');
  tfContainer.innerHTML = Object.keys(TIMEFRAME_CONFIG).map((key) => `
    <button type="button" class="chart-tool-btn ${key === selectedTimeframe ? 'is-active' : ''}" data-timeframe="${key}">${TIMEFRAME_CONFIG[key].label}</button>
  `).join('');
  tfContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.timeframe === selectedTimeframe) return;
      selectedTimeframe = btn.dataset.timeframe;
      tfContainer.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
      resetChartDisplay();
      loadChartData(selectedAsset, selectedTimeframe);
    });
  });

  const typeContainer = document.getElementById('charttype-tabs');
  typeContainer.innerHTML = CHART_TYPES.map((t) => `
    <button type="button" class="chart-tool-btn ${t.key === selectedChartType ? 'is-active' : ''}" data-type="${t.key}">${t.label}</button>
  `).join('');
  typeContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setChartType(btn.dataset.type));
  });

  const indicatorContainer = document.getElementById('indicator-toggles');
  const INDICATORS = [
    { key: 'sma', label: 'Medias móviles' },
    { key: 'bb', label: 'Bandas Bollinger' },
    { key: 'volume', label: 'Volumen' },
    { key: 'rsi', label: 'RSI' },
  ];
  indicatorContainer.innerHTML = INDICATORS.map((ind) => `
    <button type="button" class="chart-tool-btn ${indicatorsOn[ind.key] ? 'is-active' : ''}" data-indicator="${ind.key}">${ind.label}</button>
  `).join('');
  indicatorContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => toggleIndicator(btn.dataset.indicator));
  });
}

// Los metales (gold-api.com) no tienen historial gratuito ni volumen real,
// así que al elegir uno se deshabilitan los plazos (no hay nada distinto
// que traer) y el indicador de Volumen (no hay dato real que mostrar), y
// la nota bajo el gráfico explica por qué. Nada de esto se inventa: se
// deja claro qué es real y qué todavía no está disponible.
function updateToolbarForCategory() {
  const isMetal = PANEL_META[selectedAsset]?.category === 'metal';

  document.querySelectorAll('#timeframe-tabs button').forEach((b) => { b.disabled = isMetal; });

  const volBtn = document.querySelector('#indicator-toggles button[data-indicator="volume"]');
  if (volBtn) {
    volBtn.disabled = isMetal;
    if (isMetal && indicatorsOn.volume) {
      indicatorsOn.volume = false;
      volBtn.classList.remove('is-active');
      if (volumeSeries) volumeSeries.applyOptions({ visible: false });
    }
  }

  const note = document.getElementById('panel-chart-note');
  if (note) {
    note.textContent = isMetal
      ? 'Precio real y en vivo (gold-api.com) — este activo no tiene historial de velas gratuito disponible, así que el gráfico se construye en tiempo real desde el momento en que lo abres, y sigue acumulando mientras tengas la página abierta. El volumen no está disponible para metales. El precio de entrada/salida de cada operación sí es 100% real, igual que en criptomonedas.'
      : 'Velas con datos históricos reales de CoinGecko (puede tener algunos minutos u horas de rezago respecto al segundo exacto). La vela más reciente se actualiza en vivo con cada precio nuevo — no es una simulación aleatoria, se mueve con el precio real del mercado. El precio de entrada/salida de cada operación se toma del precio en vivo mostrado arriba a la derecha.';
  }
}

// ---------------------------------------------------------------------
// Indicadores técnicos (calculados en el navegador a partir de las velas
// reales ya cargadas — sin librerías externas de indicadores)
// ---------------------------------------------------------------------

function computeSMA(candles, period) {
  const result = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) result.push({ time: candles[i].time, value: sum / period });
  }
  return result;
}

function computeBollinger(candles, period, mult) {
  const upper = [];
  const lower = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((s, c) => s + c.close, 0) / period;
    const variance = slice.reduce((s, c) => s + (c.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push({ time: candles[i].time, value: mean + mult * sd });
    lower.push({ time: candles[i].time, value: mean - mult * sd });
  }
  return { upper, lower };
}

// RSI de Wilder (el estándar de la industria) — usa un promedio suavizado
// de ganancias/pérdidas en vez de un promedio simple.
function computeRSI(candles, period) {
  if (candles.length <= period) return [];
  const result = [];
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result.push({ time: candles[period].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[i].time, value: rsi });
  }
  return result;
}

function updateIndicatorSeries() {
  if (!chart || !rawCandles.length) return;

  if (indicatorsOn.sma) {
    const fast = computeSMA(rawCandles, 9);
    const slow = computeSMA(rawCandles, 21);
    if (!smaFastSeries) smaFastSeries = chart.addLineSeries({ color: '#3987e5', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    if (!smaSlowSeries) smaSlowSeries = chart.addLineSeries({ color: '#c98a3e', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    smaFastSeries.setData(fast);
    smaSlowSeries.setData(slow);
  } else {
    if (smaFastSeries) { chart.removeSeries(smaFastSeries); smaFastSeries = null; }
    if (smaSlowSeries) { chart.removeSeries(smaSlowSeries); smaSlowSeries = null; }
  }

  if (indicatorsOn.bb) {
    const { upper, lower } = computeBollinger(rawCandles, 20, 2);
    if (!bbUpperSeries) bbUpperSeries = chart.addLineSeries({ color: 'rgba(195,194,183,0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    if (!bbLowerSeries) bbLowerSeries = chart.addLineSeries({ color: 'rgba(195,194,183,0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    bbUpperSeries.setData(upper);
    bbLowerSeries.setData(lower);
  } else {
    if (bbUpperSeries) { chart.removeSeries(bbUpperSeries); bbUpperSeries = null; }
    if (bbLowerSeries) { chart.removeSeries(bbLowerSeries); bbLowerSeries = null; }
  }

  if (volumeSeries) volumeSeries.applyOptions({ visible: !!indicatorsOn.volume });

  if (indicatorsOn.rsi && rsiSeries) {
    rsiSeries.setData(computeRSI(rawCandles, 14));
  }
}

// ---------------------------------------------------------------------
// Barra Apertura/Máximo/Mínimo/Cierre/Volumen (al pasar el mouse, o la
// vela más reciente cuando no se está pasando el mouse por el gráfico)
// ---------------------------------------------------------------------

function setOhlcBar(open, high, low, close, volume) {
  const openEl = document.getElementById('ohlc-open');
  if (!openEl) return;
  document.getElementById('ohlc-high').textContent = money(high);
  document.getElementById('ohlc-low').textContent = money(low);
  const closeEl = document.getElementById('ohlc-close');
  openEl.textContent = money(open);
  closeEl.textContent = money(close);
  document.getElementById('ohlc-volume').textContent = typeof volume === 'number'
    ? volume.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—';

  closeEl.classList.remove('is-up', 'is-down');
  closeEl.classList.add(close >= open ? 'is-up' : 'is-down');
}

function showLastCandleOhlc() {
  if (!rawCandles.length) return;
  const last = rawCandles[rawCandles.length - 1];
  setOhlcBar(last.open, last.high, last.low, last.close, last.volume || 0);
}

function findVolumeAt(time) {
  const match = rawCandles.find((c) => c.time === time);
  return match ? match.volume || 0 : null;
}

function wireCrosshair() {
  if (!chart) return;
  chart.subscribeCrosshairMove((param) => {
    if (!priceSeries) return;
    const data = param && param.time && param.seriesData ? param.seriesData.get(priceSeries) : null;
    if (!data) {
      isHoveringChart = false;
      showLastCandleOhlc();
      return;
    }
    isHoveringChart = true;
    if (typeof data.open === 'number') {
      setOhlcBar(data.open, data.high, data.low, data.close, findVolumeAt(param.time));
    } else if (typeof data.value === 'number') {
      setOhlcBar(data.value, data.value, data.value, data.value, findVolumeAt(param.time));
    }
  });
}

function wireFullscreen() {
  const btn = document.getElementById('chart-fullscreen-btn');
  const card = document.getElementById('panel-chart-card');
  if (!btn || !card) return;

  const applyResize = () => {
    const container = document.getElementById('panel-chart-container');
    if (chart && container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    const rsiContainer = document.getElementById('panel-rsi-chart');
    if (rsiChart && rsiContainer) rsiChart.applyOptions({ width: rsiContainer.clientWidth, height: rsiContainer.clientHeight });
  };

  btn.addEventListener('click', () => {
    card.classList.toggle('is-fullscreen');
    btn.textContent = card.classList.contains('is-fullscreen') ? '✕' : '⛶';
    btn.title = card.classList.contains('is-fullscreen') ? 'Salir de pantalla completa' : 'Pantalla completa';
    setTimeout(applyResize, 50);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && card.classList.contains('is-fullscreen')) {
      card.classList.remove('is-fullscreen');
      btn.textContent = '⛶';
      btn.title = 'Pantalla completa';
      setTimeout(applyResize, 50);
    }
  });
}

// ---------------------------------------------------------------------
// Vela en vivo: la última vela se mueve con cada precio nuevo (no es una
// simulación aleatoria), y cuando pasa el tiempo de una vela completa
// (según el plazo elegido) se abre una vela nueva — igual que en una
// plataforma real.
// ---------------------------------------------------------------------

// Acumula una vela en vivo para un metal en su caché propia (independiente
// de cuál esté seleccionado en pantalla), para que el historial construido
// en vivo no se pierda al cambiar de activo y volver.
function accumulateMetalCandle(assetId, price) {
  if (typeof price !== 'number') return;
  if (!metalCandleCache[assetId]) metalCandleCache[assetId] = { candles: [], barDurationSeconds: METAL_BAR_SECONDS };
  const entry = metalCandleCache[assetId];
  const nowSec = Math.floor(Date.now() / 1000);
  const last = entry.candles[entry.candles.length - 1];

  if (!last) {
    entry.candles.push({ time: nowSec, open: price, high: price, low: price, close: price, volume: 0 });
  } else if (nowSec - last.time >= entry.barDurationSeconds) {
    entry.candles.push({ time: last.time + entry.barDurationSeconds, open: price, high: price, low: price, close: price, volume: 0 });
    if (entry.candles.length > 300) entry.candles.shift();
  } else {
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
  }
}

function updateLiveCandle(assetId, price) {
  if (typeof price !== 'number') return;
  const meta = PANEL_META[assetId];

  if (meta && meta.category === 'metal') {
    accumulateMetalCandle(assetId, price);
    if (assetId !== selectedAsset) return; // sigue acumulando en segundo plano, pero no hay nada que dibujar
    rawCandles = metalCandleCache[assetId].candles;
    barDurationSeconds = metalCandleCache[assetId].barDurationSeconds;
  } else {
    if (assetId !== selectedAsset || !rawCandles.length) return;
    const last = rawCandles[rawCandles.length - 1];
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - last.time >= barDurationSeconds) {
      rawCandles.push({ time: last.time + barDurationSeconds, open: price, high: price, low: price, close: price, volume: 0 });
    } else {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
    }
  }

  if (!priceSeries || !rawCandles.length) return;
  const current = rawCandles[rawCandles.length - 1];
  if (selectedChartType === 'candles') {
    priceSeries.update({ time: current.time, open: current.open, high: current.high, low: current.low, close: current.close });
  } else {
    priceSeries.update({ time: current.time, value: current.close });
  }

  if (volumeSeries) {
    volumeSeries.update({
      time: current.time,
      value: current.volume || 0,
      color: current.close >= current.open ? 'rgba(12,163,12,0.5)' : 'rgba(230,103,103,0.5)',
    });
  }

  updateIndicatorSeries();
  if (!isHoveringChart) showLastCandleOhlc();
}

function showChartLoading(visible, text) {
  const overlay = document.getElementById('chart-loading-overlay');
  if (!overlay) return;
  overlay.classList.toggle('is-visible', visible);
  if (visible && text) document.getElementById('chart-loading-text').textContent = text;
}

function showChartError(visible, text) {
  const overlay = document.getElementById('chart-error-overlay');
  if (!overlay) return;
  overlay.classList.toggle('is-visible', visible);
  if (visible && text) document.getElementById('chart-error-text').textContent = text;
}

function clearOhlcBar() {
  const openEl = document.getElementById('ohlc-open');
  if (!openEl) return;
  openEl.textContent = '—';
  document.getElementById('ohlc-high').textContent = '—';
  document.getElementById('ohlc-low').textContent = '—';
  document.getElementById('ohlc-close').textContent = '—';
  document.getElementById('ohlc-close').classList.remove('is-up', 'is-down');
  document.getElementById('ohlc-volume').textContent = '—';
}

// Deja el gráfico completamente en blanco (velas, volumen, indicadores y la
// barra OHLC) antes de pedir el historial de un activo o plazo nuevo. Es la
// pieza clave para que nunca se vea, ni por un instante, una mezcla de datos
// de dos activos distintos: mientras el gráfico está en blanco, el "ticker"
// en vivo (que sigue funcionando todo el tiempo, cada 5 segundos) no tiene
// ninguna vela vieja a la cual pegarle el precio nuevo por error.
function resetChartDisplay() {
  rawCandles = [];
  showChartError(false);
  showChartLoading(false);
  if (priceSeries) priceSeries.setData([]);
  if (volumeSeries) volumeSeries.setData([]);
  if (smaFastSeries) smaFastSeries.setData([]);
  if (smaSlowSeries) smaSlowSeries.setData([]);
  if (bbUpperSeries) bbUpperSeries.setData([]);
  if (bbLowerSeries) bbLowerSeries.setData([]);
  if (rsiSeries) rsiSeries.setData([]);
  clearOhlcBar();
}

function renderActiveCandles() {
  renderPriceSeries();
  renderVolumeSeries();
  updateIndicatorSeries();
  if (chart) chart.timeScale().fitContent();
  if (rsiChart) rsiChart.timeScale().fitContent();
  if (!isHoveringChart) showLastCandleOhlc();
}

// Los metales no tienen historial gratuito (ver nota arriba de METAL_META):
// no hay nada que "cargar" — solo se muestra lo que ya se haya acumulado en
// vivo para ese activo. Si todavía no hay ninguna vela (primera vez que se
// abre este metal en la sesión, o gold-api.com no ha respondido todavía),
// en vez de dejar el gráfico completamente en blanco sin ninguna
// explicación (lo cual se puede confundir fácilmente con "esto está roto"),
// se muestra el mismo aviso de "cargando" que usan las criptomonedas, con
// un texto propio, hasta que llegue el primer precio real.
function loadMetalChartData(assetId) {
  if (!priceSeries) return;
  if (!metalCandleCache[assetId]) metalCandleCache[assetId] = { candles: [], barDurationSeconds: METAL_BAR_SECONDS };

  rawCandles = metalCandleCache[assetId].candles;
  barDurationSeconds = metalCandleCache[assetId].barDurationSeconds;
  renderActiveCandles();
  updateMetalConnectionState();
}

function updateMetalConnectionState() {
  if (PANEL_META[selectedAsset]?.category !== 'metal') return;
  const hasData = (metalCandleCache[selectedAsset]?.candles.length || 0) > 0;
  const failing = (metalFailStreak[selectedAsset] || 0) >= METAL_FAIL_THRESHOLD;

  if (hasData) {
    showChartLoading(false);
    showChartError(false);
    return;
  }
  if (failing) {
    showChartLoading(false);
    showChartError(true, 'No se pudo conectar con el precio en vivo de este metal (gold-api.com). Revisa tu conexión e intenta de nuevo.');
  } else {
    showChartError(false);
    showChartLoading(true, 'Conectando con el precio en vivo…');
  }
}

// chartLoadToken evita el "medio bug" de cambiar de activo rápido: si dos
// cargas quedan en el aire a la vez (por ejemplo, click en BTC y enseguida
// en ETH), la respuesta de la más vieja ya no puede pisar a la más nueva
// aunque llegue después por la red — solo se aplica si su token todavía es
// el más reciente en el momento en que responde.
async function loadChartData(assetId, timeframeKey) {
  if (!priceSeries) return;
  if (PANEL_META[assetId]?.category === 'metal') {
    chartLoadToken += 1; // invalida cualquier carga de cripto que siga en el aire
    showChartLoading(false); // los metales no usan el overlay: nunca hay pedido de red que esperar
    loadMetalChartData(assetId);
    return;
  }

  const myToken = ++chartLoadToken;
  const cacheKey = `${assetId}:${timeframeKey}`;
  const cached = cryptoCandleCache[cacheKey];

  // Si ya se visitó este activo/plazo en esta sesión, se muestra al
  // instante con lo que ya se tiene mientras se refresca en segundo plano
  // — así cambiar de activo no se siente "colgado" esperando a CoinGecko.
  if (cached) {
    rawCandles = cached.candles;
    barDurationSeconds = cached.barDurationSeconds;
    renderActiveCandles();
  } else {
    showChartLoading(true);
  }
  showChartError(false);

  const timeframe = TIMEFRAME_CONFIG[timeframeKey] || TIMEFRAME_CONFIG['1D'];

  // Hasta 3 intentos (el original + 2 reintentos) antes de rendirse: una
  // sola falla de red (muy posible contra la API gratuita de CoinGecko) no
  // debería dejar al usuario con el gráfico vacío para siempre ni obligarlo
  // a adivinar que tiene que cambiar de activo y volver para reintentar.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Si mientras tanto el usuario ya cambió de activo/plazo, esta carga ya
    // no importa — se corta acá y la más nueva (con su propio token) sigue.
    if (myToken !== chartLoadToken) return;

    try {
      const [ohlcRes, volRes] = await Promise.all([
        fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${assetId}/ohlc?vs_currency=usd&days=${timeframe.days}`, {}, 9000),
        fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${assetId}/market_chart?vs_currency=usd&days=${timeframe.days}`, {}, 9000),
      ]);
      if (!ohlcRes.ok) throw new Error('No se pudo obtener el histórico');
      const rawOhlc = await ohlcRes.json();
      const rawVolumes = volRes.ok ? ((await volRes.json()).total_volumes || []) : [];

      const candles = rawOhlc
        .map(([timestampMs, open, high, low, close]) => ({
          time: Math.floor(timestampMs / 1000),
          open,
          high,
          low,
          close,
        }))
        .sort((a, b) => a.time - b.time);

      // CoinGecko a veces repite el timestamp del último punto entre llamadas;
      // el gráfico necesita tiempos estrictamente ascendentes.
      const deduped = [];
      candles.forEach((c) => {
        if (deduped.length && deduped[deduped.length - 1].time === c.time) {
          deduped[deduped.length - 1] = c;
        } else {
          deduped.push(c);
        }
      });

      if (deduped.length < 2) throw new Error('Historial insuficiente');

      // Tamaño real de cada vela para este plazo (mediana de los espacios
      // entre velas), usado para saber cuándo debe abrirse una vela nueva
      // en vivo según el plazo elegido.
      const gaps = [];
      for (let i = 1; i < deduped.length; i++) gaps.push(deduped[i].time - deduped[i - 1].time);
      gaps.sort((a, b) => a - b);
      const freshBarDuration = gaps[Math.floor(gaps.length / 2)] || 1800;

      // Empareja cada vela con su volumen real (dato independiente de CoinGecko),
      // sumando los puntos de volumen que caen dentro del rango de tiempo de esa vela.
      const volPoints = rawVolumes
        .map(([ts, vol]) => ({ time: Math.floor(ts / 1000), volume: vol }))
        .sort((a, b) => a.time - b.time);
      let vIdx = 0;
      deduped.forEach((c, i) => {
        const bucketEnd = i + 1 < deduped.length ? deduped[i + 1].time : c.time + freshBarDuration;
        let sum = 0;
        let found = false;
        while (vIdx < volPoints.length && volPoints[vIdx].time < bucketEnd) {
          if (volPoints[vIdx].time >= c.time) { sum += volPoints[vIdx].volume; found = true; }
          vIdx++;
        }
        c.volume = found ? sum : 0;
      });

      cryptoCandleCache[cacheKey] = { candles: deduped, barDurationSeconds: freshBarDuration };

      // Si mientras esperábamos la respuesta el usuario ya cambió de activo,
      // de plazo, o disparó otra carga más nueva, esta respuesta llegó tarde
      // — se guarda igual en caché (para la próxima vez) pero no se dibuja.
      if (myToken !== chartLoadToken) return;
      if (assetId !== selectedAsset || timeframeKey !== selectedTimeframe) return;

      rawCandles = deduped;
      barDurationSeconds = freshBarDuration;
      renderActiveCandles();
      showChartLoading(false);
      return; // éxito — no hace falta reintentar
    } catch (err) {
      if (myToken !== chartLoadToken) return; // el usuario ya se fue a otro activo, no vale la pena seguir
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      // Se agotaron los intentos: se avisa con un mensaje claro y un botón
      // de Reintentar en vez de dejar el gráfico en blanco sin explicación
      // (el precio en vivo y las operaciones siguen funcionando igual,
      // porque no dependen del histórico del gráfico).
      showChartLoading(false);
      if (!cached) showChartError(true);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const retryBtn = document.getElementById('chart-error-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      showChartError(false);
      if (PANEL_META[selectedAsset]?.category === 'metal') {
        // Los metales no tienen un "historial" que recargar — lo que hace
        // falta es un intento nuevo de precio en vivo ya mismo, en vez de
        // esperar hasta el próximo ciclo de 5 segundos.
        metalFailStreak[selectedAsset] = 0;
        showChartLoading(true, 'Conectando con el precio en vivo…');
        pollPrices();
      } else {
        loadChartData(selectedAsset, selectedTimeframe);
      }
    });
  }
});

// ---------------------------------------------------------------------
// Precio en vivo: criptomonedas por CoinGecko (simple/price, un solo
// pedido para todas), metales por gold-api.com (un pedido por metal —
// esa API no ofrece un endpoint combinado, pero es gratuita y sin límite
// de peticiones para precio en vivo).
// ---------------------------------------------------------------------

async function fetchCryptoPrices(ids) {
  if (!ids.length) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error('No se pudo obtener precios');
  return res.json();
}

async function fetchMetalPrice(id) {
  try {
    const res = await fetchWithTimeout(`https://api.gold-api.com/price/${PANEL_META[id].metalSymbol}`, {}, 8000);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (typeof data.price !== 'number') throw new Error('precio inválido');
    metalFailStreak[id] = 0;
    return data.price;
  } catch {
    metalFailStreak[id] = (metalFailStreak[id] || 0) + 1;
    return null;
  }
}

async function pollPrices() {
  const cryptoIds = PANEL_ASSETS.filter((id) => PANEL_META[id].category === 'crypto');
  const metalIds = PANEL_ASSETS.filter((id) => PANEL_META[id].category === 'metal');

  try {
    const [cryptoData, metalPrices] = await Promise.all([
      fetchCryptoPrices(cryptoIds),
      Promise.all(metalIds.map((id) => fetchMetalPrice(id))),
    ]);

    cryptoIds.forEach((id) => {
      const entry = cryptoData[id];
      if (!entry) return;
      previousPrices[id] = currentPrices[id];
      currentPrices[id] = entry.usd;
      dayChangePercents[id] = entry.usd_24h_change ?? 0;
    });

    metalIds.forEach((id, i) => {
      const price = metalPrices[i];
      if (typeof price !== 'number') return;
      previousPrices[id] = currentPrices[id];
      currentPrices[id] = price;
      // gold-api.com no da variación 24h — se deja sin dato (la lista y el
      // encabezado muestran "—" en vez de inventar un porcentaje).
    });

    updatePriceDisplay();
    updateLivePriceLine();
    updateInstrumentPrices();

    // Los metales acumulan su vela en vivo siempre, esté o no seleccionado
    // ese activo en pantalla en este momento (así no se pierde tiempo si
    // el usuario cambia a un metal más tarde en la sesión).
    metalIds.forEach((id) => updateLiveCandle(id, currentPrices[id]));
    if (PANEL_META[selectedAsset]?.category !== 'metal') {
      updateLiveCandle(selectedAsset, currentPrices[selectedAsset]);
    }
    // Revisa si el metal seleccionado (si hay uno) sigue "conectando", ya
    // se conectó, o de plano no se pudo conectar tras varios intentos.
    updateMetalConnectionState();
  } catch (err) {
    // Silencioso: se reintenta en el próximo ciclo.
  }
}

function updatePriceDisplay() {
  const price = currentPrices[selectedAsset];
  const change = dayChangePercents[selectedAsset];
  const valueEl = document.getElementById('panel-price-value');
  const changeEl = document.getElementById('panel-price-change');

  valueEl.textContent = typeof price === 'number' ? money(price) : '—';

  changeEl.classList.remove('is-up', 'is-down', 'is-flat');
  if (typeof change !== 'number') {
    changeEl.classList.add('is-flat');
    changeEl.textContent = 'cambio 24h no disponible';
  } else if (change > 0) {
    changeEl.classList.add('is-up');
    changeEl.textContent = `▲ ${change.toFixed(2)}% (24h)`;
  } else if (change < 0) {
    changeEl.classList.add('is-down');
    changeEl.textContent = `▼ ${Math.abs(change).toFixed(2)}% (24h)`;
  } else {
    changeEl.classList.add('is-flat');
    changeEl.textContent = 'sin cambio (24h)';
  }
}

function updateLivePriceLine() {
  if (!priceSeries) return;
  const price = currentPrices[selectedAsset];
  if (typeof price !== 'number') return;

  if (livePriceLine) {
    priceSeries.removePriceLine(livePriceLine);
  }
  livePriceLine = priceSeries.createPriceLine({
    price,
    color: '#3987e5',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: true,
    title: 'en vivo',
  });
}

// ---------------------------------------------------------------------
// Abrir operaciones Sube / Baja
// ---------------------------------------------------------------------

function wireDirectionButtons() {
  document.getElementById('btn-higher').addEventListener('click', () => openOption('higher'));
  document.getElementById('btn-lower').addEventListener('click', () => openOption('lower'));
}

function showOrderError(message) {
  document.getElementById('panel-order-error-text').textContent = message;
  document.getElementById('panel-order-error').classList.add('is-visible');
}
function hideOrderError() {
  document.getElementById('panel-order-error').classList.remove('is-visible');
}

async function openOption(direction) {
  hideOrderError();

  const accountId = Number(document.getElementById('panel-account').value);
  const amount = Number(document.getElementById('panel-amount').value);
  const entryPrice = currentPrices[selectedAsset];
  const meta = PANEL_META[selectedAsset];

  if (!accountId) return showOrderError('Crea o selecciona una cuenta antes de operar.');
  if (!amount || amount <= 0) return showOrderError('Ingresa un monto válido.');
  if (typeof entryPrice !== 'number') return showOrderError('Todavía no hay precio disponible para este activo — espera unos segundos.');

  const account = accountsCache.find((a) => a.id === accountId);
  if (account && amount > account.balance) return showOrderError('No tienes saldo suficiente en esta cuenta.');

  const higherBtn = document.getElementById('btn-higher');
  const lowerBtn = document.getElementById('btn-lower');
  higherBtn.disabled = true;
  lowerBtn.disabled = true;

  try {
    const { option } = await Api.openOption({
      accountId,
      asset: selectedAsset,
      symbol: meta.symbol,
      direction,
      amount,
      entryPrice,
      durationSeconds: selectedDuration,
    });

    activeOptions.push(option);
    renderActiveOptions();
    loadAccounts();
    showToast(`Operación abierta: ${direction === 'higher' ? 'COMPRA' : 'VENDE'} ${meta.symbol} por ${money(amount)}`, 'success');
  } catch (err) {
    showOrderError(err.message);
  } finally {
    higherBtn.disabled = false;
    lowerBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------
// Operaciones en curso: cuenta regresiva + liquidación automática
// ---------------------------------------------------------------------

function renderActiveOptions() {
  const list = document.getElementById('active-options-list');
  const empty = document.getElementById('active-options-empty');

  const open = activeOptions.filter((o) => o.status === 'abierta');

  if (open.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = open
    .map((o) => {
      const meta = PANEL_META[o.asset] || { name: o.symbol, symbol: o.symbol };
      const remaining = new Date(o.expiresAt).getTime() - Date.now();
      const settling = remaining <= 0;
      return `
        <div class="active-option-card">
          <div class="active-option-meta">
            <span class="active-option-asset">${o.direction === 'higher' ? '▲' : '▼'} ${escapeHtml(meta.symbol)}</span>
            <span class="active-option-detail">${money(o.amount)} · entrada ${money(o.entryPrice)}</span>
          </div>
          <div class="active-option-timer ${settling ? 'is-settling' : ''}">
            ${settling ? 'Liquidando…' : formatCountdown(remaining)}
          </div>
        </div>
      `;
    })
    .join('');
}

function tickActiveOptions() {
  renderActiveOptions();

  activeOptions
    .filter((o) => o.status === 'abierta' && !o._resolving)
    .forEach((o) => {
      const remaining = new Date(o.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        o._resolving = true;
        resolveOptionNow(o);
      }
    });
}

async function resolveOptionNow(option) {
  const exitPrice = currentPrices[option.asset];

  // Si por alguna razón todavía no tenemos un precio en caché (poco probable
  // porque se actualiza cada pocos segundos), se pide uno puntual.
  const finalExitPrice = typeof exitPrice === 'number' ? exitPrice : await fetchSinglePrice(option.asset);
  if (typeof finalExitPrice !== 'number') {
    // No se pudo obtener precio: se reintenta en el próximo tick.
    option._resolving = false;
    return;
  }

  try {
    const { option: resolved } = await Api.resolveOption(option.id, { exitPrice: finalExitPrice });

    activeOptions = activeOptions.filter((o) => o.id !== option.id);
    renderActiveOptions();
    loadAccounts();
    loadOptionsHistory();

    const meta = PANEL_META[resolved.asset] || { symbol: resolved.symbol };
    if (resolved.status === 'ganada') {
      showToast(`¡Ganaste! ${meta.symbol} — +${money(resolved.profit)} (recibiste ${money(resolved.amount + resolved.profit)})`, 'success');
    } else if (resolved.status === 'perdida') {
      showToast(`No acertaste esta vez: ${meta.symbol} — ${money(resolved.profit)}`, 'error');
    } else {
      showToast(`Empate en ${meta.symbol}: se te devolvió tu monto.`, 'info');
    }
  } catch (err) {
    option._resolving = false;
    showToast(`No se pudo liquidar una operación: ${err.message}`, 'error');
  }
}

async function fetchSinglePrice(assetId) {
  const meta = PANEL_META[assetId];
  if (meta && meta.category === 'metal') return fetchMetalPrice(assetId);
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    return data[assetId]?.usd ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Historial de operaciones
// ---------------------------------------------------------------------

async function loadOptionsHistory() {
  try {
    optionsCache = await Api.getOptions();

    // Recupera operaciones que quedaron abiertas de una sesión anterior
    // (por ejemplo, si se cerró la pestaña antes de que venciera el tiempo)
    // para que su cuenta regresiva/legalización se retome en esta pantalla.
    const stillOpen = optionsCache.filter((o) => o.status === 'abierta');
    stillOpen.forEach((o) => {
      if (!activeOptions.some((a) => a.id === o.id)) {
        activeOptions.push(o);
      }
    });
    renderActiveOptions();

    renderOptionsHistory(optionsCache);
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del panel.
  }
}

function optionStatusLabel(status) {
  const labels = {
    abierta: 'En curso',
    ganada: 'Ganada',
    perdida: 'Perdida',
    empate: 'Empate',
  };
  return labels[status] || status;
}

function renderOptionsHistory(options) {
  const body = document.getElementById('options-body');
  const empty = document.getElementById('options-empty');
  const table = document.getElementById('options-table');

  body.innerHTML = '';

  if (options.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  options.forEach((o) => {
    const meta = PANEL_META[o.asset] || { name: o.symbol, symbol: o.symbol };
    const pl = o.profit;
    const plUp = typeof pl === 'number' && pl > 0;
    const plDown = typeof pl === 'number' && pl < 0;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(o.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${escapeHtml(meta.name)} (${escapeHtml(meta.symbol)})</td>
      <td>${o.direction === 'higher' ? '▲ Compra' : '▼ Vende'}</td>
      <td style="text-align:right;">${money(o.amount)}</td>
      <td style="text-align:right;">${money(o.entryPrice)}</td>
      <td style="text-align:right;">${typeof o.exitPrice === 'number' ? money(o.exitPrice) : '—'}</td>
      <td style="text-align:right; color:${plUp ? 'var(--good)' : plDown ? 'var(--critical)' : 'var(--text-muted)'}">
        ${typeof pl === 'number' ? `${plUp ? '+' : ''}${money(pl)}` : '—'}
      </td>
      <td style="text-align:right;"><span class="badge badge-${o.status}">${optionStatusLabel(o.status)}</span></td>
    `;
    body.appendChild(row);
  });
}
