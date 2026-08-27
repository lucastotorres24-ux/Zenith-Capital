// Cliente delgado sobre la API del backend (trading-backend).
// No usa ninguna librería: solo fetch + un helper para adjuntar el token.

const TOKEN_KEY = 'zenith_token';
const USER_KEY = 'zenith_user';
const SITE_ACCESS_KEY = 'zenith_site_access';
const ADMIN_TOKEN_KEY = 'zenith_admin_token';

// Un fetch() normal no tiene límite de tiempo propio: si CoinGecko o
// gold-api.com "se cuelgan" (aceptan la conexión pero nunca responden nada —
// muy típico de la API gratuita de CoinGecko, que Lucas describe como que
// "pierde mucha conectividad") el fetch se queda esperando indefinidamente
// y la pantalla se queda "pegada cargando" para siempre, sin que salte
// ningún error que dispare un reintento o un aviso. Este helper cancela el
// pedido si no hay respuesta dentro de timeoutMs, convirtiendo ese cuelgue
// en un error normal que el código que llama ya sabe manejar (reintentar,
// mostrar "sin conexión", etc.) — se usa en todos los fetch directos a
// CoinGecko/gold-api en trading-panel.js y dashboard.js.
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  if (isRateLimited(url)) {
    // Ya sabemos que este servicio nos acaba de rechazar por exceso de
    // peticiones (ver más abajo) — ni siquiera intentamos otra vez hasta
    // que pase el tiempo de espera. Reintentar de inmediato contra un 429
    // no sirve de nada (la ventana de límite no se libera más rápido por
    // insistir) y solo suma otra petición contada en contra nuestra.
    throw new Error('RATE_LIMITED');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (res.status === 429) markRateLimited(url);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// CoinGecko (y en menor medida gold-api.com) son APIs gratuitas con límite
// de peticiones por minuto — bastante fácil de superar entre el ticker de
// precios (cada pocos segundos), el historial de cada cambio de activo/
// plazo, y varias pestañas o personas usando la plataforma al mismo
// tiempo. Cuando eso pasa, la API responde 429 ("Too Many Requests") y
// NINGÚN reintento inmediato ayuda — todo lo contrario, insistir rápido
// mantiene la ventana de límite ocupada y hace que tarde más en
// liberarse. Este estado compartido (una sola vez por página, no por cada
// fetch) hace que TODO el código que usa fetchWithTimeout — ticker de
// precios, historial de gráficos, precio único para liquidar una opción —
// se entere y deje de insistir contra ese servicio por un rato, en vez de
// que cada parte del código siga golpeando la API por su cuenta sin
// saber que ya está bloqueada.
const RATE_LIMIT_COOLDOWN_MS = 45000;
const rateLimitUntil = { coingecko: 0, goldapi: 0 };

function rateLimitKeyFor(url) {
  if (url.includes('coingecko.com')) return 'coingecko';
  if (url.includes('gold-api.com')) return 'goldapi';
  return null;
}

function isRateLimited(url) {
  const key = rateLimitKeyFor(url);
  return key ? Date.now() < rateLimitUntil[key] : false;
}

function markRateLimited(url) {
  const key = rateLimitKeyFor(url);
  if (key) rateLimitUntil[key] = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename || 'documento.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

const Api = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },

  // ---- Código de acceso del sitio (bloqueo general, ver site-gate.js) ----
  getSiteAccessToken() {
    return localStorage.getItem(SITE_ACCESS_KEY);
  },
  setSiteAccessToken(token) {
    if (token) localStorage.setItem(SITE_ACCESS_KEY, token);
  },
  clearSiteAccessToken() {
    localStorage.removeItem(SITE_ACCESS_KEY);
  },
  verifySiteAccess(code) {
    return this.request('/api/access/verify', { method: 'POST', body: { code }, auth: false, site: false });
  },
  checkSiteAccess() {
    return this.request('/api/access/check', { auth: false });
  },

  // ---- Token del panel de administrador (admin.html) ----
  getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },
  setAdminToken(token) {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clearAdminToken() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },
  adminVerify(code) {
    return this.request('/api/admin/verify', { method: 'POST', body: { code }, auth: false });
  },

  // ---- Cola de aprobación (panel de administrador) ----
  adminGetPending() {
    return this.request('/api/admin/pending', { admin: true });
  },
  adminGetUserAccounts(userId) {
    return this.request(`/api/admin/users/${userId}/accounts`, { admin: true });
  },
  adminGetDocuments() {
    return this.request('/api/admin/documents', { admin: true });
  },
  adminGetUsers() {
    return this.request('/api/admin/users', { admin: true });
  },
  adminApproveDeposit(id, payload) {
    return this.request(`/api/admin/deposits/${id}/approve`, { method: 'PUT', body: payload, admin: true });
  },
  adminRejectDeposit(id) {
    return this.request(`/api/admin/deposits/${id}/reject`, { method: 'PUT', admin: true });
  },
  adminApproveWithdrawal(id, payload) {
    return this.request(`/api/admin/withdrawals/${id}/approve`, { method: 'PUT', body: payload, admin: true });
  },
  adminRejectWithdrawal(id) {
    return this.request(`/api/admin/withdrawals/${id}/reject`, { method: 'PUT', admin: true });
  },
  adminApproveTrade(id, payload) {
    return this.request(`/api/admin/trades/${id}/approve`, { method: 'PUT', body: payload, admin: true });
  },
  adminRejectTrade(id) {
    return this.request(`/api/admin/trades/${id}/reject`, { method: 'PUT', admin: true });
  },
  adminGetSupportTickets() {
    return this.request('/api/admin/support', { admin: true });
  },
  adminReplySupportTicket(id, reply) {
    return this.request(`/api/admin/support/${id}/reply`, { method: 'PUT', body: { reply }, admin: true });
  },

  // ---- Edición directa de usuarios (balance, equity, leverage, posiciones) ----
  adminEditAccount(id, fields) {
    return this.request(`/api/admin/accounts/${id}/edit`, { method: 'PUT', body: fields, admin: true });
  },
  adminCreateHolding(payload) {
    return this.request('/api/admin/holdings', { method: 'POST', body: payload, admin: true });
  },
  adminEditHolding(id, fields) {
    return this.request(`/api/admin/holdings/${id}/edit`, { method: 'PUT', body: fields, admin: true });
  },
  adminDeleteHolding(id) {
    return this.request(`/api/admin/holdings/${id}`, { method: 'DELETE', admin: true });
  },

  // ---- Buzón de quejas y peticiones (soporte) ----
  getSupportTickets() {
    return this.request('/api/support/tickets');
  },
  createSupportTicket(text) {
    return this.request('/api/support/tickets', { method: 'POST', body: { text } });
  },

  async request(path, { method = 'GET', body, auth = true, site = true, admin = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (site) {
      const siteToken = this.getSiteAccessToken();
      if (siteToken) headers['X-Site-Access'] = siteToken;
    }
    if (admin) {
      const adminToken = this.getAdminToken();
      if (adminToken) headers['X-Admin-Token'] = adminToken;
    }

    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new Error(
        'No se pudo conectar con el backend. ¿Está corriendo en ' +
          CONFIG.API_BASE_URL +
          '?'
      );
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && auth) {
      // Token vencido o inválido: cierra la sesión localmente. Antes esto
      // dejaba a la persona parada en la misma pantalla sin avisarle nada
      // — la sesión ya estaba cerrada de fondo, pero ella seguía viendo el
      // dashboard como si nada, y la siguiente acción que intentara (por
      // ejemplo, cambiar la contraseña) fallaba con un error de "token"
      // que no tenía nada que ver con lo que estaba haciendo. Ahora se le
      // avisa y se le manda de vuelta al login, salvo que ya esté ahí.
      this.clearSession();
      const onLoginPage = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname === '/';
      if (!onLoginPage) {
        sessionStorage.setItem('zenith_session_expired', '1');
        window.location.href = 'index.html';
      }
    }
    if (res.status === 403 && site && path !== '/api/access/verify') {
      // El código de acceso del sitio guardado ya no es válido: se borra
      // para que site-gate.js vuelva a pedirlo.
      this.clearSiteAccessToken();
      window.dispatchEvent(new CustomEvent('zenith:site-access-revoked'));
    }
    if (res.status === 403 && admin) {
      this.clearAdminToken();
    }

    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
    }

    return data;
  },

  login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    });
  },

  register(payload) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: payload,
      auth: false,
    });
  },

  getAccounts() {
    return this.request('/api/accounts');
  },

  createAccount(payload) {
    return this.request('/api/accounts', { method: 'POST', body: payload });
  },

  updateAccount(id, payload) {
    return this.request(`/api/accounts/${id}`, { method: 'PUT', body: payload });
  },

  deleteAccount(id) {
    return this.request(`/api/accounts/${id}`, { method: 'DELETE' });
  },

  getAiInsights() {
    return this.request('/api/ai/insights', { method: 'POST' });
  },

  getAutoInvestStatus() {
    return this.request('/api/ai/auto-invest');
  },

  setAutoInvestEnabled(enabled) {
    return this.request('/api/ai/auto-invest', { method: 'PUT', body: { enabled } });
  },

  getDeposits() {
    return this.request('/api/deposits');
  },

  createDeposit(payload) {
    return this.request('/api/deposits', { method: 'POST', body: payload });
  },

  getWithdrawals() {
    return this.request('/api/withdrawals');
  },

  createWithdrawal(payload) {
    return this.request('/api/withdrawals', { method: 'POST', body: payload });
  },

  getHoldings() {
    return this.request('/api/trading/holdings');
  },

  buyAsset(payload) {
    return this.request('/api/trading/buy', { method: 'POST', body: payload });
  },

  sellAsset(payload) {
    return this.request('/api/trading/sell', { method: 'POST', body: payload });
  },

  getTrades() {
    return this.request('/api/trading/trades');
  },

  changePassword(payload) {
    return this.request('/api/auth/change-password', { method: 'POST', body: payload });
  },

  // ---- Perfil ----
  getMe() {
    return this.request('/api/auth/me');
  },
  updateProfile(payload) {
    return this.request('/api/auth/profile', { method: 'PUT', body: payload });
  },
  setPreferredCurrency(code) {
    return this.request('/api/auth/currency', { method: 'PUT', body: { code } });
  },

  // ---- Documentos (PDFs) ----
  getDocuments() {
    return this.request('/api/documents');
  },
  uploadDocument(payload) {
    return this.request('/api/documents', { method: 'POST', body: payload });
  },
  // Descarga protegida por token: un <a href> normal no puede mandar el
  // header Authorization, así que se pide el archivo con fetch y se
  // dispara la descarga desde un blob en memoria.
  async downloadDocument(id, filename) {
    const headers = {};
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const siteToken = this.getSiteAccessToken();
    if (siteToken) headers['X-Site-Access'] = siteToken;

    const res = await fetch(`${CONFIG.API_BASE_URL}/api/documents/${id}/download`, { headers });
    if (!res.ok) throw new Error('No se pudo descargar el documento');
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  },

  async adminDownloadDocument(id, filename) {
    const headers = {};
    const adminToken = this.getAdminToken();
    if (adminToken) headers['X-Admin-Token'] = adminToken;
    const siteToken = this.getSiteAccessToken();
    if (siteToken) headers['X-Site-Access'] = siteToken;

    const res = await fetch(`${CONFIG.API_BASE_URL}/api/admin/documents/${id}/download`, { headers });
    if (!res.ok) throw new Error('No se pudo descargar el documento');
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  },

  // ---- Comunidad Zenith (chat simulado, ahora interactivo) ----
  getCommunityMessages() {
    return this.request('/api/community/messages');
  },

  postCommunityMessage(text) {
    return this.request('/api/community/messages', { method: 'POST', body: { text } });
  },

  // ---- Asesoría IA (Diamante/Platino) ----
  getAiAdvisory() {
    return this.request('/api/ai/advisory', { method: 'POST' });
  },

  getOptions() {
    return this.request('/api/trading/options');
  },

  openOption(payload) {
    return this.request('/api/trading/options/open', { method: 'POST', body: payload });
  },

  resolveOption(id, payload) {
    return this.request(`/api/trading/options/${id}/resolve`, { method: 'POST', body: payload });
  },

  // ---- Zenith (ZNT) — moneda propia simulada ----
  getZenithSnapshot() {
    return this.request('/api/market/zenith');
  },

  getZenithCandles(limit = 200) {
    return this.request(`/api/market/zenith/candles?limit=${limit}`);
  },

  adminGetZenithConfig() {
    return this.request('/api/admin/zenith-coin', { admin: true });
  },

  adminUpdateZenithConfig(payload) {
    return this.request('/api/admin/zenith-coin', { method: 'PUT', body: payload, admin: true });
  },
};
