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
    nextHoldingId: 1,
    nextTradeId: 1,
    nextOptionId: 1,
    nextDocumentId: 1,
    nextCommunityMessageId: 1,
    communityLastGeneratedAt: now,
    communityMessages: [],
    zenithCandles: [],
    zenithConfig: { trend: 'estable', volatility: 'media', updatedAt: now },
    zenithLastGeneratedAt: now,
    users: [
      {
        id: 1,
        username: 'demo',
        passwordHash: demoHash,
        fullName: 'Usuario Demo',
        email: 'demo@zenithcapital.test',
        phone: '3000000000',
        birthDate: null,
        address: null,
        termsAcceptedAt: now,
        createdAt: now,
      },
    ],
    deposits: [],
    withdrawals: [],
    holdings: [],
    trades: [],
    options: [],
    documents: [],
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
  if (!Array.isArray(data.holdings)) {
    data.holdings = [];
    migrated = true;
  }
  if (typeof data.nextHoldingId !== 'number') {
    data.nextHoldingId = 1;
    migrated = true;
  }
  if (!Array.isArray(data.trades)) {
    data.trades = [];
    migrated = true;
  }
  if (typeof data.nextTradeId !== 'number') {
    data.nextTradeId = 1;
    migrated = true;
  }
  if (!Array.isArray(data.options)) {
    data.options = [];
    migrated = true;
  }
  if (typeof data.nextOptionId !== 'number') {
    data.nextOptionId = 1;
    migrated = true;
  }
  // Fase de aprobación manual (depósitos/retiros/compras/ventas): las
  // compras/ventas que ya existían de antes se crearon bajo el modelo
  // viejo (se ejecutaban solas al instante), así que se marcan como ya
  // aprobadas para no dejarlas atascadas "pendientes" sin que nadie las
  // haya pedido revisar.
  data.trades.forEach((t) => {
    if (!t.status) {
      t.status = 'aprobada';
      t.resolvedAt = t.resolvedAt || t.createdAt;
      migrated = true;
    }
  });
  data.deposits.forEach((d) => {
    if (d.accountId === undefined) {
      d.accountId = null;
      migrated = true;
    }
    if (d.resolvedAt === undefined) {
      d.resolvedAt = null;
      migrated = true;
    }
  });
  data.withdrawals.forEach((w) => {
    if (w.accountId === undefined) {
      w.accountId = null;
      migrated = true;
    }
    if (w.resolvedAt === undefined) {
      w.resolvedAt = null;
      migrated = true;
    }
  });

  // Perfil extendido (nombre completo, teléfono, correo, fecha de
  // nacimiento, dirección, términos y condiciones): las cuentas que ya
  // existían de antes del registro extendido no tienen estos campos —
  // se completan con valores vacíos para no romper nada. `termsAcceptedAt`
  // se deja con la fecha de creación de la cuenta como aproximación
  // razonable (se registraron antes de que existiera el checkbox).
  data.users.forEach((u) => {
    if (u.fullName === undefined) {
      u.fullName = u.username;
      migrated = true;
    }
    if (u.email === undefined) {
      u.email = '';
      migrated = true;
    }
    if (u.phone === undefined) {
      u.phone = '';
      migrated = true;
    }
    if (u.birthDate === undefined) {
      u.birthDate = null;
      migrated = true;
    }
    if (u.address === undefined) {
      u.address = null;
      migrated = true;
    }
    if (u.termsAcceptedAt === undefined) {
      u.termsAcceptedAt = null;
      migrated = true;
    }
    // Fecha de registro, para el panel de "Usuarios registrados" del
    // administrador — las cuentas de antes de esto no la tienen, se
    // aproxima con termsAcceptedAt (si existe) o con ahora mismo.
    if (u.createdAt === undefined) {
      u.createdAt = u.termsAcceptedAt || new Date().toISOString();
      migrated = true;
    }
  });

  if (!Array.isArray(data.documents)) {
    data.documents = [];
    migrated = true;
  }
  if (typeof data.nextDocumentId !== 'number') {
    data.nextDocumentId = 1;
    migrated = true;
  }
  if (typeof data.communityLastGeneratedAt !== 'string') {
    data.communityLastGeneratedAt = new Date().toISOString();
    migrated = true;
  }
  if (!Array.isArray(data.communityMessages)) {
    data.communityMessages = [];
    migrated = true;
  }
  if (typeof data.nextCommunityMessageId !== 'number') {
    data.nextCommunityMessageId = 1;
    migrated = true;
  }

  // Moneda simulada Zenith (ZNT) — ver data/zenithCoin.js. Igual que con
  // communityMessages, el "arranque en frío" (generar de golpe un
  // historial de velas para que no se vea vacío) lo decide esa misma
  // función mirando si zenithCandles está vacío, no esta migración.
  if (!Array.isArray(data.zenithCandles)) {
    data.zenithCandles = [];
    migrated = true;
  }
  if (!data.zenithConfig) {
    data.zenithConfig = { trend: 'estable', volatility: 'media', updatedAt: new Date().toISOString() };
    migrated = true;
  }
  if (typeof data.zenithLastGeneratedAt !== 'string') {
    data.zenithLastGeneratedAt = new Date().toISOString();
    migrated = true;
  }

  if (migrated) save(data);

  return data;
}

module.exports = { load, save };
