// Panel de administrador: cola de depósitos, retiros y compras/ventas que
// están "en proceso"/"pendientes" esperando que Lucas las apruebe, las
// modifique (editando el monto/cantidad final) o las rechace. Protegido en
// dos capas: primero el código de acceso general del sitio
// (middleware/siteAccess.js, ya aplicado antes de llegar aquí en
// server.js), y además un código de administrador propio (ADMIN_CODE) que
// solo Lucas conoce.

const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { requireAdmin } = require('../middleware/admin');
const {
  getAccountsByUser,
  getPendingDeposits,
  approveDeposit,
  rejectDeposit,
  getPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getPendingTrades,
  approveTrade,
  rejectTrade,
  getAllDocuments,
  getDocumentById,
  getAllUsersAdminView,
  requestAccountEdit,
  requestHoldingEdit,
  requestHoldingCreate,
  requestHoldingDelete,
} = require('../data/store');
const { getAllTickets, replyToTicket } = require('../data/support');
const { getFilePath } = require('../data/files');
const {
  getAdminConfig: getZenithConfig,
  updateConfig: updateZenithConfig,
  getCurrentSnapshot: getZenithSnapshot,
  TREND_OPTIONS: ZENITH_TREND_OPTIONS,
  VOLATILITY_OPTIONS: ZENITH_VOLATILITY_OPTIONS,
} = require('../data/zenithCoin');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

// POST /api/admin/verify — código de administrador -> token de administrador.
router.post('/verify', adminLimiter, (req, res) => {
  const configuredCode = process.env.ADMIN_CODE;
  if (!configuredCode) {
    return res.status(503).json({
      error: 'El panel de administrador no está configurado en el servidor (falta ADMIN_CODE).',
    });
  }

  const { code } = req.body;
  if (!code || String(code) !== configuredCode) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token });
});

// GET /api/admin/pending — todo lo que está esperando revisión, agrupado
// por tipo. Es lo que llena la pantalla principal del panel.
router.get('/pending', requireAdmin, (req, res) => {
  res.json({
    deposits: getPendingDeposits(),
    withdrawals: getPendingWithdrawals(),
    trades: getPendingTrades(),
  });
});

// GET /api/admin/users — todos los usuarios registrados, con su perfil
// completo, cuentas/balances/posiciones (con equity y leverage incluidos,
// para poder editarlos), insignia aproximada y cantidad de documentos
// subidos.
router.get('/users', requireAdmin, (req, res) => {
  res.json(getAllUsersAdminView());
});

// GET /api/admin/users/:userId/accounts — cuentas de un usuario, para
// elegir a cuál va un depósito/retiro al aprobarlo.
router.get('/users/:userId/accounts', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  res.json(getAccountsByUser(userId));
});

// ---- Edición directa de usuarios (balance, equity, leverage, posiciones) ----
//
// A pedido de Lucas: puede corregir directamente lo que ve un cliente sin
// que este tenga que pedir nada primero. El cambio queda agendado (misma
// demora de 1-2 min que el resto del sitio, ver data/store.js) — no se ve
// al instante ni siquiera del lado del admin la próxima vez que recarga
// "Usuarios registrados" hasta que se aplica de verdad.

// PUT /api/admin/accounts/:id/edit { balance?, equity?, leverage? }
router.put('/accounts/:id/edit', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const fields = {};
  if (req.body.balance !== undefined) fields.balance = Number(req.body.balance);
  if (req.body.equity !== undefined) fields.equity = Number(req.body.equity);
  if (req.body.leverage !== undefined) fields.leverage = String(req.body.leverage);

  const result = requestAccountEdit({ id, fields });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.account);
});

// POST /api/admin/holdings { userId, accountId, asset, symbol, quantity, avgPrice }
// -> crea una posición nueva para ese usuario (queda invisible para él
// hasta que se aplique).
router.post('/holdings', requireAdmin, (req, res) => {
  const userId = Number(req.body.userId);
  const accountId = Number(req.body.accountId);
  const { asset, symbol } = req.body;
  const quantity = Number(req.body.quantity);
  const avgPrice = Number(req.body.avgPrice);

  const result = requestHoldingCreate({ userId, accountId, asset, symbol, quantity, avgPrice });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.holding);
});

