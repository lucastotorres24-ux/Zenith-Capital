// Detección de moneda por ubicación (IP) + tasas de cambio en vivo.
//
// IMPORTANTE: todo el sistema interno (balances, holdings, precios de
// cripto/ZNT) sigue funcionando en USD exactamente como antes. Esto NO
// toca esa lógica — solo sirve para MOSTRAR montos convertidos y para
// aceptar montos en la moneda local del cliente al depositar/retirar,
// convirtiéndolos a USD antes de guardarlos. Así evitamos desestabilizar
// todo lo que ya funciona con holdings/precios/rangos.

const RATES_TTL_MS = 60 * 60 * 1000; // 1 hora
const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const GEO_URL_PREFIX = 'https://ipapi.co/';

// Tasas de respaldo, aproximadas, solo para que la plataforma nunca se
// quede sin poder mostrar un monto convertido si la API externa falla o
// el servidor no tiene salida a internet en ese momento (por ejemplo,
// mientras se prueba localmente sin conexión).
const FALLBACK_RATES = {
  USD: 1,
  ARS: 1000,
  PEN: 3.75,
  COP: 4000,
  MXN: 18,
  CLP: 950,
  EUR: 0.92,
  BRL: 5.4,
};

let ratesCache = {
  base: 'USD',
  rates: null,
  updatedAt: null,
  source: 'none',
};

// Recalcula las tasas SOLO si ya pasó más de una hora desde la última vez
// (mismo patrón "perezoso" que los mensajes de Comunidad Zenith y las
// velas de ZNT: se revisa en cada request, sin depender de un timer de
// fondo que no sobreviva si Render duerme el servidor gratis).
async function refreshRatesIfStale() {
  const isStale = !ratesCache.updatedAt || Date.now() - ratesCache.updatedAt > RATES_TTL_MS;
  if (!isStale) return;

  try {
    if (typeof fetch !== 'function') {
      throw new Error('fetch no está disponible en esta versión de Node (necesita Node 18+)');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(RATES_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !data.rates) throw new Error('Respuesta sin tasas de cambio');

    ratesCache = {
      base: 'USD',
      rates: data.rates,
      updatedAt: Date.now(),
      source: 'live',
    };
  } catch (err) {
    // Si falla (sin internet en este entorno, API caída, límite alcanzado,
    // etc.) seguimos con lo que ya teníamos en cache; si nunca se pudo
    // cargar nada, usamos las tasas de respaldo para que el sitio nunca se
    // quede sin poder mostrar una conversión.
    if (!ratesCache.rates) {
      ratesCache = { base: 'USD', rates: FALLBACK_RATES, updatedAt: Date.now(), source: 'fallback' };
    }
    console.error('No se pudieron actualizar las tasas de cambio en vivo:', err.message);
  }
}

async function getRates() {
  await refreshRatesIfStale();
  return ratesCache;
}

// Mapea la IP del cliente a un país/moneda probable. Si algo falla (sin
// salida a internet, IP local de pruebas, límite de la API gratuita,
// etc.) devolvemos USD como respaldo seguro — nunca un error que rompa la
// pantalla de registro o el dashboard.
async function detectCurrencyFromIp(ip) {
  const fallback = { country: null, countryCode: null, currency: 'USD', source: 'fallback' };
  if (!ip) return fallback;

  const cleanIp = String(ip).replace('::ffff:', '').trim();

  // IPs locales/privadas (pruebas en localhost, redes internas de Render)
  // nunca resuelven a un país real -> ni lo intentamos, ahorra la llamada.
  const isPrivate =
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === '' ||
    /^10\./.test(cleanIp) ||
    /^192\.168\./.test(cleanIp) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(cleanIp);
  if (isPrivate) return fallback;

  try {
    if (typeof fetch !== 'function') {
      throw new Error('fetch no está disponible en esta versión de Node (necesita Node 18+)');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${GEO_URL_PREFIX}${encodeURIComponent(cleanIp)}/json/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || data.error || !data.currency) throw new Error('Respuesta sin moneda detectable');

    return {
      country: data.country_name || null,
      countryCode: data.country_code || null,
      currency: data.currency,
      source: 'ip',
    };
  } catch (err) {
    console.error('No se pudo detectar el país/moneda por IP:', err.message);
    return fallback;
  }
}

module.exports = { getRates, detectCurrencyFromIp, FALLBACK_RATES };
