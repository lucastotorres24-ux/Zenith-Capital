// Lógica de la pantalla de login/registro (index.html)

document.addEventListener('DOMContentLoaded', () => {
  // Detecta la moneda local por ubicación desde ya (aunque esta pantalla no
  // la use directamente) para que, apenas la persona entre al dashboard,
  // ya esté lista sin tener que esperar esa llamada.
  if (typeof Currency !== 'undefined') Currency.init();

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

  const goToRegisterLink = document.getElementById('go-to-register-link');
  if (goToRegisterLink) {
    goToRegisterLink.addEventListener('click', (event) => {
      event.preventDefault();
      activateTab('register');
    });
  }

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
  // El formulario en sí no crea la cuenta al enviarse: primero abre el
  // popup de términos y condiciones (con el checkbox obligatorio) y recién
  // cuando lo confirma ahí es que se manda la solicitud de registro.
  const registerForm = document.getElementById('register-form');
  const registerSubmit = document.getElementById('register-submit');

  const termsModal = document.getElementById('terms-modal');
  const termsCheckbox = document.getElementById('terms-checkbox');
  const termsConfirmBtn = document.getElementById('terms-modal-confirm');
  const termsCancelBtn = document.getElementById('terms-modal-cancel');
  const termsCloseBtn = document.getElementById('terms-modal-close');
  const termsErrorBox = document.getElementById('terms-modal-error');
  const termsErrorText = document.getElementById('terms-modal-error-text');

  let pendingRegistration = null;

  function openTermsModal() {
    termsCheckbox.checked = false;
    termsConfirmBtn.disabled = true;
    termsErrorBox.classList.remove('is-visible');
    termsModal.classList.add('is-visible');
  }
  function closeTermsModal() {
    termsModal.classList.remove('is-visible');
    pendingRegistration = null;
  }

  termsCheckbox.addEventListener('change', () => {
    termsConfirmBtn.disabled = !termsCheckbox.checked;
  });
  termsCancelBtn.addEventListener('click', closeTermsModal);
  termsCloseBtn.addEventListener('click', closeTermsModal);
  termsModal.addEventListener('click', (event) => {
    if (event.target === termsModal) closeTermsModal();
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    hideError();

    pendingRegistration = {
      username: registerForm.username.value.trim(),
      password: registerForm.password.value,
      fullName: registerForm.fullName.value.trim(),
      email: registerForm.email.value.trim(),
      phone: registerForm.phone.value.trim(),
    };
    openTermsModal();
  });

  termsConfirmBtn.addEventListener('click', async () => {
    if (!pendingRegistration || !termsCheckbox.checked) return;

    termsErrorBox.classList.remove('is-visible');
    setLoading(termsConfirmBtn, true, 'Creando cuenta…');
    try {
      const { username, password } = pendingRegistration;
      await Api.register({ ...pendingRegistration, acceptedTerms: true });
      // Registro exitoso -> lo logueamos automáticamente para que no
      // tenga que volver a escribir sus datos.
      const { token, user } = await Api.login(username, password);
      Api.setSession(token, user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      // El problema es de los datos del formulario (usuario ya existe,
      // correo inválido, etc.) — cerramos el popup y mostramos el error
      // donde la persona sí puede corregirlo.
      closeTermsModal();
      showError(err.message);
    } finally {
      setLoading(termsConfirmBtn, false);
    }
  });
});
