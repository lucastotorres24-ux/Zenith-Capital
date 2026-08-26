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

  // Buscador de "Usuarios registrados": vuelve a dibujar la tabla con el
  // mismo listado que ya se tenía guardado (usersCache), filtrado por lo
  // que se va escribiendo — no hace falta pedirle nada al servidor.
  document.getElementById('users-search-input').addEventListener('input', () => {
    renderUsers(usersCache);
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

    // Los documentos y la lista de usuarios no son tan urgentes como las
    // colas de arriba (no hay nada que "vencer"), pero se recargan en el
    // mismo ciclo de refresco para no complicar el código con timers
    // aparte — así un usuario nuevo aparece solo, sin recargar la página.
    try {
      const documents = await Api.adminGetDocuments();
      renderDocuments(documents);
    } catch (err) {
      // Si esto falla no debe tumbar el resto del panel — se reintenta
      // solo en el próximo ciclo de refresco.
    }
    try {
      const users = await Api.adminGetUsers();
      renderUsers(users);
    } catch (err) {
      // Igual que arriba: se reintenta solo en el próximo ciclo.
    }
    try {
      const zenith = await Api.adminGetZenithConfig();
      renderZenithAdmin(zenith.config, zenith.snapshot);
      document.getElementById('zenith-admin-status').textContent = 'en vivo';
      document.getElementById('zenith-admin-status').style.color = 'var(--good)';
    } catch (err) {
      document.getElementById('zenith-admin-status').textContent = 'sin conexión';
      document.getElementById('zenith-admin-status').style.color = 'var(--critical)';
    }
    try {
      const tickets = await Api.adminGetSupportTickets();
      renderSupportTickets(tickets);
    } catch (err) {
      // Igual que documentos/usuarios: se reintenta solo en el próximo ciclo.
    }
  }

  // ---- Buzón de soporte ----

  function renderSupportTickets(tickets) {
    const list = document.getElementById('support-list');
    const empty = document.getElementById('support-empty');
    const openCount = tickets.filter((t) => t.status !== 'respondido').length;
    document.getElementById('support-open-count').textContent = String(openCount);

    if (tickets.length === 0) {
      empty.style.display = 'flex';
      list.innerHTML = '';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = tickets
      .map((t) => {
        const isOpen = t.status !== 'respondido';
        return `
          <div class="pending-item" data-ticket-id="${t.id}">
            <div class="pending-item-top">
              <span class="pending-item-user">${escapeHtml(t.username)} · NIT #${escapeHtml(t.nit)}</span>
              <span>${fieldDate(t.createdAt)}</span>
            </div>
            <div class="pending-item-meta">${escapeHtml(t.text)}</div>
            ${
              isOpen
                ? `
                  <div class="pending-item-fields">
                    <div class="field pending-item-field" style="min-width:260px; flex:1;">
                      <label>Tu respuesta</label>
                      <textarea rows="2" data-role="reply" placeholder="Escribe tu respuesta…"></textarea>
                    </div>
                  </div>
                  <div class="pending-item-actions">
                    <button class="btn btn-primary btn-sm" data-action="reply">Responder</button>
                  </div>
                `
                : `<div class="pending-item-meta"><strong>Tu respuesta:</strong> ${escapeHtml(t.reply)}</div>`
            }
            ${itemErrorHtml('support', t.id)}
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('[data-action="reply"]').forEach((btn) => {
      const item = btn.closest('.pending-item');
      const id = Number(item.dataset.ticketId);
      btn.addEventListener('click', () => replyToSupportTicket(id, item));
    });
  }

  async function replyToSupportTicket(id, item) {
    const reply = item.querySelector('[data-role="reply"]').value.trim();
    if (!reply) return showItemError('support', id, 'Escribe una respuesta antes de enviarla.');

    try {
      await Api.adminReplySupportTicket(id, reply);
      showToast('Respuesta enviada', 'success');
      loadPending();
    } catch (err) {
      showItemError('support', id, err.message);
    }
  }

  // ---- Moneda Zenith (ZNT) ----

  // Solo se rellenan los <select> con lo que diga el servidor la PRIMERA
  // vez — si se hiciera en cada refresco de 15s, cualquier cambio que Lucas
  // esté a mitad de elegir (pero no ha guardado todavía) se le borraría
  // solo mientras el panel sigue actualizándose de fondo.
  let zenithConfigLoaded = false;

  function renderZenithAdmin(config, snapshot) {
    if (snapshot) {
      document.getElementById('zenith-admin-price').textContent = money(snapshot.price);
      const isUp = snapshot.change24h > 0;
      const isDown = snapshot.change24h < 0;
      const changeEl = document.getElementById('zenith-admin-change');
      changeEl.className = `delta ${isUp ? 'is-up' : isDown ? 'is-down' : 'is-flat'}`;
      changeEl.textContent = `${isUp ? '▲' : isDown ? '▼' : '—'} ${Math.abs(snapshot.change24h).toFixed(2)}% (24h)`;
    }

    if (!zenithConfigLoaded && config) {
      document.getElementById('zenith-trend-select').value = config.trend;
      document.getElementById('zenith-volatility-select').value = config.volatility;
      zenithConfigLoaded = true;
    }

    if (config && config.updatedAt) {
      document.getElementById('zenith-config-updated').textContent =
        `Último cambio: ${fieldDate(config.updatedAt)}`;
    }
  }

  document.getElementById('zenith-config-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById('zenith-config-submit');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Guardando…';

    try {
      const trend = document.getElementById('zenith-trend-select').value;
      const volatility = document.getElementById('zenith-volatility-select').value;
      const result = await Api.adminUpdateZenithConfig({ trend, volatility });
      document.getElementById('zenith-config-updated').textContent =
        `Último cambio: ${fieldDate(result.config.updatedAt)}`;
      showToast('Configuración de Zenith (ZNT) actualizada', 'success');
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar la configuración de ZNT', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  // ---- Usuarios registrados (+ edición directa) ----

  const RANK_LABELS = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', diamante: 'Diamante', platino: 'Platino' };

  // Mismo catálogo de activos que el panel de trading del cliente
  // (trading-panel.js PANEL_META), para que una posición creada desde acá
  // se vea y opere exactamente igual que una que el usuario abrió solo.
  const ADMIN_ASSET_OPTIONS = [
    { asset: 'zenith', symbol: 'ZNT', name: 'Zenith (moneda propia)' },
    { asset: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
    { asset: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    { asset: 'binancecoin', symbol: 'BNB', name: 'BNB' },
    { asset: 'solana', symbol: 'SOL', name: 'Solana' },
    { asset: 'ripple', symbol: 'XRP', name: 'XRP' },
    { asset: 'cardano', symbol: 'ADA', name: 'Cardano' },
    { asset: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
    { asset: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
    { asset: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
    { asset: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
    { asset: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
    { asset: 'tron', symbol: 'TRX', name: 'TRON' },
    { asset: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
    { asset: 'pax-gold', symbol: 'PAXG', name: 'Oro (PAX Gold)' },
  ];

  function assetLabel(asset, symbol) {
    const meta = ADMIN_ASSET_OPTIONS.find((a) => a.asset === asset);
    return meta ? `${meta.name} (${meta.symbol})` : `${symbol || asset}`;
  }

  // Qué usuarios tienen su panel de edición abierto — se conserva entre
  // refrescos automáticos (cada 15s) para que no se cierre solo mientras
  // Lucas está escribiendo un cambio.
  const expandedUserIds = new Set();
  let usersCache = [];

  function pendingEditNote(pendingAdminEdit, describeFn) {
    if (!pendingAdminEdit) return '';
    const when = fieldDate(pendingAdminEdit.applyAt);
    if (pendingAdminEdit.type === 'delete') {
      return `<div class="pending-admin-edit-note">⏳ Se eliminará · aplica ~${when}</div>`;
    }
    if (pendingAdminEdit.type === 'create') {
      return `<div class="pending-admin-edit-note">⏳ Posición nueva pendiente: ${describeFn(pendingAdminEdit.fields)} · aplica ~${when}</div>`;
    }
    return `<div class="pending-admin-edit-note">⏳ Cambio pendiente: ${describeFn(pendingAdminEdit.fields)} · aplica ~${when}</div>`;
  }

  function renderUserEditPanel(u) {
    const accountsHtml = u.accounts.length
      ? u.accounts
          .map((a) => {
            const pending = a.pendingAdminEdit;
            const describe = (fields) =>
              Object.entries(fields)
                .map(([k, v]) => {
                  if (k === 'balance') return `balance → ${money(v)}`;
                  if (k === 'equity') return `equity → ${money(v)}`;
                  if (k === 'leverage') return `apalancamiento → ${escapeHtml(v)}`;
                  return `${k} → ${v}`;
                })
                .join(', ');
            return `
              <div class="pending-item admin-edit-card">
                <div class="pending-item-top">
                  <span class="pending-item-user">${escapeHtml(a.accountNumber)} · ${escapeHtml(a.accountType)} (${escapeHtml(a.currency)})</span>
                  <span>Balance actual: ${money(a.balance)} · Equity: ${money(a.equity)} · Apalancamiento: ${escapeHtml(a.leverage || '—')}</span>
                </div>
                ${pending ? pendingEditNote(pending, describe) : `
                  <div class="pending-item-fields">
                    <div class="field pending-item-field" style="min-width:110px;">
                      <label>Balance (USD)</label>
                      <input type="number" step="0.01" min="0" data-role="balance" data-account-id="${a.id}" placeholder="${a.balance}" />
                    </div>
                    <div class="field pending-item-field" style="min-width:110px;">
                      <label>Equity (USD)</label>
                      <input type="number" step="0.01" min="0" data-role="equity" data-account-id="${a.id}" placeholder="${a.equity}" />
                    </div>
                    <div class="field pending-item-field" style="min-width:90px;">
                      <label>Apalancamiento</label>
                      <input type="text" data-role="leverage" data-account-id="${a.id}" placeholder="${escapeHtml(a.leverage || '1:100')}" />
                    </div>
                  </div>
                  <div class="admin-edit-hint">💡 Si solo escribes el Balance, el Equity se ajusta solo al mismo valor (sin ganancia/pérdida flotante). Si quieres dejar un Equity distinto, escríbelo tú mismo en su campo.</div>
                  <div class="pending-item-actions">
                    <button class="btn btn-primary btn-sm" data-action="save-account" data-account-id="${a.id}">Guardar cambios</button>
                  </div>
                  ${itemErrorHtml('account', a.id)}
                `}
              </div>
            `;
          })
          .join('')
      : '<div class="subtitle">Este usuario todavía no tiene cuentas.</div>';

    const holdingsHtml = u.holdings.length
      ? u.holdings
          .map((h) => {
            const pending = h.pendingAdminEdit;
            const label = assetLabel(h.asset, h.symbol);
            const describe = (fields) =>
              Object.entries(fields)
                .map(([k, v]) => (k === 'quantity' ? `cantidad → ${v}` : `precio prom. → ${money(v)}`))
                .join(', ');
            if (pending && pending.type === 'create') {
              return `<div class="pending-item admin-edit-card"><div class="pending-item-top"><span class="pending-item-user">${escapeHtml(label)}</span></div>${pendingEditNote(pending, describe)}</div>`;
            }
            return `
              <div class="pending-item admin-edit-card">
                <div class="pending-item-top">
                  <span class="pending-item-user">${escapeHtml(label)}</span>
                  <span>Cantidad: ${h.quantity} · Precio prom.: ${money(h.avgPrice)}</span>
                </div>
                ${pending ? pendingEditNote(pending, describe) : `
                  <div class="pending-item-fields">
                    <div class="field pending-item-field" style="min-width:110px;">
                      <label>Cantidad</label>
                      <input type="number" step="any" min="0.00000001" data-role="quantity" data-holding-id="${h.id}" placeholder="${h.quantity}" />
                    </div>
                    <div class="field pending-item-field" style="min-width:110px;">
                      <label>Precio prom. (USD)</label>
                      <input type="number" step="any" min="0.00000001" data-role="avgPrice" data-holding-id="${h.id}" placeholder="${h.avgPrice}" />
                    </div>
                  </div>
                  <div class="pending-item-actions">
                    <button class="btn btn-primary btn-sm" data-action="save-holding" data-holding-id="${h.id}">Guardar cambios</button>
                    <button class="btn btn-danger btn-sm" data-action="delete-holding" data-holding-id="${h.id}">Eliminar</button>
                  </div>
                  ${itemErrorHtml('holding', h.id)}
                `}
              </div>
            `;
          })
          .join('')
      : '<div class="subtitle">Este usuario todavía no tiene posiciones abiertas.</div>';

    const accountOptionsForNew = u.accounts.length
      ? u.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.accountNumber)} (${escapeHtml(a.accountType)})</option>`).join('')
      : '<option value="">Sin cuentas disponibles</option>';
    const assetOptionsForNew = ADMIN_ASSET_OPTIONS.map((a) => `<option value="${a.asset}|${a.symbol}">${escapeHtml(a.name)}</option>`).join('');

    return `
      <tr class="user-edit-row" data-user-edit-row="${u.id}">
        <td colspan="7">
          <div class="user-edit-panel">
            <h4>Cuentas de ${escapeHtml(u.fullName || u.username)}</h4>
            ${accountsHtml}
            <h4 style="margin-top:16px;">Posiciones (holdings)</h4>
            ${holdingsHtml}
            ${
              u.accounts.length
                ? `
              <div class="pending-item admin-edit-card admin-edit-new-holding">
                <div class="pending-item-top"><span class="pending-item-user">Agregar posición nueva</span></div>
                <div class="pending-item-fields">
                  <div class="field pending-item-field" style="min-width:150px;">
                    <label>Cuenta</label>
                    <select data-role="new-holding-account">${accountOptionsForNew}</select>
                  </div>
                  <div class="field pending-item-field" style="min-width:170px;">
                    <label>Activo</label>
                    <select data-role="new-holding-asset">${assetOptionsForNew}</select>
                  </div>
                  <div class="field pending-item-field" style="min-width:100px;">
                    <label>Cantidad</label>
                    <input type="number" step="any" min="0.00000001" data-role="new-holding-quantity" placeholder="0.00" />
                  </div>
                  <div class="field pending-item-field" style="min-width:110px;">
                    <label>Precio prom. (USD)</label>
                    <input type="number" step="any" min="0.00000001" data-role="new-holding-avgprice" placeholder="0.00" />
                  </div>
                </div>
                <div class="pending-item-actions">
                  <button class="btn btn-secondary btn-sm" data-action="create-holding" data-user-id="${u.id}">Crear posición</button>
                </div>
                ${itemErrorHtml('new-holding', u.id)}
              </div>
            `
                : ''
            }
          </div>
        </td>
      </tr>
    `;
  }

  // Búsqueda del panel de admin: filtra por usuario, correo o nombre. Se
  // guarda siempre la lista COMPLETA en usersCache (la que manda el
  // servidor) — el filtro solo afecta lo que se dibuja en pantalla, así
  // que al escribir/borrar la búsqueda no se pierde nada, y el refresco
  // automático de cada 15s sigue trayendo a todos los usuarios.
  function matchesUserSearch(u, query) {
    const haystack = [u.username, u.email, u.fullName, u.phone]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  function renderUsers(users) {
    usersCache = users;
    const empty = document.getElementById('users-empty');
    const searchEmpty = document.getElementById('users-search-empty');
    const table = document.getElementById('users-table');
    const body = document.getElementById('users-table-body');
    const searchInput = document.getElementById('users-search-input');
    const query = (searchInput?.value || '').trim().toLowerCase();
    const visibleUsers = query ? users.filter((u) => matchesUserSearch(u, query)) : users;

    document.getElementById('users-count').textContent =
      query ? `${visibleUsers.length} de ${users.length}` : String(users.length);

    if (users.length === 0) {
      empty.style.display = 'flex';
      searchEmpty.style.display = 'none';
      table.style.display = 'none';
      return;
    }
    if (visibleUsers.length === 0) {
      empty.style.display = 'none';
      searchEmpty.style.display = 'flex';
      table.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    searchEmpty.style.display = 'none';
    table.style.display = 'table';

    body.innerHTML = visibleUsers
      .map((u) => {
        const totalBalance = u.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
        const accountsText =
          u.accounts.length === 0
            ? 'Sin cuentas'
            : `${u.accounts.length} cuenta${u.accounts.length === 1 ? '' : 's'} · ${money(totalBalance)}`;
        const rankBadge = u.rank
          ? `<span class="badge-pill rank-${u.rank.key}">${escapeHtml(RANK_LABELS[u.rank.key] || u.rank.label)}</span>`
          : '<span class="badge-pill">Sin insignia</span>';
        const isExpanded = expandedUserIds.has(u.id);
        const row = `
          <tr>
            <td>
              <strong>${escapeHtml(u.fullName || u.username)}</strong><br />
              <span style="color:var(--text-muted); font-size:12px;">@${escapeHtml(u.username)}</span>
            </td>
            <td>
              ${escapeHtml(u.email || '—')}<br />
              <span style="color:var(--text-muted); font-size:12px;">${escapeHtml(u.phone || '—')}</span>
            </td>
            <td>${rankBadge}</td>
            <td>${accountsText}</td>
            <td>${u.documentsCount}</td>
            <td>${u.createdAt ? fieldDate(u.createdAt) : '—'}</td>
            <td><button class="btn btn-ghost btn-sm" data-action="toggle-user-edit" data-user-id="${u.id}">${isExpanded ? 'Ocultar' : 'Editar'}</button></td>
          </tr>
        `;
        return isExpanded ? row + renderUserEditPanel(u) : row;
      })
      .join('');

    wireUserEditHandlers();
  }

  function wireUserEditHandlers() {
    document.querySelectorAll('[data-action="toggle-user-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const userId = Number(btn.dataset.userId);
        if (expandedUserIds.has(userId)) {
          expandedUserIds.delete(userId);
        } else {
          expandedUserIds.add(userId);
        }
        renderUsers(usersCache);
      });
    });

    document.querySelectorAll('[data-action="save-account"]').forEach((btn) => {
      btn.addEventListener('click', () => saveAccountEdit(Number(btn.dataset.accountId)));
    });
    document.querySelectorAll('[data-action="save-holding"]').forEach((btn) => {
      btn.addEventListener('click', () => saveHoldingEdit(Number(btn.dataset.holdingId)));
    });
    document.querySelectorAll('[data-action="delete-holding"]').forEach((btn) => {
      btn.addEventListener('click', () => deleteHolding(Number(btn.dataset.holdingId)));
    });
    document.querySelectorAll('[data-action="create-holding"]').forEach((btn) => {
      btn.addEventListener('click', () => createHolding(Number(btn.dataset.userId)));
    });

    // Equity "sigue" al Balance mientras el admin no haya tocado el campo
    // de Equity a mano — mismo criterio que aplica el backend al guardar
    // (ver requestAccountEdit en data/store.js), pero mostrado en vivo acá
    // para que Lucas vea el número actualizarse mientras escribe, en vez
    // de enterarse recién después de guardar.
    document.querySelectorAll('[data-role="balance"][data-account-id]').forEach((balanceInput) => {
      const accountId = balanceInput.dataset.accountId;
      const equityInput = document.querySelector(`[data-role="equity"][data-account-id="${accountId}"]`);
      if (!equityInput) return;
      balanceInput.addEventListener('input', () => {
        if (equityInput.dataset.touched === '1') return;
        equityInput.value = balanceInput.value;
      });
      equityInput.addEventListener('input', () => {
        equityInput.dataset.touched = '1';
      });
    });
  }

  async function saveAccountEdit(accountId) {
    const balanceInput = document.querySelector(`[data-role="balance"][data-account-id="${accountId}"]`);
    const equityInput = document.querySelector(`[data-role="equity"][data-account-id="${accountId}"]`);
    const leverageInput = document.querySelector(`[data-role="leverage"][data-account-id="${accountId}"]`);

    const fields = {};
    if (balanceInput.value.trim() !== '') fields.balance = Number(balanceInput.value);
    if (equityInput.value.trim() !== '') fields.equity = Number(equityInput.value);
    if (leverageInput.value.trim() !== '') fields.leverage = leverageInput.value.trim();

    if (!Object.keys(fields).length) {
      return showItemError('account', accountId, 'Escribe al menos un valor nuevo antes de guardar');
    }

    try {
      await Api.adminEditAccount(accountId, fields);
      showToast('Cambio guardado — se aplicará en 1-2 minutos', 'success');
      loadPending();
    } catch (err) {
      showItemError('account', accountId, err.message);
    }
  }

  async function saveHoldingEdit(holdingId) {
    const quantityInput = document.querySelector(`[data-role="quantity"][data-holding-id="${holdingId}"]`);
    const avgPriceInput = document.querySelector(`[data-role="avgPrice"][data-holding-id="${holdingId}"]`);

    const fields = {};
    if (quantityInput.value.trim() !== '') fields.quantity = Number(quantityInput.value);
    if (avgPriceInput.value.trim() !== '') fields.avgPrice = Number(avgPriceInput.value);

    if (!Object.keys(fields).length) {
      return showItemError('holding', holdingId, 'Escribe al menos un valor nuevo antes de guardar');
    }

    try {
      await Api.adminEditHolding(holdingId, fields);
      showToast('Cambio guardado — se aplicará en 1-2 minutos', 'success');
      loadPending();
    } catch (err) {
      showItemError('holding', holdingId, err.message);
    }
  }

  async function deleteHolding(holdingId) {
    if (!window.confirm('¿Eliminar esta posición? Se aplicará en 1-2 minutos, igual que el resto de los cambios.')) return;
    try {
      await Api.adminDeleteHolding(holdingId);
      showToast('Eliminación agendada — se aplicará en 1-2 minutos', 'info');
      loadPending();
    } catch (err) {
      showItemError('holding', holdingId, err.message);
    }
  }

  async function createHolding(userId) {
    const accountSelect = document.querySelector('[data-role="new-holding-account"]');
    const assetSelect = document.querySelector('[data-role="new-holding-asset"]');
    const quantityInput = document.querySelector('[data-role="new-holding-quantity"]');
    const avgPriceInput = document.querySelector('[data-role="new-holding-avgprice"]');

    const accountId = Number(accountSelect.value);
    const [asset, symbol] = String(assetSelect.value).split('|');
    const quantity = Number(quantityInput.value);
    const avgPrice = Number(avgPriceInput.value);

    if (!accountId) return showItemError('new-holding', userId, 'Selecciona una cuenta');
    if (!Number.isFinite(quantity) || quantity <= 0) return showItemError('new-holding', userId, 'Ingresa una cantidad válida mayor a 0');
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return showItemError('new-holding', userId, 'Ingresa un precio promedio válido mayor a 0');

    try {
      await Api.adminCreateHolding({ userId, accountId, asset, symbol, quantity, avgPrice });
      showToast('Posición creada — se aplicará en 1-2 minutos', 'success');
      loadPending();
    } catch (err) {
      showItemError('new-holding', userId, err.message);
    }
  }

  // ---- Documentos de usuarios (subidos desde "Mi perfil") ----

  function renderDocuments(documents) {
    const empty = document.getElementById('documents-empty');
    const list = document.getElementById('documents-list');
    document.getElementById('documents-count').textContent = String(documents.length);
    list.innerHTML = '';

    if (documents.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    documents.forEach((doc) => {
      const item = document.createElement('div');
      item.className = 'document-item';
      item.innerHTML = `
        <div>
          <div class="document-item-name">📄 ${escapeHtml(doc.filename)}</div>
          <div class="document-item-meta">
            <strong>${escapeHtml(doc.username)}</strong> · ${fieldDate(doc.uploadedAt)} · ${(doc.size / 1024).toFixed(0)} KB
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="download-doc" data-id="${doc.id}" data-filename="${escapeHtml(doc.filename)}">Descargar</button>
      `;
      list.appendChild(item);

      item.querySelector('[data-action="download-doc"]').addEventListener('click', async () => {
        try {
          await Api.adminDownloadDocument(doc.id, doc.filename);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
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
          ${t.source === 'auto' ? '<span class="auto-trade-tag" title="Generada automáticamente por el motor de auto-inversión Diamante/Platino">🤖 Automática</span>' : ''}
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
