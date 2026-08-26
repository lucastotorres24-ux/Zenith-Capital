const express = require('express');
const crypto = require('crypto');
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

// Colores permitidos para personalizar una billetera — una lista cerrada en
// vez de aceptar cualquier texto, para que nadie pueda meter CSS raro (o
// cualquier otra cosa) en el campo de color desde la API directamente.
const WALLET_COLORS = ['#3987e5', '#c98a3e', '#4fae5c', '#c65b8f', '#8a6fd1', '#e0574b', '#2fb7ad', '#b0a13a'];
const DEFAULT_WALLET_COLOR = WALLET_COLORS[0];

function sanitizeWalletName(name) {
  const trimmed = String(name || '').trim().slice(0, 40);
  return trimmed || 'Mi Billetera';
}

function sanitizeWalletColor(color) {
  return WALLET_COLORS.includes(color) ? color : DEFAULT_WALLET_COLOR;
}

// Genera el "enlace" de la billetera: un identificador único y aleatorio con
// formato de link, para que se sienta como la dirección de una billetera de
// verdad. Es solo un identificador de referencia dentro de Zenith Capital —
// no conecta con ningún banco real ni procesa transferencias por sí solo;
// el dinero sigue llegando únicamente cuando el equipo de Zenith Capital
// confirma un depósito manualmente, como siempre. Se genera una sola vez,
// al crear la billetera, y no cambia después.
function generateWalletLink() {
  return `zenith-capital.app/wallet/${crypto.randomBytes(12).toString('hex')}`;
}

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
  const { accountNumber, accountType, currency, leverage, walletName, walletColor } = req.body;

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
    walletName: sanitizeWalletName(walletName),
    walletColor: sanitizeWalletColor(walletColor),
    walletLink: generateWalletLink(),
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
//
// walletName y walletColor sí son editables aquí libremente: son solo
// personalización visual de la billetera (cómo se llama, de qué color se ve
// en el dashboard), no tienen ningún efecto sobre el saldo ni sobre las
// operaciones, así que no representan el mismo riesgo. walletLink, en
// cambio, no se puede cambiar: es un identificador fijo que se genera una
// sola vez al crear la billetera, igual que un número de cuenta real.
router.put('/:id', (req, res) => {
  const { accountType, currency, leverage, walletName, walletColor } = req.body;

  const fields = {};
  if (accountType !== undefined) fields.accountType = accountType;
  if (currency !== undefined) fields.currency = currency;
  if (leverage !== undefined) fields.leverage = leverage;
  if (walletName !== undefined) fields.walletName = sanitizeWalletName(walletName);
  if (walletColor !== undefined) fields.walletColor = sanitizeWalletColor(walletColor);

  const updated = updateAccount(Number(req.params.id), req.user.id, fields);
  if (!updated) return res.status(404).json({ error: 'Cuenta no encontrada' });

  res.json(updated);
});

// DELETE /api/accounts/:id -> eliminar una cuenta
router.delete('/:id', (req, res) => {
  const deleted = deleteAccount(Number(req.params.id), req.user.id);
  if (!deleted) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json({ message: 'Billetera eliminada', account: deleted });
});

module.exports = router;
