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

// Cada cuántos segundos (en promedio) aparece un mensaje nuevo cuando el
// feed está "al día". Se agrega algo de variación (0.5x a 1.5x) para que
// no se sienta perfectamente mecánico.
const AVG_INTERVAL_SECONDS = 35;
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
  const db = load();
  return db.communityMessages.slice(-limit);
}

module.exports = { getRecentMessages, FAKE_CLIENTS };
