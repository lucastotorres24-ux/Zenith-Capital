// Capa de acceso a datos. Las rutas (routes/*.js) no necesitan saber cómo se
// guardan los datos, solo llaman a estas funciones. Por dentro, cada función
// carga el archivo data/data.json, hace el cambio, y lo vuelve a guardar —
// simple y suficiente para el tráfico de un proyecto de práctica.

const { load, save } = require('./db');
const { getCurrentSnapshot, getCandles } = require('./zenithCoin');

// ---- Demora simulada de revisión manual (1-2 minutos) ----
//
// A pedido de Lucas: cuando él aprueba o rechaza algo desde el panel de
// administrador, el cliente NO ve el cambio al instante — tarda entre 1 y
// 2 minutos (al azar) en reflejarse, para que se sienta como una revisión
// humana real y no como un robot aprobando en cero segundos. Aplica
// siempre, para cualquier usuario (no es algo especial de sus pruebas).
//
// Cómo funciona por dentro: al aprobar/rechazar, el registro (depósito,
// retiro u operación) NO se modifica todavía — solo se le anota qué
// decisión tomó Lucas (`pendingAction`/`pendingPayload`) y cuándo debe
// aplicarse de verdad (`applyAt`). El registro sigue viéndose "en
// proceso" para el usuario durante toda esa ventana. `runDueAdminActions`
// revisa en cada request si ya se cumplió ese plazo y, si es así, recién
// ahí mueve el balance/holdings y pasa el registro a su estado final.
//
// Se resuelve así (revisando en cada request, sin setTimeout) para que
// sea robusto si el servidor se reinicia o se duerme un rato — no
// depende de que el proceso de Node siga vivo sin interrupción durante
// toda la ventana de espera.
const ADMIN_DELAY_MIN_MS = 60 * 1000;
const ADMIN_DELAY_MAX_MS = 120 * 1000;

function computeApplyAt() {
  const delay = ADMIN_DELAY_MIN_MS + Math.random() * (ADMIN_DELAY_MAX_MS - ADMIN_DELAY_MIN_MS);
  return new Date(Date.now() + delay).toISOString();
}

// Los campos `pendingAction`/`pendingPayload`/`applyAt`/`adminDecidedAt`
// son detalles internos de la demora simulada (ver arriba) — no se le
// muestran al usuario dueño del registro, para que de verdad se sienta
// como una revisión en curso y no se le "spoilee" ni cuándo se resuelve
// ni el monto final que Lucas dejó editado. Las vistas del ADMIN
// (getPendingDeposits, getAllUsersAdminView, etc.) no pasan por acá.
function stripPendingInternals(record) {
  const { pendingAction, pendingPayload, applyAt, adminDecidedAt, pendingAdminEdit, ...publicRecord } = record;
  return publicRecord;
}

// ---- Users ----

function findUserByUsername(username) {
  const db = load();
  return db.users.find((u) => u.username === username) || null;
}

function createUser({ username, passwordHash, fullName, email, phone, termsAcceptedAt }) {
  const db = load();
  const user = {
    id: db.nextUserId++,
    username,
    passwordHash,
    fullName,
    email,
    phone,
    birthDate: null,
    address: null,
    termsAcceptedAt,
    createdAt: new Date().toISOString(),
    // Automatización de inversión (Diamante/Platino): activada por
    // defecto, pero la persona la puede apagar desde el panel de
    // Asesoría IA una vez alcanza ese rango (ver routes/ai.js).
    autoInvestEnabled: true,
    lastAutoInvestAt: null,
  };
  db.users.push(user);
  save(db);
  return publicUser(user);
}

// Versión del usuario segura para mandar al frontend (sin passwordHash).
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    birthDate: user.birthDate,
    address: user.address,
    // `?? true` para que las cuentas creadas antes de este campo existir
    // (como la demo semilla) sigan teniendo la automatización activada.
    autoInvestEnabled: user.autoInvestEnabled ?? true,
  };
}

function setAutoInvestEnabled(userId, enabled) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.autoInvestEnabled = Boolean(enabled);
  save(db);
  return publicUser(user);
}

function getUserProfile(userId) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  return user ? publicUser(user) : null;
}

function updateUserProfile(userId, { phone, birthDate, address }) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  if (phone !== undefined) user.phone = phone;
  if (birthDate !== undefined) user.birthDate = birthDate;
  if (address !== undefined) user.address = address;
  save(db);
  return publicUser(user);
}

// ---- Accounts ----

function getAccountsByUser(userId) {
  const db = load();
  // `stripPendingInternals` esconde `pendingAdminEdit` (una edición directa
  // que Lucas dejó agendada desde el panel de administrador, ver "Edición
  // directa de usuarios" más abajo) para que el balance/equity/leverage
  // visible no cambie hasta que de verdad se aplique, 1-2 min después.
  return db.accounts.filter((a) => a.userId === userId).map(stripPendingInternals);
}

function getAccountById(id, userId) {
  const db = load();
  const account = db.accounts.find((a) => a.id === id && a.userId === userId);
  return account ? stripPendingInternals(account) : null;
}

function createAccount({ userId, accountNumber, accountType, currency, balance, equity, leverage }) {
  const db = load();
  const account = {
    id: db.nextAccountId++,
    userId,
    accountNumber,
    accountType,
    currency,
    balance,
    equity,
    leverage,
    createdAt: new Date().toISOString(),
  };
  db.accounts.push(account);
  save(db);
  return account;
}

