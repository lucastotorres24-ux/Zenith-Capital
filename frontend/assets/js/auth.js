// Lógica de la pantalla de login/registro (index.html)

document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesión, no tiene sentido ver el login de nuevo.
  if (Api.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');

  const errorBox = document.getElementById('form-error');
  const errorText = document.getElementById('form-error-text');

  function showError(message) {
    errorText.textContent = message;
    errorBox.classList.add('is-visible');
  }
  function hideError() {
    errorBox.classList.remove('is-visible');
  }

  function activateTab(name) {
    hideError();
    const isLogin = name === 'login';
    tabLogin.classList.toggle('is-active', isLogin);
    tabRegister.classList.toggle('is-active', !isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabRegister.setAttribute('aria-selected', String(!isLogin));
    panelLogin.classList.toggle('is-active', isLogin);
    panelRegister.classList.toggle('is-active', !isLogin);
  }

  tabLogin.addEventListener('click', () => activateTab('login'));
  tabRegister.addEventListener('click', () => activateTab('register'));

  function setLoading(button, loading, labelWhileLoading) {
    button.disabled = loading;
    button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
    button.textContent = loading ? labelWhileLoading : button.dataset.originalLabel;
  }

  // ---- Login ----
  const loginForm = document.getElementById('login-form');
  const loginSubmit = document.getElementById('login-submit');

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    setLoading(loginSubmit, true, 'Ingresando…');
    try {
      const { token, user } = await Api.login(username, password);
      Api.setSession(token, user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(loginSubmit, false);
    }
  });

  // ---- Registro ----
  const registerForm = document.getElementById('register-form');
  const registerSubmit = document.getElementById('register-submit');

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const username = registerForm.username.value.trim();
    const password = registerForm.password.value;

    setLoading(registerSubmit, true, 'Creando cuenta…');
    try {
      await Api.register(username, password);
      // Registro exitoso -> lo logueamos automáticamente para que no
      // tenga que volver a escribir sus datos.
      const { token, user } = await Api.login(username, password);
      Api.setSession(token, user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(registerSubmit, false);
    }
  });
});
