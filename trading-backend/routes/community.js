// Comunidad Zenith: feed de chat simulado entre clientes certificados
// ficticios (ver data/community.js). Requiere estar logueado, igual que el
// resto de la plataforma, pero no depende de qué cuenta tenga el usuario.

const express = require('express');
const { getRecentMessages } = require('../data/community');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/community/messages -> últimos mensajes del chat simulado
router.get('/messages', (req, res) => {
  res.json(getRecentMessages(80));
});

module.exports = router;
