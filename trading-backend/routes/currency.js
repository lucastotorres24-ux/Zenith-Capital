// Detección de moneda por ubicación + tasas de cambio en vivo. Público (sin
// exigir sesión) a propósito: la pantalla de registro también necesita
// sugerir la moneda local ANTES de que la persona tenga una cuenta creada.

const express = require('express');
const { getRates, detectCurrencyFromIp } = require('../data/currency');

const router = express.Router();

// GET /api/currency/detect -> { country, countryCode, currency, source }
router.get('/detect', async (req, res) => {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwardedFor || req.ip || (req.socket && req.socket.remoteAddress) || '';
  const result = await detectCurrencyFromIp(ip);
  res.json(result);
});

// GET /api/currency/rates -> { base, rates, updatedAt, source }
router.get('/rates', async (req, res) => {
  const rates = await getRates();
  res.json(rates);
});

module.exports = router;
