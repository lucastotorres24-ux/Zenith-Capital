// Verificación del código de acceso del sitio (ver middleware/siteAccess.js).
// Esta ruta es la única que queda abierta sin ese código, porque es
// justamente la que lo verifica.

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { requireSiteAccess } = require('../middleware/siteAccess');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const accessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

// POST /api/access/verify — recibe el código, devuelve un token largo que
// el navegador guarda y reenvía en cada petición siguiente.
router.post('/verify', accessLimiter, (req, res) => {
  const configuredCode = process.env.SITE_ACCESS_CODE;
  if (!configuredCode) {
    // No hay código configurado en el servidor: el bloqueo está desactivado,
    // así que se deja pasar directamente.
    return res.json({ ok: true, enabled: false, token: null });
  }

  const { code } = req.body;
  if (!code || String(code) !== configuredCode) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }

  const token = jwt.sign({ site: true }, process.env.JWT_SECRET, { expiresIn: '180d' });
  res.json({ ok: true, enabled: true, token });
});

// GET /api/access/check — confirma en segundo plano si el token guardado
// en este dispositivo sigue siendo válido (protegida por el propio
// middleware, así que si responde 200 es porque el token que mandaron es
// correcto).
router.get('/check', requireSiteAccess, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
