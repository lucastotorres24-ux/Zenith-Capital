// Datos de mercado que NO vienen de CoinGecko — hoy, solo la moneda
// simulada Zenith (ZNT). Las demás monedas siguen viniendo directo de
// CoinGecko desde el navegador (ver assets/js/dashboard.js), como
// siempre; esto es aparte porque ZNT no existe en ningún mercado real.

const express = require('express');
const { getCurrentSnapshot, getCandles } = require('../data/zenithCoin');
const { getOilPrices, getIndexPrices } = require('../data/markets');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/market/zenith -> precio actual + variación/volumen/market cap
router.get('/zenith', (req, res) => {
  const snapshot = getCurrentSnapshot();
  if (!snapshot) return res.status(503).json({ error: 'ZNT todavía no tiene datos' });
  res.json(snapshot);
});

// GET /api/market/zenith/candles -> velas para el gráfico (lightweight-charts)
router.get('/zenith/candles', (req, res) => {
  const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 200));
  res.json(getCandles(limit));
});

// GET /api/market/commodities -> precio real de Petróleo WTI y Brent (ver
// data/markets.js — necesita ALPHA_VANTAGE_API_KEY configurada; si no está,
// responde igual pero con "configured: false" para que el frontend lo
// muestre como "no disponible" en vez de fallar.
router.get('/commodities', async (req, res) => {
  try {
    const data = await getOilPrices();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudo obtener el precio del petróleo en este momento.' });
  }
});

// GET /api/market/indices -> precio real de S&P 500, Dow Jones y Nasdaq 100
// (vía ETFs espejo, ver nota en data/markets.js).
router.get('/indices', async (req, res) => {
  try {
    const data = await getIndexPrices();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudo obtener el precio de los índices en este momento.' });
  }
});

module.exports = router;
