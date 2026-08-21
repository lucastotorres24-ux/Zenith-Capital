const express = require('express');
const {
  getAccountsByUser,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de aquí para abajo requieren estar logueado
router.use(requireAuth);

// GET /api/accounts -> lista las cuentas del usuario logueado
router.get('/', (req, res) => {
  res.json(getAccountsByUser(req.user.id));
});

// GET /api/accounts/:id -> una cuenta específica
router.get('/:id', (req, res) => {
  const account = getAccountById(Number(req.params.id), req.user.id);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(account);
});

// POST /api/accounts -> crear una nueva cuenta
router.post('/', (req, res) => {
  const { accountNumber, accountType, currency, balance, equity, leverage } = req.body;

  if (!accountNumber || !accountType || !currency) {
    return res.status(400).json({
      error: 'accountNumber, accountType y currency son requeridos',
    });
  }

  const parsedBalance = Number(balance) || 0;
  const parsedEquity = Number(equity) || 0;
  if (parsedBalance < 0 || parsedEquity < 0) {
    return res.status(400).json({ error: 'balance y equity no pueden ser negativos' });
  }

  const newAccount = createAccount({
    userId: req.user.id,
    accountNumber,
    accountType,
    currency,
    balance: parsedBalance,
    equity: parsedEquity,
    leverage: leverage || '1:100',
  });

  res.status(201).json(newAccount);
});

// PUT /api/accounts/:id -> actualizar una cuenta
router.put('/:id', (req, res) => {
  const { accountType, currency, balance, equity, leverage } = req.body;

  if (balance !== undefined && Number(balance) < 0) {
    return res.status(400).json({ error: 'balance no puede ser negativo' });
  }
  if (equity !== undefined && Number(equity) < 0) {
    return res.status(400).json({ error: 'equity no puede ser negativo' });
  }

  const fields = {};
  if (accountType !== undefined) fields.accountType = accountType;
  if (currency !== undefined) fields.currency = currency;
  if (balance !== undefined) fields.balance = Number(balance);
  if (equity !== undefined) fields.equity = Number(equity);
  if (leverage !== undefined) fields.leverage = leverage;

  const updated = updateAccount(Number(req.params.id), req.user.id, fields);
  if (!updated) return res.status(404).json({ error: 'Cuenta no encontrada' });

  res.json(updated);
});

// DELETE /api/accounts/:id -> eliminar una cuenta
router.delete('/:id', (req, res) => {
  const deleted = deleteAccount(Number(req.params.id), req.user.id);
  if (!deleted) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json({ message: 'Cuenta eliminada', account: deleted });
});

module.exports = router;
