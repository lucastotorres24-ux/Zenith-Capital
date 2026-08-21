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

module.exports = {
  findUserByUsername,
  createUser,
  getAccountsByUser,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
};
