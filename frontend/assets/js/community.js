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
let currentUserId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  currentUserId = Api.getUser()?.id ?? null;

  renderUserChip();
  wireLogout();
  wireComposer();
  renderMembers();

  loadMessages();
  setInterval(loadMessages, COMMUNITY_REFRESH_MS);
});

// ---------------------------------------------------------------------
// Composer: la persona logueada puede escribir de verdad. El mensaje
// queda publicado de una vez; la respuesta de un cliente simulado llega
// sola unos segundos/minutos después, en el próximo refresco automático.
// ---------------------------------------------------------------------

function wireComposer() {
  const form = document.getElementById('community-composer');
  const input = document.getElementById('community-composer-input');
  const errorBox = document.getElementById('community-composer-error');
  const errorText = document.getElementById('community-composer-error-text');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.remove('is-visible');

    const text = input.value.trim();
    if (!text) return;

    const submitBtn = document.getElementById('community-composer-submit');
    submitBtn.disabled = true;
    try {
      await Api.postCommunityMessage(text);
      input.value = '';
      await loadMessages();
    } catch (err) {
      errorText.textContent = err.message;
      errorBox.classList.add('is-visible');
    } finally {
      submitBtn.disabled = false;
      input.focus();
    }
  });
}

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
    .map((m) => {
      const isOwn = Boolean(m.isUser) && currentUserId != null && m.userId === currentUserId;
      // Un mensaje real puede venir de alguien todavía sin insignia (menos
      // de $250 invertidos) — se muestra "Sin rango" en vez de "undefined".
      const badgeKey = m.badge || null;
      const badgeLabel = badgeKey ? RANK_LABELS[badgeKey] : 'Sin rango';
      const avatarClass = badgeKey ? `rank-${badgeKey}` : '';
      const nameLabel = isOwn ? 'Tú' : escapeHtml(m.clientName);
      return `
        <div class="chat-message${isOwn ? ' is-own' : ''}">
          <span class="user-avatar ${avatarClass}">${initials(m.clientName)}</span>
          <div class="chat-message-body">
            <div class="chat-message-header">
              <span class="chat-message-name">${nameLabel}</span>
              <span class="badge-pill ${avatarClass}">${badgeLabel}</span>
              <span class="chat-message-time">${new Date(m.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(m.text)}</div>
          </div>
        </div>
      `;
    })
    .join('');

  // Solo hace auto-scroll si ya estaba abajo del todo (o es la primera
  // carga) — así no le interrumpe la lectura a quien se subió a ver
  // mensajes anteriores.
  if (!hadMessages || wasAtBottom) {
    feed.scrollTop = feed.scrollHeight;
  }
  lastRenderedCount = messages.length;
}
