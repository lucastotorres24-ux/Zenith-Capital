// "Base de datos" en un archivo JSON plano (data/data.json), leído y escrito
// con el módulo `fs` que ya trae Node. Antes esto usaba better-sqlite3, pero
// ese paquete necesita compilarse con Python + un compilador de C++ cuando
// no hay un binario ya hecho para tu versión de Node/SO — eso rompe la
// instalación en muchas máquinas Windows sin herramientas de compilación
// instaladas. Para el tamaño de este proyecto, un archivo JSON alcanza de
// sobra y funciona igual en cualquier equipo sin instalar nada extra.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

function seedData() {
  const demoHash = bcrypt.hashSync('demo1234', 10);
  const now = new Date().toISOString();
  return {
    nextUserId: 2,
    nextAccountId: 3,
    nextDepositId: 1,
    nextWithdrawalId: 1,
    users: [{ id: 1, username: 'demo', passwordHash: demoHash }],
    deposits: [],
    withdrawals: [],
    accounts: [
      {
        id: 1,
        userId: 1,
        accountNumber: 'EX-10001',
        accountType: 'Standard',
        currency: 'USD',
        balance: 1500.75,
        equity: 1523.1,
        leverage: '1:100',
        createdAt: now,
      },
      {
        id: 2,
        userId: 1,
        accountNumber: 'EX-10002',
        accountType: 'Pro',
        currency: 'USD',
        balance: 8200.0,
        equity: 8175.4,
        leverage: '1:200',
        createdAt: now,
      },
    ],
  };
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const data = seedData();
    save(data);
    console.log('Base de datos inicializada con datos de ejemplo (usuario: demo / demo1234)');
    return data;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const data = JSON.parse(raw);

  // Migración simple: si el archivo viene de una versión anterior (sin
  // depósitos todavía), se completan los campos que falten sin perder los
  // datos que ya existen.
  let migrated = false;
  if (!Array.isArray(data.deposits)) {
    data.deposits = [];
    migrated = true;
  }
  if (typeof data.nextDepositId !== 'number') {
    data.nextDepositId = 1;
    migrated = true;
  }
  if (!Array.isArray(data.withdrawals)) {
    data.withdrawals = [];
    migrated = true;
  }
  if (typeof data.nextWithdrawalId !== 'number') {
    data.nextWithdrawalId = 1;
    migrated = true;
  }
  if (migrated) save(data);

  return data;
}

module.exports = { load, save };
