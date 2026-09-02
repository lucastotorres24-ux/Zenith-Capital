// Lógica del dashboard (dashboard.html): cuentas + ticker de cripto.

// Lista de activos disponibles para operar. Se amplió a pedido de Lucas
// para tener más opciones además de las 6 originales — incluye una entrada
// de oro tokenizado (PAX Gold, respaldado 1:1 por oro físico real) para
// quien quiera algo distinto a cripto.
const CRYPTO_IDS = [
  'bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'ripple',
  'cardano', 'dogecoin', 'polkadot', 'chainlink', 'avalanche-2',
  'litecoin', 'tron', 'bitcoin-cash', 'pax-gold',
];
const CRYPTO_META = {
  bitcoin: { symbol: 'BTC', name: 'Bitcoin' },
  ethereum: { symbol: 'ETH', name: 'Ethereum' },
  tether: { symbol: 'USDT', name: 'Tether' },
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
  // Zenith (ZNT): NO viene de CoinGecko (no está en CRYPTO_IDS, así que no
  // se pide como parte del fetch masivo de precios reales) — es la moneda
  // propia simulada de la plataforma, con su propio endpoint
  // (loadZenithTicker más abajo). Se agrega acá igual para que el resto del
  // código que ya sabe mostrar/operar cualquier activo (holdings, historial
  // de operaciones, modal de comprar/vender) funcione con ZNT sin cambios.
  zenith: { symbol: 'ZNT', name: 'Zenith' },
};
const TICKER_REFRESH_MS = 15_000;

// Símbolo de Binance para cada cripto (ver market-ws.js) — se usa para el
// precio en vivo por WebSocket, sin el límite de peticiones de CoinGecko.
// Tether (USDT) no tiene un par "USDT/USDT" en ningún exchange porque es
// la propia moneda de referencia — como está diseñada para valer siempre
// $1 (está respaldada 1 a 1), se muestra fija en $1.00 en vez de armar una
// fuente de datos aparte solo para una moneda que casi nunca se mueve.
const BINANCE_SYMBOL = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  binancecoin: 'BNBUSDT',
  solana: 'SOLUSDT',
  ripple: 'XRPUSDT',
  cardano: 'ADAUSDT',
  dogecoin: 'DOGEUSDT',
  polkadot: 'DOTUSDT',
  chainlink: 'LINKUSDT',
  'avalanche-2': 'AVAXUSDT',
  litecoin: 'LTCUSDT',
  tron: 'TRXUSDT',
  'bitcoin-cash': 'BCHUSDT',
  'pax-gold': 'PAXGUSDT',
};
const ASSET_ID_BY_BINANCE_SYMBOL = Object.fromEntries(
  Object.entries(BINANCE_SYMBOL).map(([id, symbol]) => [symbol, id])
);
const WS_TICKER_FRESH_MS = 20_000;
const wsTickerCache = {}; // Binance symbol -> { price, changePercent, at }
let latestTickerData = {}; // último dato completo mostrado en la tabla (por id de CoinGecko)
// El backend demora entre 1 y 2 minutos en aplicar de verdad lo que Lucas
// aprueba/edita desde el panel de administrador (revisión manual simulada
// — ver data/store.js), así que el dashboard vuelve a consultar cuentas,
// depósitos, retiros, posiciones y operaciones cada cierto tiempo para que
// ese cambio aparezca solo, sin que el usuario tenga que recargar la
// página a mano.
const OPERATIONAL_REFRESH_MS = 20_000;

// Insignias Zenith: el rango se calcula en vivo con lo que el cliente tiene
// invertido AHORA MISMO (balance de todas sus cuentas + valor de mercado de
// sus posiciones abiertas, con el precio en vivo del ticker) — puede subir
// o bajar con el tiempo, a diferencia de un total histórico. Los mismos
// umbrales existen del lado del backend (data/store.js) como una
// aproximación para proteger el acceso a la asesoría IA.
const RANK_TIERS = [
  { key: 'platino', label: 'Platino', min: 10000 },
  { key: 'diamante', label: 'Diamante', min: 5000 },
  { key: 'oro', label: 'Oro', min: 1500 },
  { key: 'plata', label: 'Plata', min: 800 },
  { key: 'bronce', label: 'Bronce', min: 250 },
];
// Desde qué rango se habilita la asesoría IA para automatizar inversiones.
const ADVISORY_MIN_RANK_KEY = 'diamante';

// Misma paleta que valida el backend (routes/accounts.js) — una lista
// cerrada de colores lindos para elegir, en vez de un selector de color
// libre que después el servidor podría rechazar o reemplazar por sorpresa.
const WALLET_COLORS = ['#3987e5', '#c98a3e', '#4fae5c', '#c65b8f', '#8a6fd1', '#e0574b', '#2fb7ad', '#b0a13a'];

let accountsCache = [];
let depositsCache = [];
let withdrawalsCache = [];
let holdingsCache = [];
let tradesCache = [];
let documentsCache = [];
let previousTickerPrices = {};
let currentPrices = {};
let tradeMode = 'buy';
let tradeAssetId = null;
let currentRank = null; // { key, label } | null

// Mismos 5 planes que planes.html (ver assets/js/planes.js) — se duplican
// acá solo para poder mostrar el nombre del plan en el Quick Ledger, igual
// que RANK_TIERS ya se duplica entre este archivo e insignias/planes.js.
const INVESTMENT_PLANS = [
  { key: 'bronce', label: 'Bronce', amount: 250 },
  { key: 'plata', label: 'Plata', amount: 800 },
  { key: 'oro', label: 'Oro', amount: 1500 },
  { key: 'diamante', label: 'Diamante', amount: 3000 },
  { key: 'rubi', label: 'Rubí', amount: 5000 },
];

// Se llena cuando la persona llega desde "Planes de Inversión" con un
// depósito ya elegido (ver handlePlanQueryParams) y se limpia apenas ese
// depósito se crea — ver handleDepositSubmit.
let pendingPlanTag = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  wireUserMenu();
  wireThemeToggle();
  if (typeof Currency !== 'undefined') {
    Currency.init();
    wireCurrencySelector();
  }
  wireModal();
  wireAdvisoryPanel();
  wireDepositModal();
  handlePlanQueryParams();
  wireWithdrawModal();
  wireTradeModal();
  wireProfileModal();
  wireHoldingDetailModal();
  wireZenithSection();

  loadAccounts();
  loadDeposits();
  loadWithdrawals();
  loadHoldings();
  loadTrades();
  loadTicker();
  loadZenithTicker();
  wireLiveTickerStream();
  // El ticker de cripto pide a CoinGecko, que tiene un límite de
  // peticiones gratuitas por minuto — si la pestaña del dashboard queda
  // abierta en segundo plano (otra pestaña, minimizada) sin que nadie la
  // mire, seguir pidiendo cada 15s solo gasta parte de ese límite sin
  // necesidad, lo cual después se nota como mala "conectividad" cuando sí
  // se está usando la página (acá o en el panel de trading). Se retoma de
  // inmediato al volver a la pestaña.
  setInterval(() => { if (!document.hidden) loadTicker(); }, TICKER_REFRESH_MS);
  setInterval(loadZenithTicker, TICKER_REFRESH_MS);
  setInterval(() => {
    loadAccounts();
    loadDeposits();
    loadWithdrawals();
    loadHoldings();
    loadTrades();
  }, OPERATIONAL_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadTicker();
  });
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

// ---------------------------------------------------------------------
// Insignias Zenith (Bronce/Plata/Oro/Diamante/Platino)
// ---------------------------------------------------------------------

function getRankForAmount(amount) {
  return RANK_TIERS.find((t) => amount >= t.min) || null;
}

// Lo que el cliente tiene invertido ahora mismo: balance de todas sus
// cuentas + valor de mercado de sus posiciones abiertas (con el precio en
// vivo del ticker si ya llegó; si no, usa el precio promedio de compra
// como aproximación mientras tanto).
function computeInvestedTotal() {
  const balanceTotal = accountsCache.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const holdingsTotal = holdingsCache.reduce((sum, h) => {
    const price = typeof currentPrices[h.asset] === 'number' ? currentPrices[h.asset] : h.avgPrice;
    return sum + Number(h.quantity || 0) * Number(price || 0);
  }, 0);
  return balanceTotal + holdingsTotal;
}

function updateRankBadge() {
  const total = computeInvestedTotal();
  currentRank = getRankForAmount(total);

  const badgeEl = document.getElementById('rank-badge');
  const avatarEl = document.getElementById('user-initial');
  const allRankClasses = RANK_TIERS.map((t) => `rank-${t.key}`);

  if (badgeEl) {
    badgeEl.classList.remove(...allRankClasses);
    if (currentRank) {
      badgeEl.textContent = `★ Zenith ${currentRank.label}`;
      badgeEl.classList.add(`rank-${currentRank.key}`);
    } else {
      badgeEl.textContent = '★ Zenith Investor';
    }
  }
  if (avatarEl) {
    avatarEl.classList.remove(...allRankClasses);
    if (currentRank) avatarEl.classList.add(`rank-${currentRank.key}`);
  }

  updateAdvisoryVisibility();
}

function wireLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    Api.clearSession();
    window.location.href = 'index.html';
  });
}

// ---------------------------------------------------------------------
// Modo claro/oscuro — el switch vive en el menú de usuario (junto a "Mi
// perfil" y "Cerrar sesión", como pidió Lucas). El tema en sí se aplica
// con [data-theme] en <html> y se guarda en localStorage, así que se
// respeta en todas las páginas (un script chiquito al inicio del <head>
// de cada una lo aplica antes de pintar, para que no haya parpadeo).
// ---------------------------------------------------------------------

const THEME_KEY = 'zenith_theme';

function wireThemeToggle() {
  const toggle = document.getElementById('theme-switch');
  if (!toggle) return;
  const icon = document.getElementById('theme-toggle-icon');

  function syncSwitch() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    toggle.setAttribute('aria-checked', String(isDark));
    if (icon) icon.textContent = isDark ? '🌙' : '☀️';
  }

  toggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const next = isDark ? 'light' : 'dark';
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      // Sin localStorage (modo privado, etc.) el tema simplemente no
      // persiste entre visitas — no debe romper el resto de la página.
    }
    syncSwitch();
  });

  syncSwitch();
}

// Selector de moneda local (para depósitos y retiros): se llena con las
// monedas que soporta Currency, arranca en la que se detectó/guardó, y al
// cambiarla actualiza en vivo las etiquetas de los modales de
// depósito/retiro (ver refreshCurrencyLabels).
function wireCurrencySelector() {
  const select = document.getElementById('currency-select');
  if (!select || typeof Currency === 'undefined') return;

  select.innerHTML = Currency.SUPPORTED
    .map((code) => `<option value="${code}">${escapeHtml(Currency.labelFor(code))}</option>`)
    .join('');
  select.value = Currency.getCode();

  select.addEventListener('change', () => {
    Currency.setCode(select.value);
  });

  document.addEventListener('zenith-currency-ready', () => {
    select.value = Currency.getCode();
    refreshCurrencyLabels();
  });
  document.addEventListener('zenith-currency-changed', () => {
    select.value = Currency.getCode();
    refreshCurrencyLabels();
  });

  refreshCurrencyLabels();
}

// Actualiza los textos de moneda en los modales de depósito/retiro y
// vuelve a pintar las tablas de historial (montos guardados siempre en
// USD) en la moneda que la persona haya elegido.
function refreshCurrencyLabels() {
  if (typeof Currency === 'undefined') return;
  const code = Currency.getCode();

  const depositCurrencyEl = document.getElementById('deposit-amount-currency');
  if (depositCurrencyEl) depositCurrencyEl.textContent = code;
  const withdrawCurrencyEl = document.getElementById('withdraw-amount-currency');
  if (withdrawCurrencyEl) withdrawCurrencyEl.textContent = code;

  if (depositsCache.length) renderDeposits(depositsCache);
  if (withdrawalsCache.length) renderWithdrawals(withdrawalsCache);
}

// Menú desplegable del usuario (topbar): agrupa "Cambiar contraseña",
// "Cerrar sesión" y cualquier ajuste futuro bajo un solo botón — el
// chip con el nombre/inicial de quien inició sesión.
function wireUserMenu() {
  const menu = document.getElementById('user-menu');
  const trigger = document.getElementById('user-menu-trigger');
  const dropdown = document.getElementById('user-menu-dropdown');
  if (!menu || !trigger || !dropdown) return;

  function openMenu() {
    dropdown.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    dropdown.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Cierra al hacer click en un ítem del menú (cambiar contraseña abre su
  // propio modal aparte, y cerrar sesión redirige — en ambos casos el
  // menú no debe quedar abierto).
  dropdown.querySelectorAll('.user-menu-item').forEach((item) => {
    item.addEventListener('click', () => closeMenu());
  });

  // Cierra al hacer click fuera del menú.
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) closeMenu();
  });

  // Cierra con la tecla Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

// ---------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------

// Códigos como "USDT" no son una moneda ISO real (no tienen símbolo,
// decimales estándar, etc. según el navegador) — pedirle a
// toLocaleString que formatee "como moneda" con uno de esos códigos
// hace que directamente falle con un error, lo que antes rompía la
// tarjeta entera de una billetera en cripto. Con las monedas ISO reales
// (USD, EUR, ARS, etc.) se sigue usando el formato bonito con su
// símbolo; para cualquier código que el navegador no reconozca, se cae
// a mostrar el número con el código al lado (ej. "1,234.50 USDT").
function money(value, currency = 'USD') {
  const n = Number(value) || 0;
  try {
    return n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
  } catch (e) {
    return `${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${currency}`;
  }
}

function compactMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
}

// Número de referencia "de vitrina" para comprobantes de depósito/retiro:
// se ve como parte de un sistema con miles de registros, en vez de mostrar
// el ID secuencial interno (1, 2, 3...) de la base de datos.
function randomReference() {
  const n = Math.floor(112125 + Math.random() * (999999 - 112125));
  return n.toLocaleString('es-ES');
}

// Formatea un monto de depósito/retiro (SIEMPRE guardado en USD en el
// backend) en la moneda local que la persona eligió, si el módulo Currency
// ya está disponible/listo; si no, cae de vuelta a USD sin romper nada.
function fundingMoney(usdAmount) {
  if (typeof Currency !== 'undefined') return Currency.format(usdAmount);
  return money(usdAmount);
}

