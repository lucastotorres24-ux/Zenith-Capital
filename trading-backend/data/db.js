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
    users: [{ id: 1, username: 'demo', passwordHash: demoHash }],
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
  return JSON.parse(raw);
}

module.exports = { load, save };
