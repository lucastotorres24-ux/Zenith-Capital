// Buzón de quejas y peticiones (support.html): la persona escribe, recibe
// un número NIT de referencia de una vez, y ve la respuesta de Lucas acá
// mismo cuando la responda desde el panel de administrador — no se manda
// ningún correo real (ver trading-backend/data/support.js).

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  wireForm();
  loadTickets();
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

function wireForm() {
  const form = document.getElementById('support-form');
  const textarea = document.getElementById('support-text');
  const errorBox = document.getElementById('support-form-error');
  const errorText = document.getElementById('support-form-error-text');
  const submitBtn = document.getElementById('support-form-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.remove('is-visible');

    const text = textarea.value.trim();
    if (!text) return;

    submitBtn.disabled = true;
    try {
      await Api.createSupportTicket(text);
      textarea.value = '';
      showToast('Petición enviada — guarda tu número NIT en el historial de abajo', 'success');
      await loadTickets();
    } catch (err) {
      errorText.textContent = err.message;
      errorBox.classList.add('is-visible');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function loadTickets() {
  try {
    const tickets = await Api.getSupportTickets();
    renderTickets(tickets);
  } catch (err) {
    // Silencioso: si falla, el historial simplemente no se actualiza esta vez.
  }
}

function renderTickets(tickets) {
  const list = document.getElementById('support-ticket-list');
  const empty = document.getElementById('support-ticket-empty');

  if (!tickets.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = tickets
    .map(
      (t) => `
        <div class="support-ticket-card">
          <div class="support-ticket-top">
            <span class="support-ticket-nit">NIT #${escapeHtml(t.nit)}</span>
            <span class="badge badge-${t.status === 'respondido' ? 'completado' : 'en_proceso'}">
              ${t.status === 'respondido' ? 'Respondido' : 'En proceso'}
            </span>
            <span class="support-ticket-date">${new Date(t.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          <div class="support-ticket-text">${escapeHtml(t.text)}</div>
          ${
            t.reply
              ? `<div class="support-ticket-reply"><strong>Respuesta de Zenith Capital:</strong> ${escapeHtml(t.reply)}</div>`
              : `<div class="support-ticket-reply">Todavía sin respuesta — te avisamos aquí apenas la tengamos.</div>`
          }
        </div>
      `
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
