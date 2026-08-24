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

function createWithdrawal({ userId, method, amount }) {
  const db = load();
  const withdrawal = {
    id: db.nextWithdrawalId++,
    userId,
    method,
    amount,
    status: 'en_proceso',
    createdAt: new Date().toISOString(),
  };
  db.withdrawals.push(withdrawal);
  save(db);
  return withdrawal;
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
};