// Valida que lo que escribió la persona en un campo de monto sea un número
// real y positivo (rechaza vacío, texto, negativos, cero, Infinity/NaN)
// antes de dejarla enviar el formulario de depósito/retiro.
function isValidMoneyAmount(rawValue) {
  if (rawValue === null || rawValue === undefined) return false;
  const trimmed = String(rawValue).trim();
  if (trimmed === '') return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0;
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------------------------------------------------------------------
// Cuentas: carga + stat tiles + tarjetas
// ---------------------------------------------------------------------

async function loadAccounts() {
  try {
    accountsCache = await Api.getAccounts();
    renderStatTiles(accountsCache);
    renderAccounts(accountsCache);
    updateRankBadge();
    renderQuickLedger();
  } catch (err) {
    showToast(err.message, 'error');
    if (!Api.isLoggedIn()) {
      window.location.href = 'index.html';
    }
  }
}

function renderStatTiles(accounts) {
  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalEquity = accounts.reduce((sum, a) => sum + Number(a.equity), 0);
  const totalPl = totalEquity - totalBalance;

  document.getElementById('stat-balance').textContent = money(totalBalance);
  document.getElementById('stat-equity').textContent = money(totalEquity);
  document.getElementById('stat-count').textContent = String(accounts.length);

  const plEl = document.getElementById('stat-pl');
  const plDelta = document.getElementById('stat-pl-delta');
  plEl.textContent = money(totalPl);

  plDelta.classList.remove('is-up', 'is-down', 'is-flat');
  if (totalPl > 0) {
    plDelta.classList.add('is-up');
    plDelta.textContent = `▲ favorable`;
  } else if (totalPl < 0) {
    plDelta.classList.add('is-down');
    plDelta.textContent = `▼ en contra`;
  } else {
    plDelta.classList.add('is-flat');
    plDelta.textContent = 'sin cambios';
  }
}

function renderAccounts(accounts) {
  const grid = document.getElementById('accounts-grid');
  const empty = document.getElementById('accounts-empty');

  grid.innerHTML = '';

  if (accounts.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  accounts.forEach((account) => {
    const pl = Number(account.equity) - Number(account.balance);
    const plUp = pl > 0;
    const plDown = pl < 0;
    const walletColor = account.walletColor || '#3987e5';
    const walletName = account.walletName || 'Mi Billetera';

    const card = document.createElement('div');
    card.className = 'account-card';
    card.style.setProperty('--wallet-color', walletColor);
    card.innerHTML = `
      <div class="account-card-top">
        <span class="wallet-dot" style="background:${walletColor}"></span>
        <div class="wallet-title">
          <span class="wallet-name">${escapeHtml(walletName)}</span>
        </div>
      </div>
      <div class="account-metrics">
        <div class="account-metric">
          <div class="label">Balance</div>
          <div class="value">${money(account.balance, account.currency)}</div>
        </div>
        <div class="account-metric">
          <div class="label">Equity</div>
          <div class="value">${money(account.equity, account.currency)}</div>
        </div>
        <div class="account-metric">
          <div class="label">Apalancamiento</div>
          <div class="value">${escapeHtml(account.leverage)}</div>
        </div>
        <div class="account-metric">
          <div class="label">P/L flotante</div>
          <div class="account-pl" style="color:${plUp ? 'var(--good)' : plDown ? 'var(--critical)' : 'var(--text-muted)'}">
            ${plUp ? '▲' : plDown ? '▼' : '—'} ${money(pl, account.currency)}
          </div>
        </div>
      </div>
      ${account.walletLink ? `
      <div class="wallet-link-chip" data-action="copy-link" data-link="${escapeHtml(account.walletLink)}" title="Copiar enlace de la billetera">
        <span>🔗 ${escapeHtml(account.walletLink)}</span>
      </div>` : ''}
      <div class="account-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${account.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${account.id}">Eliminar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(Number(btn.dataset.id)));
  });
  grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(Number(btn.dataset.id)));
  });
  grid.querySelectorAll('[data-action="copy-link"]').forEach((chip) => {
    chip.addEventListener('click', () => copyWalletLink(chip.dataset.link));
  });
}

async function copyWalletLink(link) {
  try {
    await navigator.clipboard.writeText(link);
    showToast('Enlace de la billetera copiado', 'success');
  } catch {
    showToast('No se pudo copiar el enlace — cópialo manualmente', 'error');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

async function handleDelete(id) {
  const account = accountsCache.find((a) => a.id === id);
  if (!account) return;

  const confirmed = window.confirm(`¿Eliminar la billetera "${account.walletName || 'Mi Billetera'}"? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  try {
    await Api.deleteAccount(id);
    showToast('Billetera eliminada', 'success');
    loadAccounts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------------------------------------------------------------------
// Modal crear/editar billetera
// ---------------------------------------------------------------------

let selectedWalletColor = WALLET_COLORS[0];

function renderWalletColorPicker() {
  const picker = document.getElementById('wallet-color-picker');
  picker.innerHTML = WALLET_COLORS.map((color) => `
    <button type="button" class="wallet-color-swatch ${color === selectedWalletColor ? 'is-selected' : ''}" data-color="${color}" style="background:${color}" aria-label="Elegir color ${color}"></button>
  `).join('');
  picker.querySelectorAll('.wallet-color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedWalletColor = btn.dataset.color;
      document.getElementById('wallet-color').value = selectedWalletColor;
      picker.querySelectorAll('.wallet-color-swatch').forEach((b) => b.classList.toggle('is-selected', b === btn));
    });
  });
}

function wireModal() {
  const overlay = document.getElementById('account-modal');
  const form = document.getElementById('account-form');

  document.getElementById('open-create-account').addEventListener('click', () => openCreateModal());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.getElementById('wallet-link-copy').addEventListener('click', () => {
    copyWalletLink(document.getElementById('wallet-link').value);
  });

  form.addEventListener('submit', handleAccountSubmit);
}

function openCreateModal() {
  document.getElementById('modal-title').textContent = 'Nueva billetera';
  document.getElementById('account-id').value = '';
  document.getElementById('account-form').reset();
  document.getElementById('wallet-name').value = 'Mi Billetera';
  selectedWalletColor = WALLET_COLORS[0];
  document.getElementById('wallet-color').value = selectedWalletColor;
  renderWalletColorPicker();
  // El enlace de la billetera se genera solo al crearla — todavía no existe.
  document.getElementById('wallet-link-field').style.display = 'none';
  // El balance y equity de una billetera nueva siempre empiezan en 0 — solo
  // Zenith Capital puede asignar saldo, desde el panel de administrador,
  // después de confirmar un depósito. Estos campos son de solo lectura.
  document.getElementById('account-balance').value = '';
  document.getElementById('account-equity').value = '';
  hideModalError();
  document.getElementById('account-modal').classList.add('is-visible');
  document.getElementById('wallet-name').focus();
}

function openEditModal(id) {
  const account = accountsCache.find((a) => a.id === id);
  if (!account) return;

  document.getElementById('modal-title').textContent = `Editar ${account.walletName || 'Mi Billetera'}`;
  document.getElementById('account-id').value = account.id;
  document.getElementById('wallet-name').value = account.walletName || 'Mi Billetera';
  selectedWalletColor = account.walletColor || WALLET_COLORS[0];
  document.getElementById('wallet-color').value = selectedWalletColor;
  renderWalletColorPicker();
  if (account.walletLink) {
    document.getElementById('wallet-link-field').style.display = 'block';
    document.getElementById('wallet-link').value = account.walletLink;
  } else {
    document.getElementById('wallet-link-field').style.display = 'none';
  }
  document.getElementById('account-currency').value = account.currency;
  // Balance y equity se muestran de solo lectura (no editables) — el valor
  // real, actualizado, lo asigna Zenith Capital desde el panel de admin.
  document.getElementById('account-balance').value = money(account.balance, account.currency);
  document.getElementById('account-equity').value = money(account.equity, account.currency);
  document.getElementById('account-leverage').value = account.leverage;

  hideModalError();
  document.getElementById('account-modal').classList.add('is-visible');
}

function closeModal() {
  document.getElementById('account-modal').classList.remove('is-visible');
}

function showModalError(message) {
  document.getElementById('modal-error-text').textContent = message;
  document.getElementById('modal-error').classList.add('is-visible');
}
function hideModalError() {
  document.getElementById('modal-error').classList.remove('is-visible');
}

async function handleAccountSubmit(event) {
  event.preventDefault();
  hideModalError();

  const id = document.getElementById('account-id').value;
  // No se envía balance ni equity: son de solo lectura en este formulario.
  // El servidor además los ignora si llegaran a mandarse (ver routes/accounts.js) —
  // solo el panel de administrador puede asignar o cambiar el saldo real.
  const payload = {
    currency: document.getElementById('account-currency').value,
    leverage: document.getElementById('account-leverage').value,
    walletName: document.getElementById('wallet-name').value.trim(),
    walletColor: document.getElementById('wallet-color').value,
  };

  const submitBtn = document.getElementById('modal-submit');
  submitBtn.disabled = true;

  try {
    if (id) {
      await Api.updateAccount(Number(id), payload);
      showToast('Billetera actualizada', 'success');
    } else {
      await Api.createAccount(payload);
      showToast('Billetera creada', 'success');
    }
    closeModal();
    loadAccounts();
  } catch (err) {
    showModalError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------
// Depósitos: modal (formulario -> comprobante) + historial
// ---------------------------------------------------------------------

function wireDepositModal() {
  const overlay = document.getElementById('deposit-modal');
  const form = document.getElementById('deposit-form');

  document.getElementById('open-deposit-modal').addEventListener('click', openDepositModal);
  document.getElementById('deposit-modal-close').addEventListener('click', closeDepositModal);
  document.getElementById('deposit-modal-cancel').addEventListener('click', closeDepositModal);
  document.getElementById('deposit-receipt-close').addEventListener('click', closeDepositModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDepositModal();
  });

  // Tarjetas de método de depósito: igual que en Retirar, clic selecciona
  // una y guarda el valor en el input oculto que lee el submit. El campo
  // "Banco" solo tiene sentido si el método es transferencia bancaria — con
  // Binance/Coinbase no hay banco que elegir, así que se oculta y en su
  // lugar se avisa que se contacta al usuario por el celular que deje.
  document.getElementById('deposit-method-grid').querySelectorAll('.method-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.getElementById('deposit-method-grid').querySelectorAll('.method-card').forEach((c) => {
        c.classList.remove('is-active');
      });
      card.classList.add('is-active');
      const method = card.dataset.value;
      document.getElementById('deposit-method').value = method;
      updateDepositBankFieldVisibility(method);
    });
  });

  form.addEventListener('submit', handleDepositSubmit);
}

function updateDepositBankFieldVisibility(method) {
  const isBankTransfer = method === 'Transferencia bancaria';
  document.getElementById('deposit-bank-field').style.display = isBankTransfer ? 'block' : 'none';
  document.getElementById('deposit-bank').required = isBankTransfer;
  document.getElementById('deposit-crypto-hint').style.display = isBankTransfer ? 'none' : 'block';
}

function openDepositModal() {
  document.getElementById('deposit-form').reset();
  document.getElementById('deposit-form').style.display = 'block';
  document.getElementById('deposit-receipt').style.display = 'none';
  hideDepositModalError();
  document.getElementById('deposit-method').value = 'Transferencia bancaria';
  document.getElementById('deposit-method-grid').querySelectorAll('.method-card').forEach((c) => {
    c.classList.toggle('is-active', c.dataset.value === 'Transferencia bancaria');
  });
  updateDepositBankFieldVisibility('Transferencia bancaria');
  document.getElementById('deposit-modal').classList.add('is-visible');
  document.getElementById('deposit-amount').focus();
}

function closeDepositModal() {
  document.getElementById('deposit-modal').classList.remove('is-visible');
}

