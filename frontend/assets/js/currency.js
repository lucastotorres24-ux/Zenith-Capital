// Módulo de moneda local del cliente.
//
// Qué hace: detecta la moneda del cliente por su ubicación (IP), trae
// tasas de cambio reales y en vivo, y deja elegirla a mano desde el menú
// de usuario. Se usa SOLO para mostrar y para escribir montos de depósito
// y retiro en la moneda local — el backend sigue guardando y calculando
// todo en USD exactamente como antes (balances de cuentas, holdings,
// precios de cripto/ZNT no se tocan), así que nada de la lógica de
// trading que ya funciona puede romperse por esto.
//
// Si no hay conexión a las APIs externas (por ejemplo, mientras se prueba
// en un entorno sin salida a internet) todo se degrada solo a USD 1:1,
// sin romper ninguna pantalla.

const Currency = (() => {
  const STORAGE_KEY = 'zenith_currency';
  const SUPPORTED = ['USD', 'ARS', 'PEN', 'COP', 'MXN', 'CLP', 'EUR', 'BRL'];
  const LOCALES = {
    USD: 'en-US',
    ARS: 'es-AR',
    PEN: 'es-PE',
    COP: 'es-CO',
    MXN: 'es-MX',
    CLP: 'es-CL',
    EUR: 'de-DE',
    BRL: 'pt-BR',
  };
  const LABELS = {
    USD: 'USD — Dólar estadounidense',
    ARS: 'ARS — Peso argentino',
    PEN: 'PEN — Sol peruano',
    COP: 'COP — Peso colombiano',
    MXN: 'MXN — Peso mexicano',
    CLP: 'CLP — Peso chileno',
    EUR: 'EUR — Euro',
    BRL: 'BRL — Real brasileño',
  };

  const state = {
    code: 'USD',
    rates: { USD: 1 },
    ready: false,
  };

  function getCode() {
    return state.code;
  }

  function isReady() {
    return state.ready;
  }

  function labelFor(code) {
    return LABELS[code] || code;
  }

  function setCode(code) {
    if (!SUPPORTED.includes(code)) return;
    state.code = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* modo privado, etc. */ }
    document.dispatchEvent(new CustomEvent('zenith-currency-changed', { detail: { code } }));
  }

  function rateFor(code) {
    return state.rates[code] || (code === 'USD' ? 1 : null);
  }

  // USD -> moneda seleccionada (para mostrar)
  function toLocal(usdAmount, code = state.code) {
    const n = Number(usdAmount) || 0;
    const rate = rateFor(code);
    return rate ? n * rate : n;
  }

  // moneda seleccionada -> USD (para mandar al backend)
  function toUsd(localAmount, code = state.code) {
    const n = Number(localAmount) || 0;
    const rate = rateFor(code);
    return rate ? n / rate : n;
  }

  function format(usdAmount, code = state.code) {
    const converted = toLocal(usdAmount, code);
    const locale = LOCALES[code] || 'en-US';
    try {
      return converted.toLocaleString(locale, { style: 'currency', currency: code, maximumFractionDigits: 2 });
    } catch (e) {
      return `${code} ${converted.toFixed(2)}`;
    }
  }

  async function init() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* modo privado, etc. */ }

    if (saved && SUPPORTED.includes(saved)) {
      state.code = saved;
    } else {
      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/currency/detect`);
        const data = await res.json();
        if (data && SUPPORTED.includes(data.currency)) {
          state.code = data.currency;
          try { localStorage.setItem(STORAGE_KEY, state.code); } catch (e) {}
        }
      } catch (e) {
        // Sin conexión / API caída -> se queda en USD, no rompe nada.
      }
    }

    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/currency/rates`);
      const data = await res.json();
      if (data && data.rates) state.rates = data.rates;
    } catch (e) {
      // Sin conexión -> se queda con USD:1 (todo se ve igual, sin romper nada).
    }

    state.ready = true;
    document.dispatchEvent(new CustomEvent('zenith-currency-ready', { detail: { code: state.code } }));
  }

  return { init, getCode, setCode, isReady, toLocal, toUsd, format, labelFor, SUPPORTED };
})();
