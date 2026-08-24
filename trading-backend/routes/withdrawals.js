// Solicitudes de retiro. Igual que los depósitos, esto NO mueve dinero real:
// el usuario elige un método y un monto, y la solicitud queda registrada con
// estado "en_proceso" — como pasaría en una plataforma real mientras un
// gestor de cuentas revisa y procesa el retiro manualmente.

const express = require('express');
const { getWithdrawalsByUser, createWithdrawal } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const ALLOWED_METHODS = ['Binance', 'Coinbase', 'Trust Wallet', 'Transferencia bancaria'];

// GET /api/withdrawals -> historial del usuario logueado (más reciente primero)
router.get('/', (req, res) => {
  res.json(getWithdrawalsByUser(req.user.id));
});

// POST /api/withdrawals -> crear una nueva solicitud de retiro
router.post('/', (req, res) => {
  const { method, amount, contact } = req.body;

  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Selecciona un método de retiro válido' });
  }

  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número mayor a 0' });
  }

  if (!contact || !String(contact).trim()) {
    return res.status(400).json({ error: 'El número de celular es requerido para poder contactarte' });
  }

  const withdrawal = createWithdrawal({
    userId: req.user.id,
    method,
    amount: parsedAmount,
    contact: String(contact).trim(),
  });

  res.status(201).json(withdrawal);
});

module.exports = router;
