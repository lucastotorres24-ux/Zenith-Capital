// "Base de datos": desde agosto 2026 esto se guarda en MongoDB Atlas (una
// base de datos en la nube, gratis para siempre en su plan más chico) en
// vez de un archivo local. Antes se guardaba en un archivo JSON dentro del
// propio servidor (data/data.json) — eso funcionaba bien para probar en tu
// computadora, pero en Render (donde vive el sitio en línea) ese archivo
// se borra cada vez que el servicio se reinicia o se "duerme" por
// inactividad, porque el plan gratis de Render no guarda archivos de forma
// permanente. Eso hacía que las cuentas nuevas desaparecieran con el
// tiempo. Mongo Atlas sí guarda los datos para siempre, en un servidor
// aparte que no se reinicia con tu backend.
//
// Para no tener que tocar el resto del código (data/store.js,
// data/support.js, data/community.js, data/zenithCoin.js y todas las
// rutas siguen llamando `load()`/`save()` exactamente igual que antes, de
// forma síncrona), este archivo mantiene una COPIA en memoria de todos los
// datos (`cachedDb`) que se llena una sola vez al arrancar el servidor
// (ver `connect()`, llamado desde server.js antes de aceptar pedidos).
// `load()` simplemente devuelve esa copia en memoria (ya lista, sin
// esperar nada). `save()` actualiza esa copia al instante Y además manda
// el cambio a MongoDB en segundo plano, sin hacer esperar al usuario. Si
// justo en ese instante se cayera la conexión a internet del servidor, se
// perdería como mucho el último cambio (no todo el historial) — un riesgo
// mucho menor que perder absolutamente todo cada vez que Render reinicia,
// que es lo que pasaba antes.
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'zenith_capital';
const COLLECTION_NAME = 'app_state';
const DOC_ID = 'zenith_state';

let cachedDb = null;
let mongoCollection = null;
let mongoDbInstance = null;
// Encadena los guardados uno detrás de otro (en vez de dispararlos todos a
// la vez) para que dos cambios casi simultáneos no se crucen en el camino
// y uno viejo termine pisando a uno más nuevo.
let saveQueue = Promise.resolve();

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
    communityPendingReplies: [],
    nextSupportTicketId: 1,
    supportTickets: [],
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

// Revisa los datos que vinieron de MongoDB y completa cualquier campo que
// le falte (por ejemplo, porque se guardaron con una versión anterior de
// esta app) sin perder nada de lo que ya existía. Devuelve si hizo falta
// completar algo, para guardar de vuelta solo cuando de verdad cambió algo.
function runMigrations(data) {
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
  // Chat interactivo de la Comunidad Zenith (respuestas automáticas
  // pendientes a mensajes que escribió una persona real) — ver
  // data/community.js.
  if (!Array.isArray(data.communityPendingReplies)) {
    data.communityPendingReplies = [];
    migrated = true;
  }

  // Buzón de quejas y peticiones (soporte) — ver data/support.js.
  if (!Array.isArray(data.supportTickets)) {
    data.supportTickets = [];
    migrated = true;
  }
  if (typeof data.nextSupportTicketId !== 'number') {
    data.nextSupportTicketId = 1;
    migrated = true;
  }

  // Automatización de inversión real (Diamante/Platino) — ver
  // data/store.js#runAutoInvestIfDue. Las cuentas de antes de esto no
  // tienen estos campos; se completan activadas por defecto.
  data.users.forEach((u) => {
    if (u.autoInvestEnabled === undefined) {
      u.autoInvestEnabled = true;
      migrated = true;
    }
    if (u.lastAutoInvestAt === undefined) {
      u.lastAutoInvestAt = null;
      migrated = true;
    }
  });

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

  return { data, migrated };
}

// Manda el estado actual a MongoDB en segundo plano. Los guardados se
// encadenan uno detrás de otro (nunca al mismo tiempo) para que dos
// cambios casi simultáneos no se crucen. Si un guardado falla (por
// ejemplo, un corte de internet de un segundo), se avisa por consola pero
// NO se rompe la respuesta que ya se le dio al usuario — el próximo
// guardado exitoso deja todo al día de nuevo.
function persist(data) {
  saveQueue = saveQueue
    .then(() => mongoCollection.replaceOne({ _id: DOC_ID }, { _id: DOC_ID, ...data }, { upsert: true }))
    .catch((err) => {
      console.error(
        '⚠️  No se pudo guardar el último cambio en MongoDB (si el servidor se reinicia justo ahora, ese cambio en particular podría perderse):',
        err.message
      );
    });
  return saveQueue;
}

// Se llama una sola vez, al arrancar el servidor (ver server.js), ANTES de
// aceptar cualquier pedido. Se conecta a MongoDB Atlas con la dirección de
// MONGODB_URI, trae los datos guardados (o crea los de ejemplo la primera
// vez que se usa) y los deja listos en memoria.
async function connect() {
  if (!MONGODB_URI) {
    throw new Error(
      'Falta la variable de entorno MONGODB_URI — sin ella el servidor no tiene dónde guardar los datos de forma permanente. Revisa el archivo .env (en tu computadora) o las "Environment Variables" de Render (en línea). Ver .env.example para el formato esperado.'
    );
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  mongoDbInstance = client.db(MONGODB_DB_NAME);
  mongoCollection = mongoDbInstance.collection(COLLECTION_NAME);

  const existing = await mongoCollection.findOne({ _id: DOC_ID });
  if (existing) {
    delete existing._id;
    const { data, migrated } = runMigrations(existing);
    cachedDb = data;
    if (migrated) await persist(cachedDb);
    console.log('Conectado a MongoDB — datos existentes cargados correctamente.');
  } else {
    cachedDb = seedData();
    await mongoCollection.insertOne({ _id: DOC_ID, ...cachedDb });
    console.log('Conectado a MongoDB — no había datos todavía, se inicializó con datos de ejemplo (usuario: demo / demo1234).');
  }
}

// Devuelve los datos ya cargados en memoria — instantáneo, sin esperar
// nada, exactamente igual que antes cuando esto leía un archivo local.
function load() {
  if (!cachedDb) {
    throw new Error(
      'La base de datos todavía no está lista (el servidor no llamó a connect() antes de recibir pedidos, o MongoDB no conectó a tiempo). Reinicia el servidor.'
    );
  }
  return cachedDb;
}

// Actualiza la copia en memoria al instante (todo el resto del código
// sigue funcionando exactamente igual que antes) y además guarda el
// cambio en MongoDB en segundo plano, sin hacer esperar al usuario.
function save(data) {
  cachedDb = data;
  persist(data);
}

// Para otros archivos que necesitan guardar cosas en MongoDB pero NO
// encajan en el mismo "documento único" de arriba — por ahora, solo los
// PDFs que suben los usuarios (ver data/files.js), que se guardan cada uno
// en su propio documento dentro de otra colección.
function getMongoDb() {
  if (!mongoDbInstance) {
    throw new Error('La base de datos todavía no está lista (falta llamar a connect()).');
  }
  return mongoDbInstance;
}

module.exports = { load, save, connect, getMongoDb };
