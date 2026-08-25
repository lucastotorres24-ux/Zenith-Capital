// Moneda simulada "Zenith" (ZNT) — a pedido de Lucas: no sigue el precio
// de ninguna moneda real, se mueve sola con una caminata aleatoria que él
// controla desde el panel de administrador con dos perillas simples:
//
//   - Tendencia: sube / baja / estable (hacia dónde se inclina el precio
//     con el tiempo).
//   - Volatilidad: baja / media / alta (qué tan bruscos son los
//     movimientos vela a vela).
//
// Lucas NO edita un precio exacto a mano cada vez — el sistema genera las
// velas solo, dentro de esos límites, igual que pasaría con una moneda
// real de baja capitalización (por eso el precio inicial y el
// "circulating supply" están en un rango parecido al de una moneda así,
// sin copiar ninguna en particular).
//
// Generación perezosa (mismo patrón que data/community.js): no hay ningún
// proceso corriendo en segundo plano generando velas todo el tiempo — cada
// vez que alguien pide el precio o las velas, se calculan las que
// "deberían" haberse generado desde la última vez, según el tiempo
// transcurrido. Esto es robusto a que el servidor se reinicie o se
// duerma (plan gratis de Render): el precio siempre se puede reconstruir
// desde la última vela guardada + cuánto tiempo pasó, sin depender de que
// un setTimeout/proceso siga vivo sin interrupción.

const { load, save } = require('./db');

const CANDLE_INTERVAL_MS = 15 * 60 * 1000; // velas de 15 minutos
const CANDLES_PER_DAY = Math.round((24 * 60 * 60 * 1000) / CANDLE_INTERVAL_MS); // 96
const MAX_STORED_CANDLES = 500; // ~5 días de histórico — de sobra para un gráfico de 24-48h
const MAX_CATCHUP_PER_CALL = 250; // límite de velas a generar de golpe en una sola llamada

const BASE_PRICE = 12.4; // precio inicial — rango de una cripto "no tan famosa", no de una moneda real puntual
const CIRCULATING_SUPPLY = 2_000_000; // fijo e inventado, solo para poder mostrar un "market cap" coherente

const TREND_DRIFT = {
  subida: 0.0009, // sesgo alcista por vela (~+0.09%) — sostenido, no instantáneo
  bajada: -0.0009,
  estable: 0,
};
const VOLATILITY_STDEV = {
  baja: 0.004,
  media: 0.009,
  alta: 0.018,
};
const TREND_OPTIONS = Object.keys(TREND_DRIFT);
const VOLATILITY_OPTIONS = Object.keys(VOLATILITY_STDEV);

// Genera un número con distribución ~normal (Box-Muller) en vez de
// uniforme, para que el recorrido de precio se sienta como el de una
// moneda real (más valores cerca de cero, colas ocasionales) en vez de un
// zigzag parejo.
function randNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateNextCandle(openPrice, config, openTimeMs) {
  const drift = TREND_DRIFT[config.trend] ?? 0;
  const vol = VOLATILITY_STDEV[config.volatility] ?? VOLATILITY_STDEV.media;
  const steps = 6; // varios "pasos" intra-vela para que high/low no sean iguales a open/close
  let price = openPrice;
  let high = openPrice;
  let low = openPrice;

  for (let i = 0; i < steps; i++) {
    const shock = randNormal() * (vol / Math.sqrt(steps)) + drift / steps;
    price = Math.max(0.01, price * (1 + shock));
    if (price > high) high = price;
    if (price < low) low = price;
  }

  const close = price;
  // Volumen simulado: más alto cuando la vela se movió más fuerte, como
  // pasaría con una moneda real en momentos de volatilidad.
  const movement = Math.abs(close - openPrice) / openPrice;
  const baseVolume = 40_000 + Math.random() * 30_000;
  const volume = Math.round(baseVolume * (1 + movement * 20));

  return {
    t: openTimeMs,
    o: Number(openPrice.toFixed(4)),
    h: Number(high.toFixed(4)),
    l: Number(low.toFixed(4)),
    c: Number(close.toFixed(4)),
    v: volume,
  };
}

