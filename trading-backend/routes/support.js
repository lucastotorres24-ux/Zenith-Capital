// Buzón de quejas y peticiones (support.html): el cliente escribe, recibe
// un número NIT de referencia, y ve la respuesta de Lucas acá mismo
// cuando la responda desde el panel de administrador (ver data/support.js
// y routes/admin.js).

const express = require('express');
const { createTicket, getTicketsByUser } = require('../data/support');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/support/tickets -> historial de peticiones del usuario logueado
router.get('/tickets', (req, res) => {
  res.json(getTicketsByUser(req.user.id));
});

// POST /api/support/tickets { text } -> crea una nueva petición/queja
router.post('/tickets', (req, res) => {
  const result = createTicket({
    userId: req.user.id,
    username: req.user.username,
    text: req.body.text,
  });
  if (result.error) return res.status(400).json({ error: result.error });

  res.status(201).json(result.ticket);
});

module.exports = router;
