// Datos de mercado que NO vienen de CoinGecko — hoy, solo la moneda
// simulada Zenith (ZNT). Las demás monedas siguen viniendo directo de
// CoinGecko desde el navegador (ver assets/js/dashboard.js), como
// siempre; esto es aparte porque ZNT no existe en ningún mercado real.

const express = require('express');
const { getCurrentSnapshot, getCandles } = require('../data/zenithCoin');
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

module.exports = router;
