// Panel de administrador (admin.html): cola de aprobación de depósitos,
// retiros y compras/ventas — cada acción de un usuario queda "en revisión"
// hasta que Lucas la aprueba (editando o no el monto/cantidad final antes
// de confirmar) o la rechaza. No tiene nada que ver con el login normal de
// usuarios — usa su propio código (ADMIN_CODE) y su propio token guardado
// aparte, encima del bloqueo general del sitio (site-gate.js).

(function () {
  const adminGate = document.getElementById('admin-gate');
  const gateStatusEl = document.getElementById('admin-gate-status');
  const gateForm = document.getElementById('admin-gate-form');
  const gateInput = document.getElementById('admin-gate-input');
  const gateErrorEl = document.getElementById('admin-gate-error');
  const gateErrorTextEl = document.getElementById('admin-gate-error-text');
  const gateSubmitBtn = document.getElementById('admin-gate-submit');

  const PENDING_REFRESH_MS = 15_000;
  let pollTimer = null;

  function money(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    const toast = document.createElement('div');
    toast.className = `toast is-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---------------------------------------------------------------------
  // Segundo bloqueo: código de administrador
  // ---------------------------------------------------------------------

  function showAdminGate() {
    adminGate.classList.add('is-active');
    gateStatusEl.style.display = 'none';
    gateForm.style.display = 'block';
    setTimeout(() => gateInput.focus(), 50);
  }
  function hideAdminGate() {
    adminGate.classList.remove('is-active');
  }
  function showGateError(msg) {
    gateErrorTextEl.textContent = msg;
    gateErrorEl.classList.add('is-visible');
  }
  function hideGateError() {
    gateErrorEl.classList.remove('is-visible');
  }

  async function tryStoredAdminToken() {
    if (!Api.getAdminToken()) {
      showAdminGate();
      return;
    }
    gateStatusEl.style.display = 'block';
    gateForm.style.display = 'none';
    adminGate.classList.add('is-active');
    try {
      await loadPending();
      hideAdminGate();
      startPolling();
    } catch (err) {
      // Api.js ya limpió el token si la causa fue un 403.
      showAdminGate();
    }
  }

  // Como Lucas eligió revisar el panel él mismo (sin avisos por correo/SMS),
  // se refresca solo cada cierto tiempo mientras el panel esté abierto y
  // desbloqueado, para que aparezcan pedidos nuevos sin recargar la página.
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      loadPending().catch(() => {});
    }, PENDING_REFRESH_MS);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  window.addEventListener('zenith:site-access-granted', tryStoredAdminToken);
  // Si el bloqueo de sitio ya estaba resuelto (token guardado válido) antes
  // de que este script terminara de cargar, el evento anterior ya se
  // disparó y no lo alcanzamos a escuchar — por eso también revisamos el
  // estado actual directamente.
  if (!document.getElementById('site-gate').classList.contains('is-active')) {
    tryStoredAdminToken();
  }

  gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideGateError();
    gateSubmitBtn.disabled = true;
    const originalLabel = gateSubmitBtn.textContent;
    gateSubmitBtn.textContent = 'Verificando…';

    try {
      const { token } = await Api.adminVerify(gateInput.value.trim());
      Api.setAdminToken(token);
      hideAdminGate();
      loadPending();
      startPolling();
    } catch (err) {
      showGateError(err.message || 'Código incorrecto');
      gateInput.value = '';
      gateInput.focus();
    } finally {
      gateSubmitBtn.disabled = false;
      gateSubmitBtn.textContent = originalLabel;
    }
  });

  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    stopPolling();
    Api.clearAdminToken();
    showAdminGate();
  });

  // ---------------------------------------------------------------------
  // Cola de aprobación: depósitos, retiros, compras/ventas
  // ---------------------------------------------------------------------

  function fieldDate(iso) {
    return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  }

  function accountOptions(accounts, selectedId) {
    if (!accounts || accounts.length === 0) {
      return '<option value="">Este usuario no tiene cuentas</option>';
    }
    return accounts
      .map(
        (a) =>
          `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.accountNumber)} · ${money(a.balance)} (${escapeHtml(a.accountType)})</option>`
      )
      .join('');
  }

  // Depósitos/retiros no tienen todavía cuenta asignada (accountId es null
  // hasta que se aprueban), así que hay que traer las cuentas del usuario
  // aparte para poder elegir a cuál va. Se piden todas de una vez (una
  // llamada por usuario distinto en la cola) para no repetir peticiones.
  async function fetchAccountsByUser(userIds) {
    const result = {};
    await Promise.all(
      Array.from(new Set(userIds)).map(async (uid) => {
        try {
          result[uid] = await Api.adminGetUserAccounts(uid);
        } catch (err) {
          result[uid] = [];
        }
      })
    );
    return result;
  }

  async function loadPending() {
    const data = await Api.adminGetPending();

    const accountsByUser = await fetchAccountsByUser([
      ...data.deposits.map((d) => d.userId),
      ...data.withdrawals.map((w) => w.userId),
    ]);

    renderPendingDeposits(data.deposits, accountsByUser);
    renderPendingWithdrawals(data.withdrawals, accountsByUser);
    renderPendingTrades(data.trades);

    document.getElementById('deposits-pending-count').textContent = String(data.deposits.length);
    document.getElementById('withdrawals-pending-count').textContent = String(data.withdrawals.length);
    document.getElementById('trades-pending-count').textContent = String(data.trades.length);
  }

  function itemErrorHtml(prefix, id) {
    return `<div class="pending-item-error" id="${prefix}-error-${id}"></div>`;
  }
  function showItemError(prefix, id, message) {
    const el = document.getElementById(`${prefix}-error-${id}`);
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
  }

  // ---- Depósitos ----

  function renderPendingDeposits(deposits, accountsByUser) {
    const empty = document.getElementById('pending-deposits-empty');
    const list = document.getElementById('pending-deposits-list');
    list.innerHTML = '';

    if (deposits.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    deposits.forEach((d) => {
      const accounts = accountsByUser[d.userId] || [];
      const item = document.createElement('div');
      item.className = 'pending-item';
      item.innerHTML = `
        <div class="pending-item-top">
          <span class="pending-item-user">${escapeHtml(d.username)}</span>
          <span>${fieldDate(d.createdAt)}</span>
        </div>
        <div class="pending-item-meta">
          Solicitó depositar <strong>${money(d.requestedAmount)}</strong> · ${escapeHtml(d.bank)} · Contacto: ${escapeHtml(d.contact)}
        </div>
        <div class="pending-item-fields">
          <div class="field pending-item-field">
            <label>Cuenta destino</label>
            <select data-role="account">${accountOptions(accounts)}</select>
          </div>
          <div class="field pending-item-field" style="min-width:120px;">
            <label>Monto final (USD)</label>
            <input type="number" step="0.01" min="0.01" data-role="amount" value="${d.requestedAmount}" />
          </div>
        </div>
        <div class="pending-item-actions">
          <button class="btn btn-primary btn-sm" data-action="approve">Aprobar</button>
          <button class="btn btn-danger btn-sm" data-action="reject">Rechazar</button>
        </div>
        ${itemErrorHtml('deposit', d.id)}
      `;
      list.appendChild(item);

      item.querySelector('[data-action="approve"]').addEventListener('click', () => approveDeposit(d.id, item));
      item.querySelector('[data-action="reject"]').addEventListener('click', () => rejectDeposit(d.id));
    });
  }

  async function approveDeposit(id, item) {
    const accountId = Number(item.querySelector('[data-role="account"]').value);
    const amount = Number(item.querySelector('[data-role="amount"]').value);
    if (!accountId) return showItemError('deposit', id, 'Selecciona a qué cuenta va este depósito');
    if (!Number.isFinite(amount) || amount <= 0) return showItemError('deposit', id, 'Ingresa un monto válido mayor a 0');

    try {
      await Api.adminApproveDeposit(id, { accountId, amount });
      showToast('Depósito aprobado', 'success');
      loadPending();
    } catch (err) {
      showItemError('deposit', id, err.message);
    }
  }

  async function rejectDeposit(id) {
    if (!window.confirm('¿Rechazar este depósito?')) return;
    try {
      await Api.adminRejectDeposit(id);
      showToast('Depósito rechazado', 'info');
      loadPending();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ---- Retiros ----

  function renderPendingWithdrawals(withdrawals, accountsByUser) {
    const empty = document.getElementById('pending-withdrawals-empty');
    const list = document.getElementById('pending-withdrawals-list');
    list.innerHTML = '';

    if (withdrawals.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    withdrawals.forEach((w) => {
      const accounts = accountsByUser[w.userId] || [];
      const item = document.createElement('div');
      item.className = 'pending-item';
      item.innerHTML = `
        <div class="pending-item-top">
          <span class="pending-item-user">${escapeHtml(w.username)}</span>
          <span>${fieldDate(w.createdAt)}</span>
        </div>
        <div class="pending-item-meta">
          Solicitó retirar <strong>${money(w.requestedAmount)}</strong> · ${escapeHtml(w.method)} · Contacto: ${escapeHtml(w.contact || '—')}
        </div>
        <div class="pending-item-fields">
          <div class="field pending-item-field">
            <label>Cuenta origen</label>
            <select data-role="account">${accountOptions(accounts)}</select>
          </div>
          <div class="field pending-item-field" style="min-width:120px;">
            <label>Monto final (USD)</label>
            <input type="number" step="0.01" min="0.01" data-role="amount" value="${w.requestedAmount}" />
          </div>
        </div>
        <div class="pending-item-actions">
          <button class="btn btn-primary btn-sm" data-action="approve">Aprobar</button>
          <button class="btn btn-danger btn-sm" data-action="reject">Rechazar</button>
        </div>
        ${itemErrorHtml('withdrawal', w.id)}
      `;
      list.appendChild(item);

      item.querySelector('[data-action="approve"]').addEventListener('click', () => approveWithdrawal(w.id, item));
      item.querySelector('[data-action="reject"]').addEventListener('click', () => rejectWithdrawal(w.id));
    });
  }

  async function approveWithdrawal(id, item) {
    const accountId = Number(item.querySelector('[data-role="account"]').value);
    const amount = Number(item.querySelector('[data-role="amount"]').value);
    if (!accountId) return showItemError('withdrawal', id, 'Selecciona de qué cuenta sale este retiro');
    if (!Number.isFinite(amount) || amount <= 0) return showItemError('withdrawal', id, 'Ingresa un monto válido mayor a 0');

    try {
      await Api.adminApproveWithdrawal(id, { accountId, amount });
      showToast('Retiro aprobado', 'success');
      loadPending();
    } catch (err) {
      showItemError('withdrawal', id, err.message);
    }
  }

  async function rejectWithdrawal(id) {
    if (!window.confirm('¿Rechazar este retiro?')) return;
    try {
      await Api.adminRejectWithdrawal(id);
      showToast('Retiro rechazado', 'info');
      loadPending();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ---- Compras / ventas ----

  function renderPendingTrades(trades) {
    const empty = document.getElementById('pending-trades-empty');
    const list = document.getElementById('pending-trades-list');
    list.innerHTML = '';

    if (trades.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    trades.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'pending-item';
      item.innerHTML = `
        <div class="pending-item-top">
          <span class="pending-item-user">${escapeHtml(t.username)}</span>
          <span>${fieldDate(t.createdAt)}</span>
        </div>
        <div class="pending-item-meta">
          ${t.side === 'compra' ? 'Compra' : 'Venta'} solicitada: <strong>${t.requestedQuantity} ${escapeHtml(t.symbol)}</strong> a ${money(t.requestedPrice)} c/u
        </div>
        <div class="pending-item-fields">
          <div class="field pending-item-field" style="min-width:120px;">
            <label>Cantidad final</label>
            <input type="number" step="any" min="0.00000001" data-role="quantity" value="${t.requestedQuantity}" />
          </div>
          <div class="field pending-item-field" style="min-width:120px;">
            <label>Precio final (USD)</label>
            <input type="number" step="0.0001" min="0.0001" data-role="price" value="${t.requestedPrice}" />
          </div>
        </div>
        <div class="pending-item-actions">
          <button class="btn btn-primary btn-sm" data-action="approve">Aprobar</button>
          <button class="btn btn-danger btn-sm" data-action="reject">Rechazar</button>
        </div>
        ${itemErrorHtml('trade', t.id)}
      `;
      list.appendChild(item);

      item.querySelector('[data-action="approve"]').addEventListener('click', () => approveTrade(t.id, item));
      item.querySelector('[data-action="reject"]').addEventListener('click', () => rejectTrade(t.id));
    });
  }

  async function approveTrade(id, item) {
    const quantity = Number(item.querySelector('[data-role="quantity"]').value);
    const price = Number(item.querySelector('[data-role="price"]').value);
    if (!Number.isFinite(quantity) || quantity <= 0) return showItemError('trade', id, 'Ingresa una cantidad válida mayor a 0');
    if (!Number.isFinite(price) || price <= 0) return showItemError('trade', id, 'Ingresa un precio válido mayor a 0');

    try {
      await Api.adminApproveTrade(id, { quantity, price });
      showToast('Operación aprobada', 'success');
      loadPending();
    } catch (err) {
      showItemError('trade', id, err.message);
    }
  }

  async function rejectTrade(id) {
    if (!window.confirm('¿Rechazar esta operación?')) return;
    try {
      await Api.adminRejectTrade(id);
      showToast('Operación rechazada', 'info');
      loadPending();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
})();