// Revisa cuántas velas "deberían" existir ya según el tiempo transcurrido
// y las genera — se llama antes de leer cualquier dato de ZNT. Devuelve
// el estado ya al día `{ config, candles }`.
function ensureCandlesGenerated() {
  const db = load();
  const now = Date.now();

  // Arranque en frío: si todavía no hay ninguna vela (instalación nueva),
  // se simula que la moneda ya llevaba 48h operando, para que el gráfico
  // no se vea vacío ni con una sola vela la primera vez que alguien entra.
  let lastTime =
    db.zenithCandles.length === 0
      ? now - 48 * 60 * 60 * 1000
      : db.zenithCandles[db.zenithCandles.length - 1].t;
  let lastClose = db.zenithCandles.length ? db.zenithCandles[db.zenithCandles.length - 1].c : BASE_PRICE;

  let generated = 0;
  while (now - lastTime >= CANDLE_INTERVAL_MS && generated < MAX_CATCHUP_PER_CALL) {
    const openTime = lastTime + CANDLE_INTERVAL_MS;
    const candle = generateNextCandle(lastClose, db.zenithConfig, openTime);
    db.zenithCandles.push(candle);
    lastTime = openTime;
    lastClose = candle.c;
    generated += 1;
  }

  if (db.zenithCandles.length > MAX_STORED_CANDLES) {
    db.zenithCandles = db.zenithCandles.slice(db.zenithCandles.length - MAX_STORED_CANDLES);
  }

  if (generated > 0) {
    db.zenithLastGeneratedAt = new Date(lastTime).toISOString();
    save(db);
  }

  return { config: db.zenithConfig, candles: db.zenithCandles };
}

// Precio actual + los datos que se necesitan para evaluar una moneda de
// verdad (variación 24h, máximo/mínimo 24h, volumen 24h, market cap) —
// mismo tipo de información que se ve para cualquier cripto real en el
// ticker, calculada sobre las velas simuladas.
function getCurrentSnapshot() {
  const { config, candles } = ensureCandlesGenerated();
  if (!candles.length) return null;

  const latest = candles[candles.length - 1];
  const price = latest.c;

  const refIndex = Math.max(0, candles.length - 1 - CANDLES_PER_DAY);
  const refPrice = candles[refIndex].o;
  const change24h = refPrice ? ((price - refPrice) / refPrice) * 100 : 0;

  const window = candles.slice(refIndex);
  const high24h = window.reduce((max, c) => Math.max(max, c.h), -Infinity);
  const low24h = window.reduce((min, c) => Math.min(min, c.l), Infinity);
  const volume24h = window.reduce((sum, c) => sum + c.v, 0);

  return {
    symbol: 'ZNT',
    name: 'Zenith',
    price: Number(price.toFixed(4)),
    change24h: Number(change24h.toFixed(2)),
    high24h: Number(high24h.toFixed(4)),
    low24h: Number(low24h.toFixed(4)),
    volume24h: Math.round(volume24h),
    marketCap: Math.round(price * CIRCULATING_SUPPLY),
    circulatingSupply: CIRCULATING_SUPPLY,
    trend: config.trend,
    volatility: config.volatility,
    updatedAt: new Date().toISOString(),
  };
}

// Velas para el gráfico, en el formato que espera lightweight-charts
// (timestamp en segundos, no milisegundos).
function getCandles(limit = 200) {
  const { candles } = ensureCandlesGenerated();
  return candles.slice(-limit).map((c) => ({
    time: Math.floor(c.t / 1000),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v,
  }));
}

function getAdminConfig() {
  const { config } = ensureCandlesGenerated();
  return config;
}

// Cambia la tendencia/volatilidad para ADELANTE — antes de aplicar el
// cambio, pone al día las velas que faltaban con la configuración
// anterior, para no "teletransportar" tiempo pasado a la tendencia nueva.
function updateConfig({ trend, volatility }) {
  if (!TREND_OPTIONS.includes(trend)) {
    return { error: `Tendencia inválida (usa: ${TREND_OPTIONS.join(', ')})` };
  }
  if (!VOLATILITY_OPTIONS.includes(volatility)) {
    return { error: `Volatilidad inválida (usa: ${VOLATILITY_OPTIONS.join(', ')})` };
  }

  ensureCandlesGenerated(); // al día con la config anterior antes de cambiarla

  const db = load();
  db.zenithConfig = { trend, volatility, updatedAt: new Date().toISOString() };
  save(db);
  return { config: db.zenithConfig };
}

module.exports = {
  getCurrentSnapshot,
  getCandles,
  getAdminConfig,
  updateConfig,
  TREND_OPTIONS,
  VOLATILITY_OPTIONS,
};
