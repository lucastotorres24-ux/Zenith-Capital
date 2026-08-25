// Buzón de quejas y peticiones: cualquier cliente puede escribir una
// petición o queja; queda registrada con un número NIT (inventado, de 6
// dígitos) para que la pueda referenciar. Lucas la responde desde el
// panel de administrador y la respuesta se ve dentro de la misma
// plataforma — a propósito NO se manda ningún correo real, solo queda
// disponible la próxima vez que la persona entra a su buzón.

const { load, save } = require('./db');

function generateNit(db) {
  const existing = new Set((db.supportTickets || []).map((t) => t.nit));
  let nit;
  let attempts = 0;
  do {
    nit = String(Math.floor(100000 + Math.random() * 900000));
    attempts++;
  } while (existing.has(nit) && attempts < 20);
  return nit;
}

function createTicket({ userId, username, text }) {
  const cleanText = String(text || '').trim().slice(0, 1000);
  if (!cleanText) return { error: 'Escribe tu petición o queja antes de enviarla.' };

  const db = load();
  const ticket = {
    id: db.nextSupportTicketId++,
    nit: generateNit(db),
    userId,
    username,
    text: cleanText,
    status: 'abierto', // 'abierto' | 'respondido'
    reply: null,
    createdAt: new Date().toISOString(),
    respondedAt: null,
  };
  db.supportTickets.push(ticket);
  save(db);
  return { ticket };
}

function getTicketsByUser(userId) {
  const db = load();
  return db.supportTickets
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Vista de administrador: todas las peticiones de todos los clientes,
// abiertas primero (para que Lucas vea de una vez lo que falta responder).
function getAllTickets() {
  const db = load();
  return [...db.supportTickets].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'abierto' ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function replyToTicket({ id, reply }) {
  const cleanReply = String(reply || '').trim();
  if (!cleanReply) return { error: 'Escribe una respuesta antes de enviarla.' };

  const db = load();
  const ticket = db.supportTickets.find((t) => t.id === id);
  if (!ticket) return { error: 'Petición no encontrada' };

  ticket.reply = cleanReply;
  ticket.status = 'respondido';
  ticket.respondedAt = new Date().toISOString();
  save(db);
  return { ticket };
}

module.exports = { createTicket, getTicketsByUser, getAllTickets, replyToTicket };
