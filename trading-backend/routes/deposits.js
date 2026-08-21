// Solicitudes de depósito. Esto NO procesa pagos reales — es un "ticket":
// el usuario indica cuánto quiere depositar, a qué banco y cómo contactarlo,
// y queda guardado con estado "en_proceso" (como pasaría en una plataforma
// real que confirma transferencias manualmente antes de acreditar el saldo).

const express = require('express');
const { getDepositsByUser, createDeposit } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/deposits -> historial del usuario logueado (más reciente primero)
router.get('/', (req, res) => {
  res.json(getDepositsByUser(req.user.id));
});

// POST /api/deposits -> crear una nueva solicitud de depósito
router.post('/', (req, res) => {
  const { amount, bank, contact } = req.body;

  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número mayor a 0' });
  }
  if (!bank || !String(bank).trim()) {
    return res.status(400).json({ error: 'El banco es requerido' });
  }
  if (!contact || !String(contact).trim()) {
    return res.status(400).json({ error: 'El correo o WhatsApp es requerido' });
  }

  const deposit = createDeposit({
    userId: req.user.id,
    amount: parsedAmount,
    bank: String(bank).trim(),
    contact: String(contact).trim(),
  });

  res.status(201).json(deposit);
});

module.exports = router;
