// Capa de acceso a datos. Las rutas (routes/*.js) no necesitan saber cómo se
// guardan los datos, solo llaman a estas funciones. Por dentro, cada función
// carga el archivo data/data.json, hace el cambio, y lo vuelve a guardar —
// simple y suficiente para el tráfico de un proyecto de práctica.

const { load, save } = require('./db');

// ---- Users ----

function findUserByUsername(username) {
  const db = load();
  return db.users.find((u) => u.username === username) || null;
}

function createUser(username, passwordHash) {
  const db = load();
  const user = { id: db.nextUserId++, username, passwordHash };
  db.users.push(user);
  save(db);
  return { id: user.id, username: user.username };
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

function getDepositsByUser(userId) {
  const db = load();
  return db.deposits
    .filter((d) => d.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createDeposit({ userId, amount, bank, contact }) {
  const db = load();
  const deposit = {
    id: db.nextDepositId++,
    userId,
    amount,
    bank,
    contact,
    status: 'en_proceso',
    createdAt: new Date().toISOString(),
  };
  db.deposits.push(deposit);
  save(db);
  return deposit;
}

// ---- Withdrawals ----

function getWithdrawalsByUser(userId) {
  const db = load();
  return db.withdrawals
    .filter((w) => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createWithdrawal({ userId, method, amount, contact }) {
  const db = load();
  const withdrawal = {
    id: db.nextWithdrawalId++,
    userId,
    method,
    amount,
    contact,
    status: 'en_proceso',
    createdAt: new Date().toISOString(),
  };
  db.withdrawals.push(withdrawal);
  save(db);
  return withdrawal;
}

// ---- Holdings & Trades (Fase 0: motor de compra/venta) ----
//
// "holding" = una posición abierta de un activo dentro de una cuenta
// (cantidad + precio medio de compra). "trade" = el registro histórico de
// cada compra/venta (el germen del ledger unificado). El precio que se usa
// en cada operación lo manda el frontend (el precio en vivo de CoinGecko
// que el usuario está viendo en ese momento) — no hay verificación de
// mercado del lado del servidor, algo aceptable para un simulador de
// práctica pero que NO sería seguro en una plataforma real.

function getHoldingsByUser(userId) {
  const db = load();
  return db.holdings.filter((h) => h.userId === userId);
}

function getTradesByUser(userId) {
  const db = load();
  return db.trades
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buyAsset({ userId, accountId, asset, symbol, quantity, price }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === accountId && a.userId === userId);
  if (!account) return { error: 'Cuenta no encontrada' };

  const total = Number((quantity * price).toFixed(2));
  if (total > account.balance) {
    return { error: 'Saldo insuficiente en esta cuenta para esta compra' };
  }

  account.balance = Number((account.balance - total).toFixed(2));

  let holding = db.holdings.find(
    (h) => h.accountId === accountId && h.userId === userId && h.asset === asset
  );
  if (holding) {
    const newQuantity = holding.quantity + quantity;
    holding.avgPrice = (holding.avgPrice * holding.quantity + price * quantity) / newQuantity;
    holding.quantity = newQuantity;
  } else {
    holding = {
      id: db.nextHoldingId++,
      userId,
      accountId,
      asset,
      symbol,
      quantity,
      avgPrice: price,
      createdAt: new Date().toISOString(),
    };
    db.holdings.push(holding);
  }

  const trade = {
    id: db.nextTradeId++,
    userId,
    accountId,
    asset,
    symbol,
    side: 'compra',
    quantity,
    price,
    total,
    createdAt: new Date().toISOString(),
  };
  db.trades.push(trade);

  save(db);
  return { account, holding, trade };
}

function sellAsset({ userId, accountId, asset, quantity, price }) {
  const db = load();
  const account = db.accounts.find((a) => a.id === accountId && a.userId === userId);
  if (!account) return { error: 'Cuenta no encontrada' };

  const holding = db.holdings.find(
    (h) => h.accountId === accountId && h.userId === userId && h.asset === asset
  );
  if (!holding || quantity > holding.quantity) {
    return { error: 'No tienes suficiente cantidad de este activo para vender' };
  }

  const symbol = holding.symbol;
  const total = Number((quantity * price).toFixed(2));

  account.balance = Number((account.balance + total).toFixed(2));

  holding.quantity = Number((holding.quantity - quantity).toFixed(8));
  if (holding.quantity <= 0) {
    db.holdings = db.holdings.filter((h) => h.id !== holding.id);
  }

  const trade = {
    id: db.nextTradeId++,
    userId,
    accountId,
    asset,
    symbol,
    side: 'venta',
    quantity,
    price,
    total,
    createdAt: new Date().toISOString(),
  };
  db.trades.push(trade);

  save(db);
  return { account, holding: holding.quantity > 0 ? holding : null, trade };
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

module.exports = {
  findUserByUsername,
  createUser,
  getAccountsByUser,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getDepositsByUser,
  createDeposit,
  getWithdrawalsByUser,
  createWithdrawal,
  getHoldingsByUser,
  getTradesByUser,
  buyAsset,
  sellAsset,
  findUserById,
  updateUserPassword,
  getOptionsByUser,
  openOption,
  resolveOption,
  OPTION_ALLOWED_DURATIONS,
};