function showDepositModalError(message) {
  document.getElementById('deposit-modal-error-text').textContent = message;
  document.getElementById('deposit-modal-error').classList.add('is-visible');
}
function hideDepositModalError() {
  document.getElementById('deposit-modal-error').classList.remove('is-visible');
}

async function handleDepositSubmit(event) {
  event.preventDefault();
  hideDepositModalError();

  const rawAmount = document.getElementById('deposit-amount').value;
  if (!isValidMoneyAmount(rawAmount)) {
    showDepositModalError('Por favor ingresa un valor válido.');
    return;
  }

  // Si la moneda elegida no es USD y todavía no llegó su tasa de cambio
  // real (por ejemplo, justo después de entrar mientras el backend recién
  // está arrancando), NO se debe mandar el monto tal cual escrito como si
  // fuera 1:1 — eso registraría un depósito por un valor completamente
  // distinto al que la persona quiso, sin ningún aviso. Mejor avisar y
  // dejar que reintente en un momento.
  if (typeof Currency !== 'undefined' && !Currency.hasRate()) {
    showDepositModalError(`Todavía no se cargó la tasa de cambio para ${Currency.getCode()}. Espera unos segundos e intenta de nuevo.`);
    return;
  }

  // Lo que la persona escribió está en la moneda que eligió (por ejemplo
  // ARS o PEN) — el backend siempre guarda montos en USD, así que lo
  // convertimos con la tasa de cambio en vivo antes de enviarlo.
  const amountUsd = typeof Currency !== 'undefined' ? Currency.toUsd(rawAmount) : Number(rawAmount);

  // El backend solo tiene un campo "bank" (de cuando el único método era
  // transferencia bancaria) — con Binance/Coinbase no hay un banco que
  // elegir, así que se manda el nombre del método en su lugar. Se sigue
  // viendo bien en todos lados donde ya se muestra ese campo (historial,
  // panel de administrador, comprobante) sin tocar nada del backend.
  const method = document.getElementById('deposit-method').value || 'Transferencia bancaria';
  const bank = method === 'Transferencia bancaria'
    ? document.getElementById('deposit-bank').value.trim()
    : method;

  const payload = {
    amount: amountUsd,
    bank,
    contact: document.getElementById('deposit-contact').value.trim(),
  };

  const submitBtn = document.getElementById('deposit-modal-submit');
  submitBtn.disabled = true;

  try {
    const deposit = await Api.createDeposit(payload);

    // Si este depósito viene de "Planes de Inversión" (ver
    // handlePlanQueryParams), se guarda qué plan le corresponde para que el
    // Quick Ledger pueda mostrar su nombre y estado de activación.
    if (pendingPlanTag) {
      saveDepositPlanTag(deposit.id, pendingPlanTag.key);
      pendingPlanTag = null;
    }

    // Cambia el formulario por el comprobante de estado.
    document.getElementById('deposit-form').style.display = 'none';
    document.getElementById('deposit-receipt').style.display = 'block';
    document.getElementById('deposit-receipt-detail').innerHTML = `
      <strong>${fundingMoney(deposit.amount)}</strong> · ${escapeHtml(deposit.bank)}<br>
      Contacto: ${escapeHtml(deposit.contact)}<br>
      Referencia: #${randomReference()}
    `;

    loadDeposits();
  } catch (err) {
    showDepositModalError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadDeposits() {
  try {
    depositsCache = await Api.getDeposits();
    renderDeposits(depositsCache);
    renderQuickLedger();
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del dashboard.
  }
}

// ---------------------------------------------------------------------
// Planes de Inversión (ver planes.html/planes.js): si la persona llega
// acá con un plan ya elegido, se abre el modal de depósito directamente
// con el monto del plan cargado, en vez de que tenga que volver a
// escribirlo a mano.
// ---------------------------------------------------------------------

function handlePlanQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const planKey = params.get('planKey');
  const planAmount = Number(params.get('planAmount'));
  if (!planKey || !Number.isFinite(planAmount) || planAmount <= 0) return;

  // Limpia la URL de inmediato para que refrescar la página no vuelva a
  // abrir el modal solo, ni deje el plan "pegado" si la persona cierra el
  // modal sin depositar.
  window.history.replaceState({}, '', window.location.pathname);

  const plan = INVESTMENT_PLANS.find((p) => p.key === planKey) || { key: planKey, label: 'este plan', amount: planAmount };
  pendingPlanTag = plan;

  openDepositModal();
  const localAmount = (typeof Currency !== 'undefined' && Currency.hasRate())
    ? Currency.toLocal(plan.amount)
    : plan.amount;
  document.getElementById('deposit-amount').value = Number(localAmount.toFixed(2));
  showToast(`Plan ${plan.label} seleccionado — completa tu depósito de ${money(plan.amount)} para activarlo`, 'info');
}

// Asocia un depósito ya creado con el plan que lo originó, guardado del
// lado del navegador (no hace falta tocar el backend para esto: es solo
// una etiqueta informativa para el Quick Ledger de este mismo navegador).
function saveDepositPlanTag(depositId, planKey) {
  try {
    const map = JSON.parse(localStorage.getItem('zenith_deposit_plans') || '{}');
    map[depositId] = planKey;
    localStorage.setItem('zenith_deposit_plans', JSON.stringify(map));
  } catch (e) {
    // localStorage no disponible — el depósito se crea igual, solo que sin
    // etiqueta de plan en el Quick Ledger.
  }
}

function getDepositPlanTag(depositId) {
  try {
    const map = JSON.parse(localStorage.getItem('zenith_deposit_plans') || '{}');
    return map[depositId] || null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------
// Quick Ledger: mini tabla con los últimos depósitos y en qué estado está
// cada uno. El estado de la revisión del depósito en sí (Pendiente/
// Rechazado) sale directo del backend; "Activo" es una lectura honesta de
// si el saldo actual ya alcanza el monto del plan elegido — no se inventa
// ningún dato nuevo, solo se combinan dos que ya existen (el depósito y el
// balance de las cuentas).
// ---------------------------------------------------------------------

function renderQuickLedger() {
  const body = document.getElementById('quick-ledger-body');
  const empty = document.getElementById('quick-ledger-empty');
  const table = document.getElementById('quick-ledger-table');
  if (!body) return; // esta sección no existe en todas las páginas

  const recent = [...depositsCache]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  if (recent.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  const totalBalance = accountsCache.reduce((sum, a) => sum + Number(a.balance || 0), 0);

  body.innerHTML = recent.map((d) => {
    const planKey = getDepositPlanTag(d.id);
    const plan = planKey ? INVESTMENT_PLANS.find((p) => p.key === planKey) : null;
    const { label, className } = quickLedgerStatus(d, plan, totalBalance);
    return `
      <tr>
        <td>${new Date(d.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td>${fundingMoney(d.amount)}</td>
        <td>${plan ? escapeHtml(plan.label) : '—'}</td>
        <td><span class="badge ${className}">${label}</span></td>
      </tr>
    `;
  }).join('');
}

function quickLedgerStatus(deposit, plan, totalBalance) {
  if (deposit.status === 'en_proceso') return { label: 'Pendiente', className: 'badge-en_proceso' };
  if (deposit.status === 'rechazado') return { label: 'Rechazado', className: 'badge-rechazado' };
  // completado: si no está atado a un plan, ya está aprobado y disponible
  // en el balance — no hay un umbral de plan contra el cual compararlo.
  if (!plan) return { label: 'Aprobado', className: 'badge-completado' };
  return totalBalance >= plan.amount
    ? { label: 'Activo', className: 'badge-completado' }
    : { label: 'Aprobado', className: 'badge-en_proceso' };
}

function renderDeposits(deposits) {
  const body = document.getElementById('deposits-body');
  const empty = document.getElementById('deposits-empty');
  const table = document.getElementById('deposits-table');

  body.innerHTML = '';

  if (deposits.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  deposits.forEach((d) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(d.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${fundingMoney(d.amount)}</td>
      <td>${escapeHtml(d.bank)}</td>
      <td>${escapeHtml(d.contact)}</td>
      <td><span class="badge badge-${d.status}">${movementStatusLabel(d.status)}</span></td>
    `;
    body.appendChild(row);
  });
}

function movementStatusLabel(status) {
  const labels = {
    en_proceso: 'En proceso',
    completado: 'Completado',
    rechazado: 'Rechazado',
  };
  return labels[status] || status;
}

// ---------------------------------------------------------------------
// Retiros: modal (formulario -> confirmación) + historial
// ---------------------------------------------------------------------

function wireWithdrawModal() {
  const overlay = document.getElementById('withdraw-modal');
  const form = document.getElementById('withdraw-form');

  document.getElementById('open-withdraw-modal').addEventListener('click', openWithdrawModal);
  document.getElementById('withdraw-modal-close').addEventListener('click', closeWithdrawModal);
  document.getElementById('withdraw-modal-cancel').addEventListener('click', closeWithdrawModal);
  document.getElementById('withdraw-confirmation-close').addEventListener('click', closeWithdrawModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeWithdrawModal();
  });

  // Tarjetas de método de retiro (estilo broker): clic selecciona una y
  // guarda el valor en el input oculto que lee el submit.
  document.getElementById('withdraw-method-grid').querySelectorAll('.method-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.getElementById('withdraw-method-grid').querySelectorAll('.method-card').forEach((c) => {
        c.classList.remove('is-active');
      });
      card.classList.add('is-active');
      document.getElementById('withdraw-method').value = card.dataset.value;
    });
  });

  form.addEventListener('submit', handleWithdrawSubmit);
}

function openWithdrawModal() {
  document.getElementById('withdraw-form').reset();
  document.getElementById('withdraw-form').style.display = 'block';
  document.getElementById('withdraw-confirmation').style.display = 'none';
  hideWithdrawModalError();
  document.getElementById('withdraw-method').value = '';
  document.getElementById('withdraw-method-grid').querySelectorAll('.method-card').forEach((c) => {
    c.classList.remove('is-active');
  });
  document.getElementById('withdraw-modal').classList.add('is-visible');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').classList.remove('is-visible');
}

function showWithdrawModalError(message) {
  document.getElementById('withdraw-modal-error-text').textContent = message;
  document.getElementById('withdraw-modal-error').classList.add('is-visible');
}
function hideWithdrawModalError() {
  document.getElementById('withdraw-modal-error').classList.remove('is-visible');
}

async function handleWithdrawSubmit(event) {
  event.preventDefault();
  hideWithdrawModalError();

  const method = document.getElementById('withdraw-method').value;
  if (!method) {
    showWithdrawModalError('Por favor selecciona un método de retiro.');
    return;
  }

  const rawAmount = document.getElementById('withdraw-amount').value;
  if (!isValidMoneyAmount(rawAmount)) {
    showWithdrawModalError('Por favor ingresa un valor válido.');
    return;
  }

  // Misma protección que en el depósito: sin una tasa real todavía, no se
  // manda el número tal cual como si fuera 1:1.
  if (typeof Currency !== 'undefined' && !Currency.hasRate()) {
    showWithdrawModalError(`Todavía no se cargó la tasa de cambio para ${Currency.getCode()}. Espera unos segundos e intenta de nuevo.`);
    return;
  }

  // Igual que en el depósito: la persona escribe en su moneda local, el
  // backend siempre guarda en USD.
  const amountUsd = typeof Currency !== 'undefined' ? Currency.toUsd(rawAmount) : Number(rawAmount);

  const payload = {
    method,
    amount: amountUsd,
    contact: document.getElementById('withdraw-contact').value.trim(),
  };

  const submitBtn = document.getElementById('withdraw-modal-submit');
  submitBtn.disabled = true;

  try {
    const withdrawal = await Api.createWithdrawal(payload);

    // Cambia el formulario por el mensaje de confirmación.
    document.getElementById('withdraw-form').style.display = 'none';
    document.getElementById('withdraw-confirmation').style.display = 'block';
    document.getElementById('withdraw-confirmation-detail').innerHTML = `
      <strong>${fundingMoney(withdrawal.amount)}</strong> · ${escapeHtml(withdrawal.method)}<br>
      Referencia: #${randomReference()}
    `;

    loadWithdrawals();
  } catch (err) {
    showWithdrawModalError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadWithdrawals() {
  try {
    withdrawalsCache = await Api.getWithdrawals();
    renderWithdrawals(withdrawalsCache);
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del dashboard.
  }
}

function renderWithdrawals(withdrawals) {
  const body = document.getElementById('withdrawals-body');
  const empty = document.getElementById('withdrawals-empty');
  const table = document.getElementById('withdrawals-table');

  body.innerHTML = '';

  if (withdrawals.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  withdrawals.forEach((w) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(w.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${escapeHtml(w.method)}</td>
      <td>${fundingMoney(w.amount)}</td>
      <td>${escapeHtml(w.contact || '—')}</td>
      <td><span class="badge badge-${w.status}">${movementStatusLabel(w.status)}</span></td>
    `;
    body.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Comprar / Vender (Fase 0: holdings + motor de trading sobre precios
// reales de cripto)
// ---------------------------------------------------------------------

function wireTradeModal() {
  const overlay = document.getElementById('trade-modal');
  const form = document.getElementById('trade-form');

  document.getElementById('trade-modal-close').addEventListener('click', closeTradeModal);
  document.getElementById('trade-modal-cancel').addEventListener('click', closeTradeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeTradeModal();
  });

  document.getElementById('trade-quantity').addEventListener('input', updateTradeTotal);
  form.addEventListener('submit', handleTradeSubmit);
}

function openTradeModal(mode, assetId) {
  const meta = CRYPTO_META[assetId];
  const price = currentPrices[assetId];

  if (!meta || !price) {
    showToast('Todavía no hay precio disponible para este activo — espera unos segundos e intenta de nuevo.', 'error');
    return;
  }
  if (accountsCache.length === 0) {
    showToast('Crea una billetera antes de operar.', 'error');
    return;
  }

  tradeMode = mode;
  tradeAssetId = assetId;

  // Limpia el formulario (cantidad de la vez anterior, etc.) ANTES de
  // rellenar los campos de este activo — hacerlo después borraría lo que
  // se acaba de escribir, porque .reset() también afecta al campo
  // "Activo" (es de solo lectura, pero sigue siendo parte del <form>).
  document.getElementById('trade-form').reset();

  document.getElementById('trade-modal-title').textContent =
    mode === 'buy' ? `Comprar ${meta.name}` : `Vender ${meta.name}`;
  document.getElementById('trade-asset-display').value = `${meta.name} (${meta.symbol}) · ${money(price)}`;

  const submitBtn = document.getElementById('trade-modal-submit');
  submitBtn.textContent = mode === 'buy' ? 'Confirmar compra' : 'Confirmar venta';
  submitBtn.classList.toggle('btn-buy', mode === 'buy');
  submitBtn.classList.toggle('btn-sell', mode === 'sell');

  const accountSelect = document.getElementById('trade-account');
  accountSelect.innerHTML = accountsCache
    .map((a) => `<option value="${a.id}">${escapeHtml(a.walletName || 'Mi Billetera')} · ${money(a.balance, a.currency)}</option>`)
    .join('');

  updateTradeTotal();
  hideTradeModalError();
  document.getElementById('trade-modal').classList.add('is-visible');
  document.getElementById('trade-quantity').focus();
}

function closeTradeModal() {
  document.getElementById('trade-modal').classList.remove('is-visible');
}

function showTradeModalError(message) {
  document.getElementById('trade-modal-error-text').textContent = message;
  document.getElementById('trade-modal-error').classList.add('is-visible');
}
function hideTradeModalError() {
  document.getElementById('trade-modal-error').classList.remove('is-visible');
}

function updateTradeTotal() {
  const price = currentPrices[tradeAssetId] || 0;
  const quantity = Number(document.getElementById('trade-quantity').value) || 0;
  document.getElementById('trade-total').textContent = `Total: ${money(price * quantity)}`;
}

async function handleTradeSubmit(event) {
  event.preventDefault();
  hideTradeModalError();

  const meta = CRYPTO_META[tradeAssetId];
  const price = currentPrices[tradeAssetId];
  const payload = {
    accountId: Number(document.getElementById('trade-account').value),
    asset: tradeAssetId,
    symbol: meta.symbol,
    quantity: Number(document.getElementById('trade-quantity').value),
    price,
  };

  const submitBtn = document.getElementById('trade-modal-submit');
  submitBtn.disabled = true;

  try {
    // Comprar/vender ya no ejecuta al instante: la operación queda en
    // revisión hasta que se apruebe desde el panel de administrador, así
    // que ni el balance ni las posiciones cambian todavía.
    if (tradeMode === 'buy') {
      await Api.buyAsset(payload);
      showToast(`Tu compra de ${payload.quantity} ${meta.symbol} quedó en revisión`, 'info');
    } else {
      await Api.sellAsset(payload);
      showToast(`Tu venta de ${payload.quantity} ${meta.symbol} quedó en revisión`, 'info');
    }
    closeTradeModal();
    loadTrades();
  } catch (err) {
    showTradeModalError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadHoldings() {
  try {
    holdingsCache = await Api.getHoldings();
    renderHoldings(holdingsCache);
    updateRankBadge();
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del dashboard.
  }
}

function renderHoldings(holdings) {
  const body = document.getElementById('holdings-body');
  const empty = document.getElementById('holdings-empty');
  const table = document.getElementById('holdings-table');

  body.innerHTML = '';

  if (holdings.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  holdings.forEach((h) => {
    const meta = CRYPTO_META[h.asset] || { name: h.symbol, symbol: h.symbol };
    const currentPrice = currentPrices[h.asset];
    const hasPrice = typeof currentPrice === 'number';
    const pl = hasPrice ? (currentPrice - h.avgPrice) * h.quantity : null;
    const plUp = pl !== null && pl > 0;
    const plDown = pl !== null && pl < 0;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(meta.name)} (${escapeHtml(meta.symbol)})</td>
      <td style="text-align:right;">${h.quantity}</td>
      <td style="text-align:right;">${money(h.avgPrice)}</td>
      <td style="text-align:right;">${hasPrice ? money(currentPrice) : '—'}</td>
      <td style="text-align:right; color:${plUp ? 'var(--good)' : plDown ? 'var(--critical)' : 'var(--text-muted)'}">
        ${pl !== null ? `${plUp ? '▲' : plDown ? '▼' : '—'} ${money(pl)}` : '—'}
      </td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" data-action="detail-holding" data-asset="${h.asset}">Detalles</button>
        <button class="btn btn-sell btn-sm" data-action="sell-holding" data-asset="${h.asset}">Vender</button>
      </td>
    `;
    body.appendChild(row);
  });

  body.querySelectorAll('[data-action="sell-holding"]').forEach((btn) => {
    btn.addEventListener('click', () => openTradeModal('sell', btn.dataset.asset));
  });
  body.querySelectorAll('[data-action="detail-holding"]').forEach((btn) => {
    btn.addEventListener('click', () => openHoldingDetailModal(btn.dataset.asset));
  });
}

// ---------------------------------------------------------------------
// Detalle de una posición: inversión inicial vs valor actual, cuánto se
// ganó/perdió, y el historial de compras/ventas de ese activo — para que
// el usuario pueda hacer seguimiento a su inversión sin tener que calcular
// nada a mano.
// ---------------------------------------------------------------------

function wireHoldingDetailModal() {
  const overlay = document.getElementById('holding-detail-modal');
  if (!overlay) return;
  document.getElementById('holding-detail-close').addEventListener('click', closeHoldingDetailModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeHoldingDetailModal();
  });
}

function closeHoldingDetailModal() {
  document.getElementById('holding-detail-modal').classList.remove('is-visible');
}

function openHoldingDetailModal(asset) {
  const holding = holdingsCache.find((h) => h.asset === asset);
  if (!holding) return;

  const meta = CRYPTO_META[asset] || { name: holding.symbol, symbol: holding.symbol };
  const currentPrice = typeof currentPrices[asset] === 'number' ? currentPrices[asset] : holding.avgPrice;

  const initialInvestment = holding.avgPrice * holding.quantity;
  const currentValue = currentPrice * holding.quantity;
  const pl = currentValue - initialInvestment;
  const plPercent = initialInvestment > 0 ? (pl / initialInvestment) * 100 : 0;
  const plUp = pl > 0;
  const plDown = pl < 0;

  document.getElementById('holding-detail-title').textContent = `${meta.name} (${meta.symbol})`;
  document.getElementById('holding-detail-quantity').textContent = holding.quantity;
  document.getElementById('holding-detail-avgprice').textContent = money(holding.avgPrice);
  document.getElementById('holding-detail-currentprice').textContent = money(currentPrice);
  document.getElementById('holding-detail-initial').textContent = money(initialInvestment);
  document.getElementById('holding-detail-current').textContent = money(currentValue);

  const plEl = document.getElementById('holding-detail-pl');
  plEl.textContent = `${plUp ? '▲' : plDown ? '▼' : '—'} ${money(pl)} (${plUp ? '+' : ''}${plPercent.toFixed(2)}%)`;
  plEl.style.color = plUp ? 'var(--good)' : plDown ? 'var(--critical)' : 'var(--text-muted)';

  // Historial de compras/ventas de este activo, más reciente primero —
  // así se ve cuándo se compró/vendió y en qué quedó cada solicitud.
  const relatedTrades = tradesCache.filter((t) => t.asset === asset);
  const historyBody = document.getElementById('holding-detail-history-body');
  const historyEmpty = document.getElementById('holding-detail-history-empty');
  historyBody.innerHTML = '';
  if (relatedTrades.length === 0) {
    historyEmpty.style.display = 'block';
  } else {
    historyEmpty.style.display = 'none';
    relatedTrades.forEach((t) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(t.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td>${t.side === 'compra' ? 'Compra' : 'Venta'}</td>
        <td style="text-align:right;">${t.quantity}</td>
        <td style="text-align:right;">${money(t.price)}</td>
        <td><span class="badge badge-trade-${t.status}">${tradeStatusLabel(t.status)}</span></td>
      `;
      historyBody.appendChild(row);
    });
  }

  document.getElementById('holding-detail-modal').classList.add('is-visible');
}

// ---------------------------------------------------------------------
// Historial de operaciones (compras/ventas) — ahora que comprar/vender
// queda "pendiente" hasta que Lucas lo revisa desde el panel de
// administrador, el usuario necesita ver en qué quedó cada solicitud:
// pendiente, aprobada (con el monto/cantidad final, que puede haber sido
// editado) o rechazada.
// ---------------------------------------------------------------------

async function loadTrades() {
  try {
    tradesCache = await Api.getTrades();
    renderTrades(tradesCache);
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del dashboard.
  }
}

function tradeStatusLabel(status) {
  const labels = {
    pendiente: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
  };
  return labels[status] || status;
}

function renderTrades(trades) {
  const body = document.getElementById('trades-body');
  const empty = document.getElementById('trades-empty');
  const table = document.getElementById('trades-table');
  if (!body || !empty || !table) return; // sección opcional, por si el HTML no la tiene todavía

  body.innerHTML = '';

  if (trades.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  trades.forEach((t) => {
    const meta = CRYPTO_META[t.asset] || { name: t.symbol, symbol: t.symbol };
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(t.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${t.side === 'compra' ? 'Compra' : 'Venta'}</td>
      <td>${escapeHtml(meta.name)} (${escapeHtml(meta.symbol)})</td>
      <td style="text-align:right;">${t.quantity}</td>
      <td style="text-align:right;">${money(t.price)}</td>
      <td style="text-align:right;">${money(t.total)}</td>
      <td><span class="badge badge-trade-${t.status}">${tradeStatusLabel(t.status)}</span></td>
    `;
    body.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Modal "Mi perfil": datos personales, documentos y contraseña
// ---------------------------------------------------------------------

function wireProfileModal() {
  const overlay = document.getElementById('profile-modal');

  document.getElementById('open-profile-modal').addEventListener('click', openProfileModal);
  document.getElementById('profile-modal-close').addEventListener('click', closeProfileModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeProfileModal();
  });

  // Pestañas internas del modal
  overlay.querySelectorAll('[data-profile-tab]').forEach((btn) => {
    btn.addEventListener('click', () => activateProfileTab(btn.dataset.profileTab));
  });

  document.getElementById('profile-data-form').addEventListener('submit', handleProfileDataSubmit);
  document.getElementById('profile-doc-upload-btn').addEventListener('click', handleDocumentUpload);
  document.getElementById('password-form').addEventListener('submit', handlePasswordSubmit);
}

function activateProfileTab(tab) {
  document.querySelectorAll('[data-profile-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.profileTab === tab);
  });
  document.querySelectorAll('[data-profile-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.profilePanel === tab);
  });
}

async function openProfileModal() {
  activateProfileTab('datos');
  hidePasswordModalError();
  hidePasswordModalSuccess();
  document.getElementById('password-form').reset();
  document.getElementById('profile-modal').classList.add('is-visible');

  try {
    const profile = await Api.getMe();
    document.getElementById('profile-fullname').textContent = profile.fullName || profile.username;
    document.getElementById('profile-email').textContent = profile.email || '—';
    document.getElementById('profile-avatar').textContent = (profile.fullName || profile.username || 'U').charAt(0).toUpperCase();
    document.getElementById('profile-phone').value = profile.phone || '';
    document.getElementById('profile-birthdate').value = profile.birthDate || '';
  } catch (err) {
    showToast(err.message, 'error');
  }

  loadDocuments();
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('is-visible');
}

// ---- Datos personales ----

function showProfileDataError(message) {
  document.getElementById('profile-data-error-text').textContent = message;
  document.getElementById('profile-data-error').classList.add('is-visible');
}
function hideProfileDataError() {
  document.getElementById('profile-data-error').classList.remove('is-visible');
}
function showProfileDataSuccess(message) {
  document.getElementById('profile-data-success-text').textContent = message;
  document.getElementById('profile-data-success').classList.add('is-visible');
}
function hideProfileDataSuccess() {
  document.getElementById('profile-data-success').classList.remove('is-visible');
}

async function handleProfileDataSubmit(event) {
  event.preventDefault();
  hideProfileDataError();
  hideProfileDataSuccess();

  const payload = {
    phone: document.getElementById('profile-phone').value.trim(),
    birthDate: document.getElementById('profile-birthdate').value || null,
  };

  const submitBtn = document.getElementById('profile-data-submit');
  submitBtn.disabled = true;
  try {
    await Api.updateProfile(payload);
    showProfileDataSuccess('Datos actualizados correctamente');
  } catch (err) {
    showProfileDataError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// ---- Documentos (PDFs) ----

async function loadDocuments() {
  try {
    documentsCache = await Api.getDocuments();
    renderDocuments(documentsCache);
  } catch (err) {
    // Silencioso: un fallo aquí no debe tumbar el resto del modal.
  }
}

function showProfileDocsError(message) {
  document.getElementById('profile-docs-error-text').textContent = message;
  document.getElementById('profile-docs-error').classList.add('is-visible');
}
function hideProfileDocsError() {
  document.getElementById('profile-docs-error').classList.remove('is-visible');
}

function renderDocuments(docs) {
  const list = document.getElementById('profile-docs-list');
  const empty = document.getElementById('profile-docs-empty');
  list.innerHTML = '';

  if (docs.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  docs.forEach((doc) => {
    const item = document.createElement('div');
    item.className = 'document-item';
    item.innerHTML = `
      <div>
        <div class="document-item-name">📄 ${escapeHtml(doc.filename)}</div>
        <div class="document-item-meta">${new Date(doc.uploadedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · ${(doc.size / 1024).toFixed(0)} KB</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="download-doc" data-id="${doc.id}" data-filename="${escapeHtml(doc.filename)}">Descargar</button>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('[data-action="download-doc"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await Api.downloadDocument(Number(btn.dataset.id), btn.dataset.filename);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleDocumentUpload() {
  hideProfileDocsError();
  const input = document.getElementById('profile-doc-input');
  const file = input.files[0];
  if (!file) {
    showProfileDocsError('Elige un archivo PDF primero');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showProfileDocsError('Solo se permiten archivos con extensión .pdf');
    return;
  }

  const btn = document.getElementById('profile-doc-upload-btn');
  btn.disabled = true;
  try {
    const dataBase64 = await fileToBase64(file);
    await Api.uploadDocument({ filename: file.name, dataBase64 });
    input.value = '';
    showToast('Documento subido', 'success');
    loadDocuments();
  } catch (err) {
    showProfileDocsError(err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---- Contraseña ----

function showPasswordModalError(message) {
  document.getElementById('password-modal-error-text').textContent = message;
  document.getElementById('password-modal-error').classList.add('is-visible');
}
function hidePasswordModalError() {
  document.getElementById('password-modal-error').classList.remove('is-visible');
}
function showPasswordModalSuccess(message) {
  document.getElementById('password-modal-success-text').textContent = message;
  document.getElementById('password-modal-success').classList.add('is-visible');
}
function hidePasswordModalSuccess() {
  document.getElementById('password-modal-success').classList.remove('is-visible');
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  hidePasswordModalError();
  hidePasswordModalSuccess();

  const currentPassword = document.getElementById('password-current').value;
  const newPassword = document.getElementById('password-new').value;
  const confirmPassword = document.getElementById('password-confirm').value;

  if (newPassword !== confirmPassword) {
    showPasswordModalError('La nueva contraseña y su confirmación no coinciden');
    return;
  }

  const submitBtn = document.getElementById('password-modal-submit');
  submitBtn.disabled = true;

  try {
    await Api.changePassword({ currentPassword, newPassword });
    showPasswordModalSuccess('Contraseña actualizada correctamente');
    document.getElementById('password-form').reset();
  } catch (err) {
    showPasswordModalError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------
// Asesoría IA avanzada (solo insignias Diamante y Platino) — da
// recomendaciones para que el usuario decida; cualquier compra/venta que
// haga después sigue pasando por la aprobación manual normal, igual que
// cualquier otra operación.
// ---------------------------------------------------------------------

let autoInvestStatusLoaded = false;

function wireAdvisoryPanel() {
  document.getElementById('advisory-generate-btn').addEventListener('click', generateAdvisory);
  document.getElementById('advisory-regenerate-btn').addEventListener('click', generateAdvisory);

  const autoInvestSwitch = document.getElementById('auto-invest-switch');
  if (autoInvestSwitch) {
    autoInvestSwitch.addEventListener('click', async () => {
      const isOn = autoInvestSwitch.getAttribute('aria-checked') === 'true';
      const next = !isOn;
      // Actualiza el switch de una vez (se siente más responsivo) y lo
      // revierte si la llamada al backend falla.
      autoInvestSwitch.setAttribute('aria-checked', String(next));
      try {
        await Api.setAutoInvestEnabled(next);
      } catch (err) {
        autoInvestSwitch.setAttribute('aria-checked', String(isOn));
        showToast(err.message, 'error');
      }
    });
  }
}

function updateAdvisoryVisibility() {
  const section = document.getElementById('advisory-section');
  if (!section) return;
  const minIndex = RANK_TIERS.findIndex((t) => t.key === ADVISORY_MIN_RANK_KEY);
  const currentIndex = currentRank ? RANK_TIERS.findIndex((t) => t.key === currentRank.key) : -1;
  // RANK_TIERS está ordenado de mayor a menor umbral, así que "alcanza" el
  // mínimo cuando su posición es igual o anterior (índice menor o igual).
  const qualifies = currentIndex !== -1 && currentIndex <= minIndex;
  section.style.display = qualifies ? 'block' : 'none';
  if (qualifies && currentRank) {
    const pill = document.getElementById('advisory-rank-pill');
    pill.textContent = currentRank.label;
    pill.className = `badge-pill rank-${currentRank.key}`;

    // Solo se consulta una vez (la primera vez que la persona califica en
    // esta sesión) — no en cada refresco de cuentas/holdings.
    if (!autoInvestStatusLoaded) {
      autoInvestStatusLoaded = true;
      loadAutoInvestStatus();
    }
  }
}

async function loadAutoInvestStatus() {
  const autoInvestSwitch = document.getElementById('auto-invest-switch');
  if (!autoInvestSwitch) return;
  try {
    const { enabled } = await Api.getAutoInvestStatus();
    autoInvestSwitch.setAttribute('aria-checked', String(Boolean(enabled)));
  } catch (err) {
    // Silencioso: si falla, el switch se queda en su valor por defecto
    // (activado) sin romper el resto del panel.
  }
}

async function generateAdvisory(event) {
  const button = event.currentTarget;
  const emptyState = document.getElementById('advisory-empty');
  const resultBox = document.getElementById('advisory-result');
  const errorBox = document.getElementById('advisory-error');

  errorBox.classList.remove('is-visible');
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = 'Analizando…';

  try {
    const { advisory, model, generatedAt } = await Api.getAiAdvisory();

    document.getElementById('advisory-result-text').textContent = advisory;
    document.getElementById('advisory-result-meta').textContent =
      `Generado por ${model} · ${new Date(generatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;

    emptyState.style.display = 'none';
    resultBox.style.display = 'block';
  } catch (err) {
    document.getElementById('advisory-error-text').textContent = err.message;
    errorBox.classList.add('is-visible');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

// ---------------------------------------------------------------------
// Ticker de cripto (CoinGecko, API pública sin key)
// ---------------------------------------------------------------------

// Apenas Binance empuja un precio nuevo por el WebSocket en vivo (ver
// market-ws.js), se actualiza la tabla al instante — no hace falta
// esperar al próximo ciclo de 15 segundos de loadTicker().
function handleLiveTick(data) {
  const symbol = data.s;
  wsTickerCache[symbol] = { price: Number(data.c), changePercent: Number(data.P), at: Date.now() };

  const id = ASSET_ID_BY_BINANCE_SYMBOL[symbol];
  if (!id) return;
  latestTickerData = { ...latestTickerData, [id]: { usd: Number(data.c), usd_24h_change: Number(data.P) } };
  renderTicker(latestTickerData);

  const statusEl = document.getElementById('ticker-status');
  statusEl.textContent = 'en vivo';
  statusEl.style.color = 'var(--good)';
}

function wireLiveTickerStream() {
  MarketWS.onTicker(Object.values(BINANCE_SYMBOL), handleLiveTick);
}

async function loadTicker() {
  const statusEl = document.getElementById('ticker-status');

  // Tether se muestra fijo en $1 (ver nota junto a BINANCE_SYMBOL) — esto
  // no depende de ninguna red, así que se aplica siempre, incluso si el
  // pedido de abajo a CoinGecko llega a fallar por completo (para que
  // Tether no desaparezca de la lista solo porque el resto de los precios
  // no pudo conectar).
  latestTickerData = { ...latestTickerData, tether: { usd: 1, usd_24h_change: 0 } };
  renderTicker(latestTickerData);

  try {
    // Zenith tiene su propio endpoint (loadZenithTicker), así que no se
    // pide acá.
    const restIds = CRYPTO_IDS.filter((id) => id !== 'tether' && id !== 'zenith');

    // Solo se le pide a CoinGecko lo que el stream en vivo de Binance
    // todavía no esté cubriendo con un precio fresco — si Binance ya está
    // entregando todo, esto no le pide nada a CoinGecko (evita agotar su
    // límite gratuito de peticiones, la causa real de la mala
    // "conectividad" reportada — ver PRODUCT_SPEC).
    const fromWs = {};
    const missing = [];
    const nowMs = Date.now();
    restIds.forEach((id) => {
      const symbol = BINANCE_SYMBOL[id];
      const tick = symbol && wsTickerCache[symbol];
      if (tick && nowMs - tick.at < WS_TICKER_FRESH_MS) {
        fromWs[id] = { usd: tick.price, usd_24h_change: tick.changePercent };
      } else {
        missing.push(id);
      }
    });

    let restData = {};
    if (missing.length) {
      const ids = missing.join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) throw new Error('No se pudo obtener precios');
      restData = await res.json();
    }

    latestTickerData = { ...latestTickerData, ...fromWs, ...restData };
    renderTicker(latestTickerData);
    statusEl.textContent = 'en vivo';
    statusEl.style.color = 'var(--good)';
  } catch (err) {
    statusEl.textContent = 'sin conexión';
    statusEl.style.color = 'var(--critical)';
  }
}

function renderTicker(data) {
  const body = document.getElementById('ticker-body');
  body.innerHTML = '';

  CRYPTO_IDS.forEach((id) => {
    const meta = CRYPTO_META[id];
    const entry = data[id];
    if (!entry) return;

    const change = entry.usd_24h_change ?? 0;
    const isUp = change > 0;
    const isDown = change < 0;

    // Compara contra el precio de la vuelta anterior (dato real de CoinGecko,
    // no inventado) para resaltar en verde/rojo el movimiento del momento.
    const prevPrice = previousTickerPrices[id];
    const priceDelta = typeof prevPrice === 'number' ? entry.usd - prevPrice : 0;
    const flashClass = priceDelta > 0 ? 'price-flash-up' : priceDelta < 0 ? 'price-flash-down' : '';
    previousTickerPrices[id] = entry.usd;
    currentPrices[id] = entry.usd;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="coin-cell">
          <span class="coin-symbol">${meta.symbol.slice(0, 3)}</span>
          <div>
            <div class="coin-name">${meta.name}</div>
            <div class="coin-ticker">${meta.symbol}</div>
          </div>
        </div>
      </td>
      <td class="price-cell ${flashClass}">${money(entry.usd)}</td>
      <td class="change-cell ${isUp ? 'is-up' : isDown ? 'is-down' : ''}">
        ${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(change).toFixed(2)}%
      </td>
      <td style="text-align:right;">
        <button class="btn btn-buy btn-sm" data-action="buy" data-id="${id}">Comprar</button>
        <button class="btn btn-sell btn-sm" data-action="sell" data-id="${id}">Vender</button>
      </td>
    `;
    body.appendChild(row);
  });

  // Quita la clase de "flash" después de un momento para que el color
  // vuelva a la normalidad y el próximo cambio se note de nuevo.
  body.querySelectorAll('.price-flash-up, .price-flash-down').forEach((cell) => {
    setTimeout(() => cell.classList.remove('price-flash-up', 'price-flash-down'), 900);
  });

  body.querySelectorAll('[data-action="buy"]').forEach((btn) => {
    btn.addEventListener('click', () => openTradeModal('buy', btn.dataset.id));
  });
  body.querySelectorAll('[data-action="sell"]').forEach((btn) => {
    btn.addEventListener('click', () => openTradeModal('sell', btn.dataset.id));
  });

  // Los precios cambiaron: refresca el P/L de las posiciones abiertas y,
  // con eso, la insignia (depende del valor de mercado de las posiciones).
  renderHoldings(holdingsCache);
  updateRankBadge();
}

// ---------------------------------------------------------------------
// Zenith (ZNT) — moneda propia simulada (no viene de CoinGecko)
// ---------------------------------------------------------------------

let zenithChart = null;
let zenithCandleSeries = null;

function wireZenithSection() {
  document.getElementById('zenith-buy-btn').addEventListener('click', () => openTradeModal('buy', 'zenith'));
  document.getElementById('zenith-sell-btn').addEventListener('click', () => openTradeModal('sell', 'zenith'));
  document.getElementById('zenith-chart-btn').addEventListener('click', openZenithChartModal);

  const overlay = document.getElementById('zenith-chart-modal');
  document.getElementById('zenith-chart-modal-close').addEventListener('click', closeZenithChartModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeZenithChartModal();
  });
}

async function loadZenithTicker() {
  const statusEl = document.getElementById('zenith-status');
  try {
    const snapshot = await Api.getZenithSnapshot();
    renderZenithSnapshot(snapshot);
    statusEl.textContent = 'en vivo';
    statusEl.style.color = 'var(--good)';
  } catch (err) {
    statusEl.textContent = 'sin conexión';
    statusEl.style.color = 'var(--critical)';
  }
}

function renderZenithSnapshot(snapshot) {
  const prevPrice = currentPrices.zenith;
  currentPrices.zenith = snapshot.price;

  const priceEl = document.getElementById('zenith-price');
  priceEl.textContent = money(snapshot.price);
  if (typeof prevPrice === 'number' && prevPrice !== snapshot.price) {
    priceEl.classList.remove('price-flash-up', 'price-flash-down');
    // Forzar reflow para que la animación se reinicie si ya estaba aplicada.
    void priceEl.offsetWidth;
    priceEl.classList.add(snapshot.price > prevPrice ? 'price-flash-up' : 'price-flash-down');
    setTimeout(() => priceEl.classList.remove('price-flash-up', 'price-flash-down'), 900);
  }

  const isUp = snapshot.change24h > 0;
  const isDown = snapshot.change24h < 0;
  const changeEl = document.getElementById('zenith-change');
  changeEl.className = `delta ${isUp ? 'is-up' : isDown ? 'is-down' : 'is-flat'}`;
  changeEl.textContent = `${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(snapshot.change24h).toFixed(2)}% (24h)`;

  document.getElementById('zenith-high').textContent = money(snapshot.high24h);
  document.getElementById('zenith-low').textContent = money(snapshot.low24h);
  document.getElementById('zenith-volume').textContent = compactMoney(snapshot.volume24h);
  document.getElementById('zenith-marketcap').textContent = compactMoney(snapshot.marketCap);

  // El precio cambió: refresca el P/L de cualquier posición abierta en ZNT.
  renderHoldings(holdingsCache);
  updateRankBadge();
}

async function initZenithChart() {
  if (zenithChart) return;
  const container = document.getElementById('zenith-chart-container');
  // La librería se pide en paralelo desde <head> (ver window.chartsReady)
  // en vez de con un <script> bloqueante — se espera acá a que esté
  // lista (o a que se rinda a los 6s) antes de decidir si hay gráfico o
  // no, ya que para cuando alguien abre este modal normalmente ya cargó,
  // pero no está garantizado como sí lo estaba antes.
  if (window.chartsReady) await window.chartsReady;
  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="empty-state"><div>No se pudo cargar el gráfico (librería no disponible).</div></div>';
    return;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  zenithChart = LightweightCharts.createChart(container, {
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: isLight ? '#4c4b47' : '#c3c2b7' },
    grid: {
      vertLines: { color: isLight ? 'rgba(20,20,15,0.06)' : 'rgba(255,255,255,0.05)' },
      horzLines: { color: isLight ? 'rgba(20,20,15,0.06)' : 'rgba(255,255,255,0.05)' },
    },
    rightPriceScale: { borderColor: isLight ? 'rgba(20,20,15,0.12)' : 'rgba(255,255,255,0.10)' },
    timeScale: { borderColor: isLight ? 'rgba(20,20,15,0.12)' : 'rgba(255,255,255,0.10)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });

  zenithCandleSeries = zenithChart.addCandlestickSeries({
    upColor: '#0ca30c',
    downColor: '#e66767',
    borderVisible: false,
    wickUpColor: '#0ca30c',
    wickDownColor: '#e66767',
  });

  const resize = () => zenithChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
  window.addEventListener('resize', resize);
  resize();
}

async function loadZenithChartData() {
  if (!zenithCandleSeries) return;
  try {
    const candles = await Api.getZenithCandles(200);
    zenithCandleSeries.setData(candles);
    zenithChart.timeScale().fitContent();
  } catch (err) {
    // Silencioso: el precio en vivo y las operaciones no dependen del gráfico.
  }
}

async function openZenithChartModal() {
  document.getElementById('zenith-chart-modal').classList.add('is-visible');
  await initZenithChart();
  loadZenithChartData();
}

function closeZenithChartModal() {
  document.getElementById('zenith-chart-modal').classList.remove('is-visible');
}