function updateAccount(id, userId, fields) {
  const db = load();
  const account = db.accounts.find((a) => a.id === id && a.userId === userId);
  if (!account) return null;
  Object.assign(account, fields);
  save(db);
  return stripPendingInternals(account);
}

function deleteAccount(id, userId) {
  const db = load();
  const idx = db.accounts.findIndex((a) => a.id === id && a.userId === userId);
  if (idx === -1) return null;
  const [removed] = db.accounts.splice(idx, 1);
  save(db);
  return removed;
}

// ---- Deposits ----
//
// Un depósito nunca acredita saldo solo: queda "en_proceso" hasta que
// alguien lo aprueba desde el panel de administrador (ver
// approveDeposit) — recién ahí se elige a qué cuenta va y se suma el
// monto (que además se puede editar antes de aprobar).

function getDepositsByUser(userId) {
  const db = load();
  return db.deposits
    .filter((d) => d.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(stripPendingInternals);
}

function getPendingDeposits() {
  const db = load();
  return db.deposits
    .filter((d) => d.status === 'en_proceso' && !d.pendingAction)
    .map((d) => ({ ...d, username: findUserById(d.userId)?.username || `usuario #${d.userId}` }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function createDeposit({ userId, amount, bank, contact }) {
  const db = load();
  const deposit = {
    id: db.nextDepositId++,
    userId,
    amount,
    requestedAmount: amount,
    accountId: null,
    bank,
    contact,
    status: 'en_proceso',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  db.deposits.push(deposit);
  save(db);
  return deposit;
}

// Aprobar ya NO mueve el balance al instante: valida todo de una (para
// avisarle a Lucas de inmediato si algo está mal) y deja el depósito
// agendado — `finalizeDepositAction` es quien de verdad acredita el
// saldo, cuando se cumple `applyAt` (ver nota de "Demora simulada" arriba).
function approveDeposit({ id, accountId, amount }) {
  const db = load();
  const deposit = db.deposits.find((d) => d.id === id);
  if (!deposit) return { error: 'Depósito no encontrado' };
  if (deposit.status !== 'en_proceso' || deposit.pendingAction) {
    return { error: 'Este depósito ya fue resuelto' };
  }

  const account = db.accounts.find((a) => a.id === accountId && a.userId === deposit.userId);
  if (!account) return { error: 'Selecciona una cuenta válida de este usuario' };

  deposit.pendingAction = 'approve';
  deposit.pendingPayload = { accountId, amount };
  deposit.applyAt = computeApplyAt();
  deposit.adminDecidedAt = new Date().toISOString();

  save(db);
  return { deposit };
}

function rejectDeposit({ id }) {
  const db = load();
  const deposit = db.deposits.find((d) => d.id === id);
  if (!deposit) return { error: 'Depósito no encontrado' };
  if (deposit.status !== 'en_proceso' || deposit.pendingAction) {
    return { error: 'Este depósito ya fue resuelto' };
  }

  deposit.pendingAction = 'reject';
  deposit.applyAt = computeApplyAt();
  deposit.adminDecidedAt = new Date().toISOString();

  save(db);
  return { deposit };
}

// Aplica de verdad la decisión que Lucas ya tomó, una vez se cumple el
// plazo — acá sí se mueve el balance. `db` se pasa por referencia (viene
// de runDueAdminActions, que hace un solo load()/save() para todo).
function finalizeDepositAction(db, deposit) {
  if (deposit.pendingAction === 'approve') {
    const { accountId, amount } = deposit.pendingPayload;
    const account = db.accounts.find((a) => a.id === accountId && a.userId === deposit.userId);
    if (!account) {
      // La cuenta se borró mientras tanto: no hay a dónde acreditar. Se
      // rechaza para no perder el registro en el limbo para siempre.
      deposit.status = 'rechazado';
    } else {
      account.balance = Number((account.balance + amount).toFixed(2));
      deposit.status = 'completado';
      deposit.amount = amount;
      deposit.accountId = accountId;
    }
  } else {
    deposit.status = 'rechazado';
  }
  deposit.resolvedAt = new Date().toISOString();
  deposit.applied = true;
}

// ---- Withdrawals ----
//
// Mismo criterio que los depósitos: nunca se descuenta saldo solo. Al
// aprobar se elige de qué cuenta del usuario se descuenta (y se puede
// editar el monto antes de confirmar).

function getWithdrawalsByUser(userId) {
  const db = load();
  return db.withdrawals
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(stripPendingInternals);
}

function getPendingWithdrawals() {
  const db = load();
  return db.withdrawals
    .filter((w) => w.status === 'en_proceso' && !w.pendingAction)
    .map((w) => ({ ...w, username: findUserById(w.userId)?.username || `usuario #${w.userId}` }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function createWithdrawal({ userId, method, amount, contact }) {
  const db = load();
  const withdrawal = {
    id: db.nextWithdrawalId++,
    userId,
    method,
    amount,
    requestedAmount: amount,
    accountId: null,
    contact,
    status: 'en_proceso',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  db.withdrawals.push(withdrawal);
  save(db);
  return withdrawal;
}

function approveWithdrawal({ id, accountId, amount }) {
  const db = load();
  const withdrawal = db.withdrawals.find((w) => w.id === id);
  if (!withdrawal) return { error: 'Retiro no encontrado' };
  if (withdrawal.status !== 'en_proceso' || withdrawal.pendingAction) {
    return { error: 'Este retiro ya fue resuelto' };
  }

  const account = db.accounts.find((a) => a.id === accountId && a.userId === withdrawal.userId);
  if (!account) return { error: 'Selecciona una cuenta válida de este usuario' };
  if (amount > account.balance) {
    return { error: 'Esa cuenta no tiene saldo suficiente para este retiro' };
  }

  withdrawal.pendingAction = 'approve';
  withdrawal.pendingPayload = { accountId, amount };
  withdrawal.applyAt = computeApplyAt();
  withdrawal.adminDecidedAt = new Date().toISOString();

  save(db);
  return { withdrawal };
}

function rejectWithdrawal({ id }) {
  const db = load();
  const withdrawal = db.withdrawals.find((w) => w.id === id);
  if (!withdrawal) return { error: 'Retiro no encontrado' };
  if (withdrawal.status !== 'en_proceso' || withdrawal.pendingAction) {
    return { error: 'Este retiro ya fue resuelto' };
  }

  withdrawal.pendingAction = 'reject';
  withdrawal.applyAt = computeApplyAt();
  withdrawal.adminDecidedAt = new Date().toISOString();

  save(db);
  return { withdrawal };
}

function finalizeWithdrawalAction(db, withdrawal) {
  if (withdrawal.pendingAction === 'approve') {
    const { accountId, amount } = withdrawal.pendingPayload;
    const account = db.accounts.find((a) => a.id === accountId && a.userId === withdrawal.userId);
    if (!account || amount > account.balance) {
      // La cuenta desapareció o ya no tiene saldo suficiente (pudo cambiar
      // durante la espera): se rechaza en vez de dejar saldo en negativo.
      withdrawal.status = 'rechazado';
    } else {
      account.balance = Number((account.balance - amount).toFixed(2));
      withdrawal.status = 'completado';
      withdrawal.amount = amount;
      withdrawal.accountId = accountId;
    }
  } else {
    withdrawal.status = 'rechazado';
  }
  withdrawal.resolvedAt = new Date().toISOString();
  withdrawal.applied = true;
}

// ---- Holdings & Trades (compra/venta con aprobación manual) ----
//
// "holding" = una posición abierta de un activo dentro de una cuenta
// (cantidad + precio medio de compra). "trade" = el registro histórico de
// cada compra/venta. El precio de referencia lo manda el frontend (el
// precio en vivo de CoinGecko que el usuario está viendo en ese
// momento) — no hay verificación de mercado del lado del servidor, algo
// aceptable para un simulador de práctica pero que NO sería seguro en
// una plataforma real.
//
// A diferencia de la v1, comprar/vender YA NO mueve el balance ni las
// posiciones al instante: crea un trade con estado "pendiente", y recién
// se aplica de verdad (balance + holding) cuando se aprueba desde el
// panel de administrador — que además puede editar la cantidad y/o el
// precio antes de confirmar.

function getHoldingsByUser(userId) {
  const db = load();
  // Una posición que Lucas acaba de crear desde el panel de administrador
  // (pendingAdminEdit.type === 'create') todavía no existe de verdad para
  // el usuario — se esconde por completo hasta que se aplique, para que no
  // aparezca "de la nada" con cantidad 0 mientras espera su turno.
  return db.holdings
    .filter((h) => h.userId === userId && h.pendingAdminEdit?.type !== 'create')
    .map(stripPendingInternals);
}

function getTradesByUser(userId) {
  const db = load();
  return db.trades
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(stripPendingInternals);
}

function getPendingTrades() {
  const db = load();
  return db.trades
    .filter((t) => t.status === 'pendiente' && !t.pendingAction)
    .map((t) => ({ ...t, username: findUserById(t.userId)?.username || `usuario #${t.userId}` }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function createPendingTrade({ userId, accountId, asset, symbol, side, quantity, price, source = 'manual' }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === accountId && a.userId === userId);
  if (!account) return { error: 'Cuenta no encontrada' };

  const trade = {
    id: db.nextTradeId++,
    userId,
    accountId,
    asset,
    symbol,
    side, // 'compra' | 'venta'
    quantity,
    price,
    requestedQuantity: quantity,
    requestedPrice: price,
    total: Number((quantity * price).toFixed(2)),
    status: 'pendiente', // 'pendiente' | 'aprobada' | 'rechazada'
    // 'manual' = la persona la pidió desde el panel de trading; 'auto' =
    // la generó el motor de auto-inversión de Diamante/Platino (ver
    // runAutoInvestIfDue más abajo). Sirve solo para que el panel de
    // administrador pueda mostrar de dónde salió cada operación — el
    // resto del flujo de aprobación es exactamente el mismo para ambas.
    source,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  db.trades.push(trade);
  save(db);
  return { trade };
}

function approveTrade({ id, quantity, price }) {
  const db = load();
  const trade = db.trades.find((t) => t.id === id);
  if (!trade) return { error: 'Operación no encontrada' };
  if (trade.status !== 'pendiente' || trade.pendingAction) return { error: 'Esta operación ya fue resuelta' };

  const account = db.accounts.find((a) => a.id === trade.accountId && a.userId === trade.userId);
  if (!account) return { error: 'La cuenta de esta operación ya no existe' };

  const total = Number((quantity * price).toFixed(2));

  if (trade.side === 'compra') {
    if (total > account.balance) {
      return { error: 'Esa cuenta no tiene saldo suficiente para aprobar esta compra' };
    }
  } else {
    const holding = db.holdings.find(
      (h) => h.accountId === trade.accountId && h.userId === trade.userId && h.asset === trade.asset
    );
    if (!holding || quantity > holding.quantity) {
      return { error: 'Esa cuenta ya no tiene suficiente cantidad de este activo para aprobar esta venta' };
    }
  }

  trade.pendingAction = 'approve';
  trade.pendingPayload = { quantity, price, total };
  trade.applyAt = computeApplyAt();
  trade.adminDecidedAt = new Date().toISOString();

  save(db);
  return { trade };
}

function rejectTrade({ id }) {
  const db = load();
  const trade = db.trades.find((t) => t.id === id);
  if (!trade) return { error: 'Operación no encontrada' };
  if (trade.status !== 'pendiente' || trade.pendingAction) return { error: 'Esta operación ya fue resuelta' };

  trade.pendingAction = 'reject';
  trade.applyAt = computeApplyAt();
  trade.adminDecidedAt = new Date().toISOString();

  save(db);
  return { trade };
}

// Re-valida contra el estado actual (pudo cambiar durante la espera de
// 1-2 min: otra operación de por medio, etc.) antes de mover de verdad el
// balance/holding — si ya no cuadra, se rechaza en vez de dejar algo
// inconsistente (saldo negativo, cantidad negativa).
function finalizeTradeAction(db, trade) {
  if (trade.pendingAction !== 'approve') {
    trade.status = 'rechazada';
    trade.resolvedAt = new Date().toISOString();
    trade.applied = true;
    return;
  }

  const { quantity, price, total } = trade.pendingPayload;
  const account = db.accounts.find((a) => a.id === trade.accountId && a.userId === trade.userId);

  if (!account) {
    trade.status = 'rechazada';
    trade.resolvedAt = new Date().toISOString();
    trade.applied = true;
    return;
  }

  if (trade.side === 'compra') {
    if (total > account.balance) {
      trade.status = 'rechazada';
      trade.resolvedAt = new Date().toISOString();
      trade.applied = true;
      return;
    }
    account.balance = Number((account.balance - total).toFixed(2));

    let holding = db.holdings.find(
      (h) => h.accountId === trade.accountId && h.userId === trade.userId && h.asset === trade.asset
    );
    if (holding) {
      const newQuantity = holding.quantity + quantity;
      holding.avgPrice = (holding.avgPrice * holding.quantity + price * quantity) / newQuantity;
      holding.quantity = newQuantity;
    } else {
      holding = {
        id: db.nextHoldingId++,
        userId: trade.userId,
        accountId: trade.accountId,
        asset: trade.asset,
        symbol: trade.symbol,
        quantity,
        avgPrice: price,
        createdAt: new Date().toISOString(),
      };
      db.holdings.push(holding);
    }
  } else {
    const holding = db.holdings.find(
      (h) => h.accountId === trade.accountId && h.userId === trade.userId && h.asset === trade.asset
    );
    if (!holding || quantity > holding.quantity) {
      trade.status = 'rechazada';
      trade.resolvedAt = new Date().toISOString();
      trade.applied = true;
      return;
    }
    account.balance = Number((account.balance + total).toFixed(2));
    holding.quantity = Number((holding.quantity - quantity).toFixed(8));
    if (holding.quantity <= 0) {
      db.holdings = db.holdings.filter((h) => h.id !== holding.id);
    }
  }

  trade.quantity = quantity;
  trade.price = price;
  trade.total = total;
  trade.status = 'aprobada';
  trade.resolvedAt = new Date().toISOString();
  trade.applied = true;
}

// ---- Edición directa de usuarios desde el panel de administrador ----
//
// A pedido de Lucas: además de aprobar/rechazar solicitudes que el cliente
// ya pidió, el panel de administrador ahora puede editar directamente el
// balance/equity/leverage de una cuenta, o crear/editar/eliminar una
// posición (holding) de cualquier usuario — sin que el cliente tenga que
// pedir nada primero. Sigue el mismo criterio que el resto del sitio (Q2
// del pedido original): el cambio NO se ve al instante, tarda la misma
// demora simulada de 1-2 minutos en aplicarse de verdad
// (`pendingAdminEdit` + `runDueAdminActions`, mismo patrón que
// pendingAction/pendingPayload de depósitos/retiros/operaciones, con otro
// nombre para no confundirlo con "aprobar/rechazar una solicitud").
//
// Antes esta vista era intencionalmente de solo lectura (ver nota vieja en
// getAllUsersAdminView) — se habilita ahora a pedido explícito de Lucas.
function requestAccountEdit({ id, fields }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === id);
  if (!account) return { error: 'Cuenta no encontrada' };
  if (account.pendingAdminEdit) {
    return { error: 'Esta cuenta ya tiene una edición pendiente de aplicarse — espera a que termine.' };
  }

  const nextFields = {};
  if (fields.balance !== undefined) {
    if (!Number.isFinite(fields.balance) || fields.balance < 0) {
      return { error: 'El balance debe ser un número mayor o igual a 0' };
    }
    nextFields.balance = Number(fields.balance.toFixed(2));
  }
  if (fields.equity !== undefined) {
    if (!Number.isFinite(fields.equity) || fields.equity < 0) {
      return { error: 'El equity debe ser un número mayor o igual a 0' };
    }
    nextFields.equity = Number(fields.equity.toFixed(2));
  } else if (nextFields.balance !== undefined) {
    // A pedido de Lucas: si edita el balance y NO dice explícitamente un
    // equity distinto, el equity se mueve junto con el balance (queda
    // igual al balance nuevo, o sea sin ganancia/pérdida flotante). Esto
    // evita que quede un equity "viejo" desactualizado — el dashboard del
    // cliente calcula el P/L flotante y el "Equity total" directamente de
    // este campo (ver dashboard.js), así que sin este ajuste, esos números
    // se verían inconsistentes después de un cambio de balance manual.
    // Si Lucas SÍ quiere simular una ganancia/pérdida flotante distinta,
    // solo tiene que escribir un valor de Equity distinto en el mismo
    // formulario — eso sigue funcionando igual (entra por la rama de
    // arriba y respeta el valor que él elija).
    nextFields.equity = nextFields.balance;
  }
  if (fields.leverage !== undefined) {
    if (!fields.leverage || typeof fields.leverage !== 'string') {
      return { error: 'El apalancamiento no es válido' };
    }
    nextFields.leverage = fields.leverage;
  }
  if (!Object.keys(nextFields).length) {
    return { error: 'No hay ningún cambio para aplicar' };
  }

  account.pendingAdminEdit = {
    type: 'edit',
    fields: nextFields,
    applyAt: computeApplyAt(),
    decidedAt: new Date().toISOString(),
  };
  save(db);
  return { account };
}

function requestHoldingEdit({ id, fields }) {
  const db = load();
  const holding = db.holdings.find((h) => h.id === id);
  if (!holding) return { error: 'Posición no encontrada' };
  if (holding.pendingAdminEdit) {
    return { error: 'Esta posición ya tiene una edición pendiente de aplicarse — espera a que termine.' };
  }

  const nextFields = {};
  if (fields.quantity !== undefined) {
    if (!Number.isFinite(fields.quantity) || fields.quantity <= 0) {
      return { error: 'La cantidad debe ser un número mayor a 0' };
    }
    nextFields.quantity = fields.quantity;
  }
  if (fields.avgPrice !== undefined) {
    if (!Number.isFinite(fields.avgPrice) || fields.avgPrice <= 0) {
      return { error: 'El precio promedio debe ser un número mayor a 0' };
    }
    nextFields.avgPrice = fields.avgPrice;
  }
  if (!Object.keys(nextFields).length) {
    return { error: 'No hay ningún cambio para aplicar' };
  }

  holding.pendingAdminEdit = {
    type: 'edit',
    fields: nextFields,
    applyAt: computeApplyAt(),
    decidedAt: new Date().toISOString(),
  };
  save(db);
  return { holding };
}

// Crea una posición nueva para un usuario — queda invisible para él
// (ver getHoldingsByUser) hasta que se aplique de verdad.
function requestHoldingCreate({ userId, accountId, asset, symbol, quantity, avgPrice }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === accountId && a.userId === userId);
  if (!account) return { error: 'Cuenta no encontrada para este usuario' };
  if (!asset || !symbol) return { error: 'Selecciona un activo válido' };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'La cantidad debe ser un número mayor a 0' };
  }
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
    return { error: 'El precio promedio debe ser un número mayor a 0' };
  }
  const existing = db.holdings.find(
    (h) => h.userId === userId && h.accountId === accountId && h.asset === asset && !h.pendingAdminEdit
  );
  if (existing) {
    return { error: 'Este usuario ya tiene una posición de este activo en esa cuenta — edítala en vez de crear otra.' };
  }

  const holding = {
    id: db.nextHoldingId++,
    userId,
    accountId,
    asset,
    symbol,
    quantity: 0,
    avgPrice: 0,
    createdAt: new Date().toISOString(),
    pendingAdminEdit: {
      type: 'create',
      fields: { quantity, avgPrice },
      applyAt: computeApplyAt(),
      decidedAt: new Date().toISOString(),
    },
  };
  db.holdings.push(holding);
  save(db);
  return { holding };
}

function requestHoldingDelete({ id }) {
  const db = load();
  const holding = db.holdings.find((h) => h.id === id);
  if (!holding) return { error: 'Posición no encontrada' };
  if (holding.pendingAdminEdit) {
    return { error: 'Esta posición ya tiene una edición pendiente de aplicarse — espera a que termine.' };
  }

  holding.pendingAdminEdit = {
    type: 'delete',
    fields: {},
    applyAt: computeApplyAt(),
    decidedAt: new Date().toISOString(),
  };
  save(db);
  return { holding };
}

function finalizeAccountEdit(db, account) {
  const { type, fields } = account.pendingAdminEdit;
  if (type === 'edit') {
    Object.assign(account, fields);
  }
  delete account.pendingAdminEdit;
}

function finalizeHoldingEdit(db, holding) {
  const { type, fields } = holding.pendingAdminEdit;
  if (type === 'delete') {
    db.holdings = db.holdings.filter((h) => h.id !== holding.id);
    return;
  }
  if (type === 'create' || type === 'edit') {
    Object.assign(holding, fields);
  }
  delete holding.pendingAdminEdit;
}

// Revisa los tres tipos de solicitud (depósitos, retiros, operaciones) y
// aplica de verdad cualquiera cuyo plazo de espera ya se haya cumplido.
// Se llama en cada request (ver server.js) en vez de con un setTimeout,
// para que sea robusto a reinicios/al servidor durmiéndose un rato.
function runDueAdminActions() {
  const db = load();
  const now = Date.now();
  let changed = false;

  db.deposits.forEach((d) => {
    if (d.pendingAction && !d.applied && d.applyAt && new Date(d.applyAt).getTime() <= now) {
      finalizeDepositAction(db, d);
      changed = true;
    }
  });
  db.withdrawals.forEach((w) => {
    if (w.pendingAction && !w.applied && w.applyAt && new Date(w.applyAt).getTime() <= now) {
      finalizeWithdrawalAction(db, w);
      changed = true;
    }
  });
  db.trades.forEach((t) => {
    if (t.pendingAction && !t.applied && t.applyAt && new Date(t.applyAt).getTime() <= now) {
      finalizeTradeAction(db, t);
      changed = true;
    }
  });
  db.accounts.forEach((a) => {
    if (a.pendingAdminEdit && new Date(a.pendingAdminEdit.applyAt).getTime() <= now) {
      finalizeAccountEdit(db, a);
      changed = true;
    }
  });
  // De atrás para adelante porque finalizeHoldingEdit puede eliminar el
  // elemento del array (tipo 'delete') — recorrer de adelante hacia atrás
  // mientras se borran elementos se saltaría el siguiente.
  for (let i = db.holdings.length - 1; i >= 0; i--) {
    const h = db.holdings[i];
    if (h.pendingAdminEdit && new Date(h.pendingAdminEdit.applyAt).getTime() <= now) {
      finalizeHoldingEdit(db, h);
      changed = true;
    }
  }

  if (changed) save(db);
}

// ---- Auto-inversión real (Diamante/Platino) ----
//
// Cada cierto tiempo (AUTO_INVEST_INTERVAL_MS), revisa a cada cliente que
// ya alcanzó el rango Diamante o Platino (mismo cálculo que las Insignias
// Zenith, ver getInvestedProxyByUser/getRankForAmount) y decide si abrir
// una pequeña operación de compra o venta sobre Zenith (ZNT) — la única
// moneda de la que este servidor conoce el precio real en vivo (las demás
// cripto las trae el navegador directo de CoinGecko, sin pasar nunca por
// el backend, así que no hay forma confiable de operarlas por cuenta
// propia desde acá). La decisión es simple a propósito: sigue la
// variación de las últimas 24h de ZNT — si viene subiendo, intenta
// comprar un poco más; si viene bajando, intenta vender parte de lo que
// el cliente ya tiene.
//
// Importante: la operación que genera entra a la MISMA cola de
// aprobación de administrador que cualquier compra/venta manual
// (createPendingTrade) — Lucas conserva el control final y se aplica la
// misma demora de 1-2 minutos de siempre. Lo único que cambia es que el
// cliente ya no tiene que decidir ni confirmar la operación él mismo.
//
// Se revisa "perezosamente" en cada request (mismo patrón que
// runDueAdminActions, los mensajes de Comunidad Zenith y las velas de
// ZNT) en vez de con un temporizador de fondo, para que sobreviva si el
// servidor se reinicia o se duerme un rato (plan gratuito de Render).
const AUTO_INVEST_INTERVAL_MS = 12 * 60 * 1000; // evalúa a cada cliente cada ~12 minutos
const AUTO_INVEST_TIER_KEYS = ['diamante', 'platino'];
const AUTO_INVEST_ASSET = 'zenith';
const AUTO_INVEST_SYMBOL = 'ZNT';
const AUTO_INVEST_MAX_PCT = 0.05; // nunca arriesga más del 5% del balance/posición por operación
const AUTO_INVEST_MIN_USD = 10; // por debajo de esto no vale la pena generar la operación
const AUTO_INVEST_TREND_THRESHOLD = 0.2; // % mínimo de variación 24h para actuar

function runAutoInvestIfDue() {
  const now = Date.now();
  const snapshot = getCurrentSnapshot();
  if (!snapshot) return; // ZNT todavía no generó velas (servidor recién arrancado)

  // Paso 1 (solo lectura): decide qué le tocaría a cada cliente elegible,
  // sin escribir nada todavía.
  const readDb = load();
  const decisions = [];

  readDb.users.forEach((u) => {
    const enabled = u.autoInvestEnabled ?? true;
    if (!enabled) return;

    const dueAgain =
      !u.lastAutoInvestAt || now - new Date(u.lastAutoInvestAt).getTime() >= AUTO_INVEST_INTERVAL_MS;
    if (!dueAgain) return;

    const investedProxy = getInvestedProxyByUser(u.id);
    const rank = getRankForAmount(investedProxy);
    if (!rank || !AUTO_INVEST_TIER_KEYS.includes(rank.key)) return;

    const account = readDb.accounts
      .filter((a) => a.userId === u.id)
      .sort((a, b) => b.balance - a.balance)[0];

    let action = null;
    if (account) {
      const trendUp = snapshot.change24h >= AUTO_INVEST_TREND_THRESHOLD;
      const trendDown = snapshot.change24h <= -AUTO_INVEST_TREND_THRESHOLD;

      if (trendUp) {
        const amount = Math.min(account.balance * AUTO_INVEST_MAX_PCT, account.balance);
        const quantity = Number((amount / snapshot.price).toFixed(6));
        if (amount >= AUTO_INVEST_MIN_USD && quantity > 0) {
          action = { accountId: account.id, side: 'compra', quantity, price: snapshot.price };
        }
      } else if (trendDown) {
        const holding = readDb.holdings.find(
          (h) => h.accountId === account.id && h.userId === u.id && h.asset === AUTO_INVEST_ASSET
        );
        if (holding && holding.quantity > 0) {
          const quantity = Number((holding.quantity * AUTO_INVEST_MAX_PCT).toFixed(6));
          const amount = quantity * snapshot.price;
          if (amount >= AUTO_INVEST_MIN_USD && quantity > 0) {
            action = { accountId: account.id, side: 'venta', quantity, price: snapshot.price };
          }
        }
      }
    }

    decisions.push({ userId: u.id, action });
  });

  if (!decisions.length) return;

  // Paso 2: crea la operación pendiente de cada decisión. Cada llamada
  // hace su propio load/save fresco (igual que si la hubiera pedido la
  // persona a mano desde el panel de trading), así que es seguro
  // encadenarlas sin pisarse entre sí ni con lo que se leyó en el paso 1.
  decisions.forEach(({ userId, action }) => {
    if (!action) return;
    createPendingTrade({
      userId,
      accountId: action.accountId,
      asset: AUTO_INVEST_ASSET,
      symbol: AUTO_INVEST_SYMBOL,
      side: action.side,
      quantity: action.quantity,
      price: action.price,
      source: 'auto',
    });
  });

  // Paso 3: en una sola lectura/escritura fresca al final (después de que
  // ya se guardaron todas las operaciones nuevas), marca a todos los
  // clientes evaluados como "revisados ahora" -- haya generado o no una
  // operación -- para no volver a evaluarlos hasta el próximo intervalo.
  const writeDb = load();
  const nowIso = new Date().toISOString();
  decisions.forEach(({ userId }) => {
    const u = writeDb.users.find((x) => x.id === userId);
    if (u) u.lastAutoInvestAt = nowIso;
  });
  save(writeDb);
}

// ---- Opciones Sube/Baja (panel estilo IQ Option) ----
//
// Es una apuesta de precio a corto plazo sobre el mismo balance de la
// cuenta (no un saldo aparte): al abrir la operación se descuenta el monto
// de inmediato. Si al vencer el tiempo aciertas la dirección (sube/baja),
// recibes tu monto de vuelta más el porcentaje de retorno pactado; si no
// aciertas, el monto apostado ya quedó descontado. Igual que el resto del
// simulador, el precio lo manda el frontend (precio real de CoinGecko en
// cada momento) — no hay verificación de mercado del lado del servidor.

const OPTION_PAYOUT_PERCENT = 85;
const OPTION_ALLOWED_DURATIONS = [30, 60, 120, 300];

function getOptionsByUser(userId) {
  const db = load();
  return db.options
    .filter((o) => o.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function openOption({ userId, accountId, asset, symbol, direction, amount, entryPrice, durationSeconds }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === accountId && a.userId === userId);
  if (!account) return { error: 'Cuenta no encontrada' };
  if (amount > account.balance) {
    return { error: 'Saldo insuficiente en esta cuenta para esta operación' };
  }

  account.balance = Number((account.balance - amount).toFixed(2));

  const now = Date.now();
  const option = {
    id: db.nextOptionId++,
    userId,
    accountId,
    asset,
    symbol,
    direction, // 'higher' | 'lower'
    amount,
    entryPrice,
    payoutPercent: OPTION_PAYOUT_PERCENT,
    durationSeconds,
    status: 'abierta', // 'abierta' | 'ganada' | 'perdida' | 'empate'
    exitPrice: null,
    profit: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + durationSeconds * 1000).toISOString(),
    resolvedAt: null,
  };
  db.options.push(option);
  save(db);
  return { account, option };
}

function resolveOption({ userId, optionId, exitPrice }) {
  const db = load();
  const option = db.options.find((o) => o.id === optionId && o.userId === userId);
  if (!option) return { error: 'Operación no encontrada' };
  if (option.status !== 'abierta') return { error: 'Esta operación ya fue resuelta' };
  if (Date.now() < new Date(option.expiresAt).getTime()) {
    return { error: 'Todavía no se cumple el tiempo de esta operación' };
  }

  const account = db.accounts.find((a) => a.id === option.accountId && a.userId === userId);

  let status;
  let profit;
  if (exitPrice === option.entryPrice) {
    status = 'empate';
    profit = 0;
    if (account) account.balance = Number((account.balance + option.amount).toFixed(2));
  } else {
    const wentUp = exitPrice > option.entryPrice;
    const won = (option.direction === 'higher' && wentUp) || (option.direction === 'lower' && !wentUp);
    if (won) {
      status = 'ganada';
      profit = Number((option.amount * (option.payoutPercent / 100)).toFixed(2));
      if (account) account.balance = Number((account.balance + option.amount + profit).toFixed(2));
    } else {
      status = 'perdida';
      profit = -option.amount;
    }
  }

  option.status = status;
  option.exitPrice = exitPrice;
  option.profit = profit;
  option.resolvedAt = new Date().toISOString();

  save(db);
  return { account, option };
}

// ---- Cambio de contraseña ----

function findUserById(id) {
  const db = load();
  return db.users.find((u) => u.id === id) || null;
}

function updateUserPassword(userId, passwordHash) {
  const db = load();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.passwordHash = passwordHash;
  save(db);
  return { id: user.id, username: user.username };
}

// ---- Documentos (PDFs adjuntos por el usuario) ----
//
// El archivo en sí se guarda en disco (ver data/files.js) — aquí solo se
// guarda la metadata (quién lo subió, nombre original, dónde quedó
// guardado en disco, cuándo). `storedName` es lo que hace falta para poder
// encontrar el archivo real más adelante.

function addDocument({ userId, filename, storedName, size }) {
  const db = load();
  const doc = {
    id: db.nextDocumentId++,
    userId,
    filename,
    storedName,
    size,
    uploadedAt: new Date().toISOString(),
  };
  db.documents.push(doc);
  save(db);
  return doc;
}

function getDocumentsByUser(userId) {
  const db = load();
  return db.documents
    .filter((d) => d.userId === userId)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

function getDocumentById(id) {
  const db = load();
  return db.documents.find((d) => d.id === id) || null;
}

function getAllDocuments() {
  const db = load();
  return db.documents
    .map((d) => ({ ...d, username: findUserById(d.userId)?.username || `usuario #${d.userId}` }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

// ---- Insignias Zenith (Bronce/Plata/Oro/Diamante/Platino) ----
//
// A pedido de Lucas, la insignia refleja lo que el cliente tiene invertido
// AHORA MISMO (no lo que depositó históricamente): puede subir o bajar de
// rango con el tiempo. El valor real de mercado de las posiciones abiertas
// solo lo conoce el frontend (usa CoinGecko en vivo, el backend no tiene
// acceso a eso) — el frontend calcula y muestra la insignia con precios en
// vivo. Esta función de aquí es el mismo cálculo pero solo con datos que
// el backend sí tiene (balance + posiciones valoradas a su precio de
// compra, sin precio de mercado en vivo): sirve como una aproximación
// razonable para decidir del lado del servidor si alguien de verdad
// alcanza el rango Diamante antes de darle acceso a la asesoría IA — así
// ese acceso no depende solo de lo que diga el navegador.
const RANK_TIERS = [
  { key: 'platino', label: 'Platino', min: 10000 },
  { key: 'diamante', label: 'Diamante', min: 5000 },
  { key: 'oro', label: 'Oro', min: 1500 },
  { key: 'plata', label: 'Plata', min: 800 },
  { key: 'bronce', label: 'Bronce', min: 250 },
];

function getInvestedProxyByUser(userId) {
  const db = load();
  const balanceTotal = db.accounts
    .filter((a) => a.userId === userId)
    .reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const holdingsTotal = db.holdings
    .filter((h) => h.userId === userId)
    .reduce((sum, h) => sum + Number(h.quantity || 0) * Number(h.avgPrice || 0), 0);
  return Number((balanceTotal + holdingsTotal).toFixed(2));
}

function getRankForAmount(amount) {
  const tier = RANK_TIERS.find((t) => amount >= t.min);
  return tier || null; // null = todavía sin insignia (menos de 250)
}

// ---- Panel de "Usuarios registrados" (admin.html) ----
//
// Cada usuario que se registra aparece acá con su perfil completo, sus
// cuentas/balances/posiciones, su insignia (aproximada, con el mismo
// cálculo de getInvestedProxyByUser — puede no coincidir centavo a
// centavo con lo que ve el usuario, que usa precio en vivo) y cuántos
// documentos tiene subidos. A pedido explícito de Lucas, esta vista SÍ
// incluye lo necesario para editar directamente el balance/equity/
// leverage de una cuenta y crear/editar/eliminar posiciones (ver
// "Edición directa de usuarios" más arriba) — antes era de solo lectura,
// eso cambió en esta ronda de features.
function getAllUsersAdminView() {
  const db = load();
  return db.users
    .map((u) => {
      const accounts = db.accounts
        .filter((a) => a.userId === u.id)
        .map((a) => ({
          id: a.id,
          accountNumber: a.accountNumber,
          accountType: a.accountType,
          currency: a.currency,
          balance: a.balance,
          equity: a.equity,
          leverage: a.leverage,
          pendingAdminEdit: a.pendingAdminEdit || null,
        }));
      const holdings = db.holdings
        .filter((h) => h.userId === u.id)
        .map((h) => ({
          id: h.id,
          accountId: h.accountId,
          asset: h.asset,
          symbol: h.symbol,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          pendingAdminEdit: h.pendingAdminEdit || null,
        }));
      const documentsCount = db.documents.filter((d) => d.userId === u.id).length;
      const investedProxy = getInvestedProxyByUser(u.id);
      const rank = getRankForAmount(investedProxy);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        birthDate: u.birthDate,
        address: u.address,
        createdAt: u.createdAt || u.termsAcceptedAt || null,
        accounts,
        holdings,
        documentsCount,
        investedProxy,
        rank: rank ? { key: rank.key, label: rank.label } : null,
      };
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = {
  findUserByUsername,
  createUser,
  getAccountsByUser,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getDepositsByUser,
  getPendingDeposits,
  createDeposit,
  approveDeposit,
  rejectDeposit,
  getWithdrawalsByUser,
  getPendingWithdrawals,
  createWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  getHoldingsByUser,
  getTradesByUser,
  getPendingTrades,
  createPendingTrade,
  approveTrade,
  rejectTrade,
  findUserById,
  updateUserPassword,
  getOptionsByUser,
  openOption,
  resolveOption,
  OPTION_ALLOWED_DURATIONS,
  getUserProfile,
  updateUserProfile,
  addDocument,
  getDocumentsByUser,
  getDocumentById,
  getAllDocuments,
  getInvestedProxyByUser,
  getRankForAmount,
  RANK_TIERS,
  runDueAdminActions,
  getAllUsersAdminView,
  setAutoInvestEnabled,
  runAutoInvestIfDue,
  requestAccountEdit,
  requestHoldingEdit,
  requestHoldingCreate,
  requestHoldingDelete,
};
