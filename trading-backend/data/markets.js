// Precios reales de Petróleo (WTI/Brent) e Índices bursátiles (S&P 500,
// Dow Jones, Nasdaq 100), vía Alpha Vantage (alphavantage.co) — la misma
// idea que data/currency.js y data/zenithCoin.js: se pide del lado del
// servidor (para no exponer la llave en el navegador), se guarda en caché
// una buena cantidad de tiempo, y si algo falla la plataforma nunca se
// queda sin poder mostrar nada, cae a lo último que sí funcionó.
//
// Por qué Alpha Vantage: es la única fuente gratuita y sin necesidad de
// tarjeta que de verdad ofrece Petróleo (WTI y Brent) como "commodity" —
// las demás opciones investigadas (Twelve Data, stooq.com) o no cubren
// petróleo/índices en su plan gratis o ahora piden llave+captcha. El
// límite gratis de Alpha Vantage es muy bajo (25 peticiones/día en total),
// así que la caché acá es mucho más larga que en currency.js — de todos
// modos su plan gratis solo da el precio del cierre del día anterior, no
// en vivo minuto a minuto, así que pedirlo más seguido no traería nada
// más fresco.
//
// Los índices (S&P 500, Dow Jones, Nasdaq 100) no están disponibles como
// tal en el plan gratis de Alpha Vantage, así que se usan tres fondos
// (ETFs) reales que cotizan en bolsa y siguen a cada índice casi
// exactamente: SPY (S&P 500), DIA (Dow Jones) y QQQ (Nasdaq 100) — es una
// práctica común y honesta (el precio es 100% real, de un instrumento que
// de verdad se compra y vende en el mercado), solo que no es el número
// exacto del índice "puro" sino el de su fondo espejo.

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas — ver nota de arriba sobre el límite de 25/día
const REQUEST_TIMEOUT_MS = 8000;
const BASE_URL = 'https://www.alphavantage.co/query';

const OIL_SYMBOLS = [
  { key: 'wti', name: 'Petróleo WTI', avFunction: 'WTI' },
  { key: 'brent', name: 'Petróleo Brent', avFunction: 'BRENT' },
];

const INDEX_SYMBOLS = [
  { key: 'sp500', name: 'S&P 500', avSymbol: 'SPY', note: 'vía ETF SPY' },
  { key: 'dowjones', name: 'Dow Jones', avSymbol: 'DIA', note: 'vía ETF DIA' },
  { key: 'nasdaq100', name: 'Nasdaq 100', avSymbol: 'QQQ', note: 'vía ETF QQQ' },
];

let oilCache = { data: null, updatedAt: null };
let indexCache = { data: null, updatedAt: null };

function isStale(cache) {
  return !cache.updatedAt || Date.now() - cache.updatedAt > CACHE_TTL_MS;
}

async function fetchJson(url) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch no está disponible en esta versión de Node (necesita Node 18+)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Alpha Vantage responde 200 OK incluso cuando el límite diario se
    // agotó o la llave es inválida — el error viene DENTRO del JSON, no
    // como código de estado, así que hay que revisarlo a mano.
    if (data && (data.Note || data.Information || data['Error Message'])) {
      throw new Error(data.Note || data.Information || data['Error Message']);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshOilIfStale() {
  if (!isStale(oilCache)) return;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return; // sin llave configurada -> se deja como "no disponible", ver getOilPrices()

  const results = {};
  for (const asset of OIL_SYMBOLS) {
    try {
      const url = `${BASE_URL}?function=${asset.avFunction}&interval=daily&apikey=${apiKey}`;
      const data = await fetchJson(url);
      const point = Array.isArray(data?.data) ? data.data[0] : null;
      const price = point ? Number(point.value) : NaN;
      // Alpha Vantage a veces devuelve "." como valor cuando ese día no
      // hubo dato (fin de semana/feriado) — se descarta en vez de mostrar
      // un precio inválido.
      if (Number.isFinite(price)) {
        results[asset.key] = { price, asOf: point.date || null };
      }
    } catch (err) {
      console.error(`No se pudo actualizar el precio de ${asset.name}:`, err.message);
    }
  }

  if (Object.keys(results).length) {
    oilCache = { data: { ...(oilCache.data || {}), ...results }, updatedAt: Date.now() };
  } else if (!oilCache.data) {
    // Ni siquiera había un dato viejo para quedarse -> se marca como
    // intentado, para no reintentar en cada petición hasta que pase la caché.
    oilCache = { data: {}, updatedAt: Date.now() };
  }
}

async function refreshIndicesIfStale() {
  if (!isStale(indexCache)) return;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return;

  const results = {};
  for (const idx of INDEX_SYMBOLS) {
    try {
      const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${idx.avSymbol}&apikey=${apiKey}`;
      const data = await fetchJson(url);
      const quote = data?.['Global Quote'];
      const price = quote ? Number(quote['05. price']) : NaN;
      const changePercentRaw = quote?.['10. change percent']; // ej. "0.45%"
      const changePercent = changePercentRaw ? Number(String(changePercentRaw).replace('%', '')) : null;
      if (Number.isFinite(price)) {
        results[idx.key] = {
          price,
          changePercent: Number.isFinite(changePercent) ? changePercent : null,
          asOf: quote?.['07. latest trading day'] || null,
        };
      }
    } catch (err) {
      console.error(`No se pudo actualizar el precio de ${idx.name}:`, err.message);
    }
  }

  if (Object.keys(results).length) {
    indexCache = { data: { ...(indexCache.data || {}), ...results }, updatedAt: Date.now() };
  } else if (!indexCache.data) {
    indexCache = { data: {}, updatedAt: Date.now() };
  }
}

async function getOilPrices() {
  await refreshOilIfStale();
  return {
    configured: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    updatedAt: oilCache.updatedAt,
    assets: OIL_SYMBOLS.map((a) => ({
      key: a.key,
      name: a.name,
      ...(oilCache.data && oilCache.data[a.key] ? oilCache.data[a.key] : {}),
    })),
  };
}

async function getIndexPrices() {
  await refreshIndicesIfStale();
  return {
    configured: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    updatedAt: indexCache.updatedAt,
    assets: INDEX_SYMBOLS.map((a) => ({
      key: a.key,
      name: a.name,
      note: a.note,
      ...(indexCache.data && indexCache.data[a.key] ? indexCache.data[a.key] : {}),
    })),
  };
}

module.exports = { getOilPrices, getIndexPrices, OIL_SYMBOLS, INDEX_SYMBOLS };
