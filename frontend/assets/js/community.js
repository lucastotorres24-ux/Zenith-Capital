// Comunidad Zenith (community.html): feed de chat simulado entre clientes
// certificados ficticios — se actualiza solo, no requiere que el usuario
// escriba nada. Ver trading-backend/data/community.js para cómo se generan
// los mensajes del lado del servidor.

const COMMUNITY_REFRESH_MS = 8_000;

// Mismo roster que data/community.js del backend (ver ahí) — se repite acá
// para poder mostrar la lista completa de "clientes certificados" en la
// barra lateral aunque alguno todavía no haya "hablado" en este rato.
const COMMUNITY_MEMBERS = [
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

const RANK_LABELS = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  diamante: 'Diamante',
  platino: 'Platino',
};

let lastRenderedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  renderMembers();

  loadMessages();
  setInterval(loadMessages, COMMUNITY_REFRESH_MS);
});

function renderUserChip() {
  const user = Api.getUser();
  const name = user?.username || 'Usuario';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-initial').textContent = name.charAt(0).toUpperCase();
}

function wireLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    Api.clearSession();
    window.location.href = 'index.html';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function renderMembers() {
  const list = document.getElementById('community-members-list');
  list.innerHTML = COMMUNITY_MEMBERS.map(
    (m) => `
      <div class="community-member">
        <span class="user-avatar rank-${m.badge}">${initials(m.name)}</span>
        <div>
          <div class="community-member-name">${escapeHtml(m.name)}</div>
          <span class="badge-pill rank-${m.badge}">${RANK_LABELS[m.badge]}</span>
        </div>
      </div>
    `
  ).join('');
}

async function loadMessages() {
  try {
    const messages = await Api.getCommunityMessages();
    renderFeed(messages);
  } catch (err) {
    // Silencioso: se reintenta en el próximo ciclo.
  }
}

function renderFeed(messages) {
  const feed = document.getElementById('community-feed');
  const wasAtBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 40;
  const hadMessages = lastRenderedCount > 0;

  feed.innerHTML = messages
    .map(
      (m) => `
        <div class="chat-message">
          <span class="user-avatar rank-${m.badge}">${initials(m.clientName)}</span>
          <div class="chat-message-body">
            <div class="chat-message-header">
              <span class="chat-message-name">${escapeHtml(m.clientName)}</span>
              <span class="badge-pill rank-${m.badge}">${RANK_LABELS[m.badge]}</span>
              <span class="chat-message-time">${new Date(m.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(m.text)}</div>
          </div>
        </div>
      `
    )
    .join('');

  // Solo hace auto-scroll si ya estaba abajo del todo (o es la primera
  // carga) — así no le interrumpe la lectura a quien se subió a ver
  // mensajes anteriores.
  if (!hadMessages || wasAtBottom) {
    feed.scrollTop = feed.scrollHeight;
  }
  lastRenderedCount = messages.length;
}
