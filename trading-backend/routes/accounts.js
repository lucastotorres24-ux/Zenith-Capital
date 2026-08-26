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
//
// IMPORTANTE (seguridad): esta ruta la llama directamente el usuario común
// desde su propio dashboard — nunca debe poder decidir su propio balance ni
// equity. Antes se leían del body y se guardaban tal cual, así que
// literalmente cualquiera podía crear una cuenta con el saldo que quisiera
// escribiendo un número en el formulario. Ahora toda cuenta nueva se crea
// siempre en 0, sin importar qué mande el cliente — el único lugar donde el
// saldo real se asigna es el panel de administrador
// (PUT /api/admin/accounts/:id/edit, protegido con ADMIN_CODE), normalmente
// después de aprobar un depósito.
router.post('/', (req, res) => {
  const { accountNumber, accountType, currency, leverage } = req.body;

  if (!accountNumber || !accountType || !currency) {
    return res.status(400).json({
      error: 'accountNumber, accountType y currency son requeridos',
    });
  }

  const newAccount = createAccount({
    userId: req.user.id,
    accountNumber,
    accountType,
    currency,
    balance: 0,
    equity: 0,
    leverage: leverage || '1:100',
  });

  res.status(201).json(newAccount);
});

// PUT /api/accounts/:id -> actualizar una cuenta (autoservicio del usuario)
//
// IMPORTANTE (seguridad): por la misma razón que arriba, esta ruta ignora
// por completo cualquier "balance" o "equity" que llegue en el body — ni
// siquiera se leen. Si un usuario manda esos campos (por ejemplo llamando a
// la API directamente, sin pasar por el formulario), simplemente no pasa
// nada con ellos. Cambiar el saldo real de una cuenta solo es posible desde
// el panel de administrador.
router.put('/:id', (req, res) => {
  const { accountType, currency, leverage } = req.body;

  const fields = {};
  if (accountType !== undefined) fields.accountType = accountType;
  if (currency !== undefined) fields.currency = currency;
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
