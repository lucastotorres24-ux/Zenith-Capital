// Capa de acceso a datos. Las rutas (routes/*.js) no necesitan saber cómo se
// guardan los datos, solo llaman a estas funciones. Por dentro, cada función
// carga el archivo data/data.json, hace el cambio, y lo vuelve a guardar —
// simple y suficiente para el tráfico de un proyecto de práctica.

const { load, save } = require('./db');

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
  const { pendingAction, pendingPayload, applyAt, adminDecidedAt, ...publicRecord } = record;
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
  };
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
  return db.accounts.filter((a) => a.userId === userId);
}

function getAccountById(id, userId) {
  const db = load();
  return db.accounts.find((a) => a.id === id && a.userId === userId) || null;
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
  return account;
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
  return db.holdings.filter((h) => h.userId === userId);
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

function createPendingTrade({ userId, accountId, asset, symbol, side, quantity, price }) {
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

  if (changed) save(db);
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
// Vista de solo lectura para Lucas: cada usuario que se registra aparece
// acá con su perfil completo, sus cuentas/balances, su insignia
// (aproximada, con el mismo cálculo de getInvestedProxyByUser — puede no
// coincidir centavo a centavo con lo que ve el usuario, que usa precio en
// vivo) y cuántos documentos tiene subidos. A propósito NO permite editar
// datos personales del usuario desde acá — lo único editable desde el
// panel de administrador son los montos/cantidades de las solicitudes
// pendientes (ver "Aprobación manual" en PRODUCT_SPEC.md).
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
};
