// Comunidad Zenith: feed de chat simulado entre clientes certificados
// ficticios (ver data/community.js). Requiere estar logueado, igual que el
// resto de la plataforma, pero no depende de qué cuenta tenga el usuario.

const express = require('express');
const { getRecentMessages, postUserMessage } = require('../data/community');
const { getInvestedProxyByUser, getRankForAmount, getUserProfile } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/community/messages -> últimos mensajes del chat simulado (más
// los que haya escrito de verdad la persona logueada, y las respuestas
// automáticas que ya le tocaba recibir).
router.get('/messages', (req, res) => {
  res.json(getRecentMessages(80));
});

// POST /api/community/messages -> la persona logueada escribe un mensaje
// real; queda publicado de una vez, con su nombre e insignia actual, y un
// cliente simulado le responde poco después (ver data/community.js).
router.post('/messages', (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Escribe algo antes de enviar.' });
  if (text.length > 500) {
    return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 500 caracteres).' });
  }

  const profile = getUserProfile(req.user.id);
  const investedProxy = getInvestedProxyByUser(req.user.id);
  const rank = getRankForAmount(investedProxy);
  const displayName = profile?.fullName || profile?.username || 'Tú';

  const result = postUserMessage({
    userId: req.user.id,
    name: displayName,
    badge: rank ? rank.key : null,
    text,
  });
  if (result.error) return res.status(400).json({ error: result.error });

  res.status(201).json(result.message);
});

module.exports = router;
