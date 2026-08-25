// Motor de compra/venta simulado (Fase 0 del roadmap): compra y venta de
// activos de cripto usando el precio en vivo que el frontend obtiene de
// CoinGecko. No hay dinero real de por medio — el "saldo" es el balance de
// la cuenta demo, y comprar/vender simplemente mueve ese balance y crea/
// actualiza una posición (holding).

const express = require('express');
const {
  getAccountById,
  getHoldingsByUser,
  getTradesByUser,
  createPendingTrade,
  getOptionsByUser,
  openOption,
  resolveOption,
  OPTION_ALLOWED_DURATIONS,
} = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function parseOrder(body) {
  const accountId = Number(body.accountId);
  const asset = String(body.asset || '');
  const symbol = String(body.symbol || asset);
  const quantity = Number(body.quantity);
  const price = Number(body.price);

  if (!accountId) return { error: 'Selecciona una cuenta' };
  if (!asset) return { error: 'Activo inválido' };
  if (!quantity || quantity <= 0) return { error: 'La cantidad debe ser mayor a 0' };
  if (!price || price <= 0) return { error: 'Precio inválido' };

  return { accountId, asset, symbol, quantity, price };
}

// GET /api/trading/holdings -> posiciones abiertas del usuario logueado
router.get('/holdings', (req, res) => {
  res.json(getHoldingsByUser(req.user.id));
});

// GET /api/trading/trades -> historial de operaciones (compras/ventas)
router.get('/trades', (req, res) => {
  res.json(getTradesByUser(req.user.id));
});

// POST /api/trading/buy -> queda "pendiente": no mueve el balance ni crea
// la posición todavía, eso pasa recién cuando se aprueba desde el panel
// de administrador (ver routes/admin.js).
router.post('/buy', (req, res) => {
  const parsed = parseOrder(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const account = getAccountById(parsed.accountId, req.user.id);
  if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' });
  const total = Number((parsed.quantity * parsed.price).toFixed(2));
  if (total > account.balance) {
    return res.status(400).json({ error: 'Saldo insuficiente en esta cuenta para esta compra' });
  }

  const result = createPendingTrade({ userId: req.user.id, side: 'compra', ...parsed });
  if (result.error) return res.status(400).json({ error: result.error });

  res.status(201).json(result);
});

// POST /api/trading/sell -> igual que comprar, queda pendiente de
// aprobación. Se avisa de una vez si claramente no hay suficiente cantidad
// para vender (aviso amistoso) — la validación que de verdad cuenta es la
// que se hace al aprobar, por si la posición cambió mientras tanto.
router.post('/sell', (req, res) => {
  const parsed = parseOrder(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const holdings = getHoldingsByUser(req.user.id);
  const holding = holdings.find((h) => h.accountId === parsed.accountId && h.asset === parsed.asset);
  if (!holding || parsed.quantity > holding.quantity) {
    return res.status(400).json({ error: 'No tienes suficiente cantidad de este activo para vender' });
  }

  const result = createPendingTrade({ userId: req.user.id, side: 'venta', ...parsed });
  if (result.error) return res.status(400).json({ error: result.error });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// Opciones Sube/Baja (panel estilo IQ Option)
// ---------------------------------------------------------------------

function parseOptionOrder(body) {
  const accountId = Number(body.accountId);
  const asset = String(body.asset || '');
  const symbol = String(body.symbol || asset);
  const direction = body.direction === 'lower' ? 'lower' : body.direction === 'higher' ? 'higher' : null;
  const amount = Number(body.amount);
  const entryPrice = Number(body.entryPrice);
  const durationSeconds = Number(body.durationSeconds);

  if (!accountId) return { error: 'Selecciona una cuenta' };
  if (!asset) return { error: 'Activo inválido' };
  if (!direction) return { error: 'Elige Sube o Baja' };
  if (!amount || amount <= 0) return { error: 'El monto debe ser mayor a 0' };
  if (!entryPrice || entryPrice <= 0) return { error: 'Precio de entrada inválido' };
  if (!OPTION_ALLOWED_DURATIONS.includes(durationSeconds)) {
    return { error: 'Duración inválida' };
  }

  return { accountId, asset, symbol, direction, amount, entryPrice, durationSeconds };
}

// GET /api/trading/options -> historial de operaciones Sube/Baja del usuario
router.get('/options', (req, res) => {
  res.json(getOptionsByUser(req.user.id));
});

// POST /api/trading/options/open -> abre una operación (descuenta el monto de la cuenta)
router.post('/options/open', (req, res) => {
  const parsed = parseOptionOrder(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const result = openOption({ userId: req.user.id, ...parsed });
  if (result.error) return res.status(400).json({ error: result.error });

  res.status(201).json(result);
});

// POST /api/trading/options/:id/resolve -> liquida una operación ya vencida
router.post('/options/:id/resolve', (req, res) => {
  const optionId = Number(req.params.id);
  const exitPrice = Number(req.body.exitPrice);

  if (!optionId) return res.status(400).json({ error: 'Operación inválida' });
  if (!exitPrice || exitPrice <= 0) return res.status(400).json({ error: 'Precio de salida inválido' });

  const result = resolveOption({ userId: req.user.id, optionId, exitPrice });
  if (result.error) return res.status(400).json({ error: result.error });

  res.json(result);
});

module.exports = router;
