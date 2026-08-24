// Lógica del panel de trading estilo IQ Option (trading-panel.html):
// gráfico de velas con datos históricos reales de CoinGecko + operaciones
// Sube/Baja de tiempo corto sobre el mismo balance de cuenta que el resto
// de la plataforma.

// Mismo criterio que el ticker del dashboard, pero sin monedas estables
// (tether) — en una apuesta Sube/Baja un activo que casi no se mueve solo
// produce empates. Incluye oro tokenizado (PAX Gold) como opción no-cripto.
const PANEL_ASSETS = [
  'bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple',
  'cardano', 'dogecoin', 'polkadot', 'chainlink', 'avalanche-2',
  'litecoin', 'tron', 'bitcoin-cash', 'pax-gold',
];
const PANEL_META = {
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
  'pax-gold': { symbol: 'PAXG', name: 'Oro (PAX Gold)' },
};

const PRICE_POLL_MS = 8_000;
const CHART_REFRESH_MS = 60_000;
const PAYOUT_PERCENT = 85;

let accountsCache = [];
let optionsCache = [];
let activeOptions = []; // operaciones con status 'abierta', vistas por esta pantalla
let currentPrices = {};
let previousPrices = {};
let dayChangePercents = {};

let selectedAsset = 'bitcoin';
let selectedDuration = 60;

let chart = null;
let candleSeries = null;
let livePriceLine = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  renderAssetTabs();
  wireDurationPills();
  wireDirectionButtons();
  document.getElementById('panel-amount').addEventListener('input', updatePayoutPreview);

  initChart();

  loadAccounts();
  loadOptionsHistory();
  loadChartData(selectedAsset);
  pollPrices();

  updatePayoutPreview();

  setInterval(pollPrices, PRICE_POLL_MS);
  setInterval(() => loadChartData(selectedAsset), CHART_REFRESH_MS);
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
      .map((a) => `<option value="${a.id}">${escapeHtml(a.accountNumber)} · ${money(a.balance)}</option>`)
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
// claro con un enlace para crear la primera cuenta, y se deshabilita el
// resto del panel de operación para que no se pueda intentar operar sin
// una cuenta.
function updateAccountAvailability() {
  const hasAccounts = accountsCache.length > 0;

  document.getElementById('panel-no-accounts').classList.toggle('is-visible', !hasAccounts);
  document.getElementById('panel-account-fields').style.display = hasAccounts ? 'block' : 'none';

  document.getElementById('panel-amount').disabled = !hasAccounts;
  document.querySelectorAll('.duration-pill').forEach((btn) => { btn.disabled = !hasAccounts; });
  document.getElementById('btn-higher').disabled = !hasAccounts;
  document.getElementById('btn-lower').disabled = !hasAccounts;
}

// ---------------------------------------------------------------------
// Selector de activo
// ---------------------------------------------------------------------

function renderAssetTabs() {
  const container = document.getElementById('asset-tabs');
  container.innerHTML = PANEL_ASSETS.map((id) => {
    const meta = PANEL_META[id];
    return `<button type="button" class="asset-tab ${id === selectedAsset ? 'is-active' : ''}" data-asset="${id}">${meta.symbol}</button>`;
  }).join('');

  container.querySelectorAll('.asset-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAsset = btn.dataset.asset;
      container.querySelectorAll('.asset-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      updatePriceDisplay();
      loadChartData(selectedAsset);
    });
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

function initChart() {
  const container = document.getElementById('panel-chart-container');

  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="empty-state"><div>No se pudo cargar el gráfico (librería no disponible). Los precios en vivo y las operaciones siguen funcionando normalmente.</div></div>';
    return;
  }

  chart = LightweightCharts.createChart(container, {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#c3c2b7',
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.05)' },
      horzLines: { color: 'rgba(255,255,255,0.05)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.10)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: '#0ca30c',
    downColor: '#e66767',
    borderVisible: false,
    wickUpColor: '#0ca30c',
    wickDownColor: '#e66767',
  });

  const resize = () => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
  window.addEventListener('resize', resize);
  resize();
}

async function loadChartData(assetId) {
  if (!candleSeries) return;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${assetId}/ohlc?vs_currency=usd&days=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo obtener el histórico');
    const raw = await res.json();

    const candles = raw
      .map(([timestampMs, open, high, low, close]) => ({
        time: Math.floor(timestampMs / 1000),
        open,
        high,
        low,
        close,
      }))
      .sort((a, b) => a.time - b.time);

    // CoinGecko a veces repite el timestamp del último punto entre llamadas;
    // el gráfico de velas necesita tiempos estrictamente ascendentes.
    const deduped = [];
    candles.forEach((c) => {
      if (deduped.length && deduped[deduped.length - 1].time === c.time) {
        deduped[deduped.length - 1] = c;
      } else {
        deduped.push(c);
      }
    });

    if (assetId !== selectedAsset) return; // el usuario ya cambió de activo mientras cargaba
    candleSeries.setData(deduped);
    chart.timeScale().fitContent();
  } catch (err) {
    // Silencioso: el precio en vivo y las operaciones no dependen del gráfico.
  }
}

// ---------------------------------------------------------------------
// Precio en vivo (CoinGecko simple/price, igual que el ticker del dashboard)
// ---------------------------------------------------------------------

async function pollPrices() {
  try {
    const ids = PANEL_ASSETS.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo obtener precios');
    const data = await res.json();

    PANEL_ASSETS.forEach((id) => {
      const entry = data[id];
      if (!entry) return;
      previousPrices[id] = currentPrices[id];
      currentPrices[id] = entry.usd;
      dayChangePercents[id] = entry.usd_24h_change ?? 0;
    });

    updatePriceDisplay();
    updateLivePriceLine();
  } catch (err) {
    // Silencioso: se reintenta en el próximo ciclo.
  }
}

function updatePriceDisplay() {
  const price = currentPrices[selectedAsset];
  const change = dayChangePercents[selectedAsset] ?? 0;
  const valueEl = document.getElementById('panel-price-value');
  const changeEl = document.getElementById('panel-price-change');

  valueEl.textContent = typeof price === 'number' ? money(price) : '—';

  changeEl.classList.remove('is-up', 'is-down', 'is-flat');
  if (change > 0) {
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
  if (!candleSeries) return;
  const price = currentPrices[selectedAsset];
  if (typeof price !== 'number') return;

  if (livePriceLine) {
    candleSeries.removePriceLine(livePriceLine);
  }
  livePriceLine = candleSeries.createPriceLine({
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
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`;
    const res = await fetch(url);
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
