// "Comunidad Zenith": un feed de chat simulado entre clientes ficticios
// certificados, cada uno con una insignia fija (Bronce/Plata/Oro/Diamante/
// Platino) para que se vean todos los rangos. Ningún mensaje viene de una
// persona real ni de un usuario de verdad — es contenido de ambientación,
// generado solo, para que la comunidad se sienta viva. Se genera de forma
// perezosa: cada vez que alguien pide los mensajes, se calcula cuánto
// tiempo pasó desde la última vez y se "rellenan" los mensajes que
// deberían haber aparecido en ese lapso — así no hace falta un proceso
// corriendo todo el tiempo en el servidor (que además podría dormirse en
// un plan gratis de Render).

const { load, save } = require('./db');

const FAKE_CLIENTS = [
  { name: 'Camila Restrepo', badge: 'platino' },
  { name: 'Sebastián Duarte', badge: 'platino' },
  { name: 'Andrés Bermúdez', badge: 'diamante' },
  { name: 'Valentina Ríos', badge: 'diamante' },
  { name: 'Santiago Molina', badge: 'oro' },
  { name: 'Mariana Ortiz', badge: 'oro' },
  { name: 'Julián Cárdenas', badge: 'plata' },
  { name: 'Daniela Vargas', badge: 'plata' },
  { name: 'Felipe Salazar', badge: 'bronce' },
  { name: 'Isabella Correa', badge: 'bronce' },
];

const ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'];

const TEMPLATES = [
  '¿Alguien más vio cómo se movió {asset} hoy?',
  'Entré a {asset} la semana pasada y hasta ahora voy bien.',
  '¿Recomiendan comprar {asset} en esta bajada o mejor esperar?',
  'Zenith me aprobó el depósito súper rápido, contento con el servicio.',
  '¿Cuánto se demora normalmente en aprobarse un retiro?',
  'Llevo probando la plataforma unas semanas, se siente bastante seria.',
  'Alguna vez han usado el panel de Sube/Baja? ¿Qué tal les fue?',
  '{asset} lleva un rato lateral, esperando que rompa algún lado.',
  'Recién subí de rango, se siente bien ver el progreso.',
  '¿Ustedes diversifican entre varias cuentas o manejan todo en una sola?',
  'Buen día a todos, ¿cómo ven el mercado hoy?',
  'Aproveché para vender un poco de {asset} y tomar ganancias.',
  '¿Alguien madruga a revisar precios o esperan a la tarde?',
  'La verdad no esperaba que {asset} se moviera tanto esta semana.',
  '¿Qué estrategia usan para no dejarse llevar por las emociones?',
  'Tranquilo por acá, dejando correr las posiciones un rato más.',
  'Feliz de haber esperado antes de vender {asset}, valió la pena.',
  '¿Alguien conoce bien cómo funciona el apalancamiento en la plataforma?',
  'Buenas, ¿este es un buen momento para entrar a {asset} o ya se me pasó?',
  'Interesante ver cómo se mueve todo el mercado junto casi siempre.',
  'Gracias por los comentarios de ayer, me ayudaron a decidir mejor.',
  'Voy a esperar la próxima corrección antes de meter más capital.',
  '¿Alguno ha probado pedir la asesoría con IA? ¿Qué tal las recomendaciones?',
  'Poco a poco construyendo la cartera, sin afanes.',
  'Cuidado con dejarse llevar por el hype de un solo activo.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessageText() {
  const template = pick(TEMPLATES);
  return template.replace('{asset}', pick(ASSETS));
}

// ---------------------------------------------------------------------
// Chat interactivo: la persona que inició sesión puede escribir de verdad,
// y recibe una respuesta automática de un cliente simulado poco después
// (con un pequeño retraso, para que no se sienta como un robot
// respondiendo al instante). Igual que el resto de esta pantalla, la
// respuesta se resuelve de forma perezosa (ver resolvePendingReplies) en
// vez de con un setTimeout, para que sobreviva un reinicio/sueño del
// servidor.
// ---------------------------------------------------------------------

const REPLY_DELAY_MIN_MS = 15 * 1000;
const REPLY_DELAY_MAX_MS = 70 * 1000;
const MAX_MESSAGE_LENGTH = 500;

const REPLY_TEMPLATES = [
  '¡Bienvenido a la conversación, {name}! ¿Cuánto llevas en Zenith?',
  'Buen punto, {name}.',
  'Totalmente de acuerdo, he tenido una experiencia parecida.',
  'Gracias por compartir, {name} — siempre ayuda ver la perspectiva de otros.',
  'Yo también estuve mirando eso hace poco.',
  'Interesante lo que dices, {name}.',
  'Ánimo con eso, a mí también me ha tocado tomar decisiones así.',
  '¡Exacto! Por eso me gusta esta comunidad, se comparte harto por acá.',
  'Buena reflexión, {name}. Por acá pensamos parecido.',
  'Gracias por el aporte, se agradece que la comunidad esté activa.',
];

const REPLY_TEMPLATES_WITH_ASSET = [
  'Con {asset} yo también he visto movimientos así últimamente.',
  '¿{asset}? Yo llevo un tiempo mirando esa también, {name}.',
  'Cuidado con {asset}, se ha movido bastante volátil esta semana.',
  'Cierto, {asset} viene dando de qué hablar por acá también.',
  'Yo tengo posición en {asset} — coincido con lo que dices, {name}.',
];

function firstName(nameOrUsername) {
  const clean = String(nameOrUsername || '').trim();
  return clean.split(' ')[0] || 'amigo';
}