// PUT /api/admin/holdings/:id/edit { quantity?, avgPrice? }
router.put('/holdings/:id/edit', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const fields = {};
  if (req.body.quantity !== undefined) fields.quantity = Number(req.body.quantity);
  if (req.body.avgPrice !== undefined) fields.avgPrice = Number(req.body.avgPrice);

  const result = requestHoldingEdit({ id, fields });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.holding);
});

// DELETE /api/admin/holdings/:id -> elimina una posición (con la misma
// demora simulada, no al instante).
router.delete('/holdings/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = requestHoldingDelete({ id });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.holding);
});

// ---- Depósitos ----

router.put('/deposits/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const accountId = Number(req.body.accountId);
  const amount = Number(req.body.amount);

  if (!accountId) return res.status(400).json({ error: 'Selecciona a qué cuenta va este depósito' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número mayor a 0' });
  }

  const result = approveDeposit({ id, accountId, amount });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.put('/deposits/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = rejectDeposit({ id });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ---- Retiros ----

router.put('/withdrawals/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const accountId = Number(req.body.accountId);
  const amount = Number(req.body.amount);

  if (!accountId) return res.status(400).json({ error: 'Selecciona de qué cuenta sale este retiro' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número mayor a 0' });
  }

  const result = approveWithdrawal({ id, accountId, amount });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.put('/withdrawals/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = rejectWithdrawal({ id });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ---- Compras / ventas ----

router.put('/trades/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const quantity = Number(req.body.quantity);
  const price = Number(req.body.price);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser un número mayor a 0' });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
  }

  const result = approveTrade({ id, quantity, price });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.put('/trades/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = rejectTrade({ id });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// ---- Buzón de quejas y peticiones (soporte) ----

// GET /api/admin/support -> todas las peticiones de todos los clientes,
// abiertas primero.
router.get('/support', requireAdmin, (req, res) => {
  res.json(getAllTickets());
});

// PUT /api/admin/support/:id/reply { reply } -> responde una petición; se
// ve del lado del cliente de inmediato (no pasa por la demora de 1-2 min,
// esto no mueve saldo ni cantidades, es solo un mensaje de soporte).
router.put('/support/:id/reply', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = replyToTicket({ id, reply: req.body.reply });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.ticket);
});

// ---- Documentos subidos por los usuarios ----

// GET /api/admin/documents -> todos los PDFs subidos por cualquier usuario,
// más reciente primero.
router.get('/documents', requireAdmin, (req, res) => {
  res.json(getAllDocuments());
});

// GET /api/admin/documents/:id/download -> descarga cualquier documento
router.get('/documents/:id/download', requireAdmin, (req, res) => {
  const doc = getDocumentById(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const fullPath = getFilePath(doc.storedName);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'El archivo ya no está disponible en el servidor' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/"/g, '')}"`);
  fs.createReadStream(fullPath).pipe(res);
});

// ---- Moneda simulada Zenith (ZNT) ----
//
// Lucas no edita un precio exacto — elige una tendencia y una volatilidad,
// y el sistema genera las velas solo (ver data/zenithCoin.js).

// GET /api/admin/zenith-coin -> tendencia/volatilidad actual + snapshot de
// precio, para que el panel muestre el estado antes de cambiar nada.
router.get('/zenith-coin', requireAdmin, (req, res) => {
  res.json({
    config: getZenithConfig(),
    snapshot: getZenithSnapshot(),
    options: { trends: ZENITH_TREND_OPTIONS, volatilities: ZENITH_VOLATILITY_OPTIONS },
  });
});

// PUT /api/admin/zenith-coin -> cambia tendencia y/o volatilidad para
// adelante (no afecta las velas ya generadas).
router.put('/zenith-coin', requireAdmin, (req, res) => {
  const { trend, volatility } = req.body;
  const result = updateZenithConfig({ trend, volatility });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

module.exports = router;
