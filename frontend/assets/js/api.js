// Cliente delgado sobre la API del backend (trading-backend).
// No usa ninguna librería: solo fetch + un helper para adjuntar el token.

const TOKEN_KEY = 'zenith_token';
const USER_KEY = 'zenith_user';

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

  async request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = this.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
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
      // Token vencido o inválido: cierra sesión localmente.
      this.clearSession();
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

  register(username, password) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: { username, password },
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

  changePassword(payload) {
    return this.request('/api/auth/change-password', { method: 'POST', body: payload });
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
};