function detectAssetMention(text) {
  const upper = String(text || '').toUpperCase();
  return ASSETS.find((a) => upper.includes(a)) || null;
}

function buildReplyText(userText, userName) {
  const mentioned = detectAssetMention(userText);
  const name = firstName(userName);
  if (mentioned && Math.random() < 0.6) {
    return pick(REPLY_TEMPLATES_WITH_ASSET).replace('{asset}', mentioned).replace('{name}', name);
  }
  return pick(REPLY_TEMPLATES).replace('{name}', name);
}

// Crea el mensaje del cliente real de una vez, y programa (no genera
// todavía) la respuesta automática de un cliente simulado.
function postUserMessage({ userId, name, badge, text }) {
  const cleanText = String(text || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!cleanText) return { error: 'Escribe algo antes de enviar.' };

  const db = load();
  const message = {
    id: db.nextCommunityMessageId++,
    clientName: name,
    badge: badge || null,
    text: cleanText,
    createdAt: new Date().toISOString(),
    isUser: true,
    userId,
  };
  db.communityMessages.push(message);

  if (!db.communityPendingReplies) db.communityPendingReplies = [];
  const delay = REPLY_DELAY_MIN_MS + Math.random() * (REPLY_DELAY_MAX_MS - REPLY_DELAY_MIN_MS);
  db.communityPendingReplies.push({
    forMessageId: message.id,
    userText: cleanText,
    userName: name,
    respondAt: new Date(Date.now() + delay).toISOString(),
    fulfilled: false,
  });

  if (db.communityMessages.length > MAX_STORED_MESSAGES) {
    db.communityMessages = db.communityMessages.slice(-MAX_STORED_MESSAGES);
  }

  save(db);
  return { message };
}

// Revisa si ya le toca responder a alguna respuesta pendiente (su plazo
// al azar ya se cumplió) y, si es así, agrega el mensaje de respuesta de
// un cliente simulado al azar.
function resolvePendingReplies() {
  const db = load();
  if (!db.communityPendingReplies || !db.communityPendingReplies.length) return;

  const now = Date.now();
  let changed = false;

  db.communityPendingReplies.forEach((pending) => {
    if (pending.fulfilled) return;
    if (new Date(pending.respondAt).getTime() > now) return;

    const client = pick(FAKE_CLIENTS);
    db.communityMessages.push({
      id: db.nextCommunityMessageId++,
      clientName: client.name,
      badge: client.badge,
      text: buildReplyText(pending.userText, pending.userName),
      createdAt: new Date().toISOString(),
      replyToUser: true,
    });
    pending.fulfilled = true;
    changed = true;
  });

  if (!changed) return;

  db.communityPendingReplies = db.communityPendingReplies.filter((p) => !p.fulfilled);
  if (db.communityMessages.length > MAX_STORED_MESSAGES) {
    db.communityMessages = db.communityMessages.slice(-MAX_STORED_MESSAGES);
  }
  save(db);
}

// Cada cuántos segundos (en promedio) aparece un mensaje nuevo cuando el
// feed está "al día". Se agrega algo de variación (0.5x a 1.5x) para que
// no se sienta perfectamente mecánico. Lucas pidió que la comunidad se
// sienta más activa/frecuente — antes eran 35s, ahora son 12s (el
// frontend ya consulta cada 8s, así que casi siempre hay algo nuevo).
const AVG_INTERVAL_SECONDS = 12;
const MAX_MESSAGES_PER_CALL = 25; // evita ráfagas enormes tras mucho tiempo sin uso
const MAX_STORED_MESSAGES = 300;

function ensureMessagesGenerated() {
  const db = load();
  const now = Date.now();
  // Arranque en frío: si todavía no hay ningún mensaje (comunidad recién
  // creada), se simula que el chat ya llevaba un par de horas activo, para
  // que no se vea vacío la primera vez que alguien entra.
  const lastGen =
    db.communityMessages.length === 0
      ? now - 2 * 60 * 60 * 1000
      : new Date(db.communityLastGeneratedAt).getTime() || now;
  const elapsedSeconds = Math.max(0, (now - lastGen) / 1000);

  let count = Math.floor(elapsedSeconds / AVG_INTERVAL_SECONDS);
  if (count <= 0) return; // todavía no toca generar nada nuevo
  count = Math.min(count, MAX_MESSAGES_PER_CALL);

  for (let i = 0; i < count; i++) {
    const client = pick(FAKE_CLIENTS);
    // Reparte los timestamps de forma pareja entre la última generación y
    // ahora, en vez de ponerlos todos al mismo segundo.
    const fraction = (i + 1) / count;
    const createdAt = new Date(lastGen + fraction * (now - lastGen)).toISOString();
    db.communityMessages.push({
      id: db.nextCommunityMessageId++,
      clientName: client.name,
      badge: client.badge,
      text: buildMessageText(),
      createdAt,
    });
  }

  if (db.communityMessages.length > MAX_STORED_MESSAGES) {
    db.communityMessages = db.communityMessages.slice(-MAX_STORED_MESSAGES);
  }

  db.communityLastGeneratedAt = new Date(now).toISOString();
  save(db);
}

function getRecentMessages(limit = 60) {
  ensureMessagesGenerated();
  resolvePendingReplies();
  const db = load();
  return db.communityMessages.slice(-limit);
}

module.exports = { getRecentMessages, postUserMessage, FAKE_CLIENTS };
