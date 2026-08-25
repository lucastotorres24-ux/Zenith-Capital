// Bloqueo de acceso a nivel de sitio (no es el login de usuario — pasa
// ANTES incluso de llegar al login). Ver middleware/siteAccess.js en el
// backend. La pantalla de bloqueo (#site-gate) queda visible por defecto
// en el HTML mismo, así que aunque este script tarde un instante en
// correr, nunca hay un parpadeo del contenido real sin protección — solo
// se destapa cuando el backend confirma que el acceso es válido.
//
// Este script se carga PRIMERO en cada página (antes que api.js), así que
// no puede usar `Api` todavía — habla directo con fetch() usando la misma
// URL base que config.js ya define.

(function () {
  const overlay = document.getElementById('site-gate');
  if (!overlay) return;

  const statusEl = document.getElementById('site-gate-status');
  const form = document.getElementById('site-gate-form');
  const input = document.getElementById('site-gate-input');
  const errorEl = document.getElementById('site-gate-error');
  const errorTextEl = document.getElementById('site-gate-error-text');
  const submitBtn = document.getElementById('site-gate-submit');

  const SITE_ACCESS_KEY = 'zenith_site_access';

  function getToken() {
    return localStorage.getItem(SITE_ACCESS_KEY);
  }
  function setToken(token) {
    if (token) localStorage.setItem(SITE_ACCESS_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(SITE_ACCESS_KEY);
  }

  function showForm() {
    if (statusEl) statusEl.style.display = 'none';
    if (form) form.style.display = 'block';
    if (input) setTimeout(() => input.focus(), 50);
  }

  function hideGate() {
    overlay.classList.remove('is-active');
    // Otras partes de la página (por ejemplo admin.js, que tiene su propio
    // segundo bloqueo encima de este) pueden esperar a este evento para
    // saber que ya se puede seguir.
    window.dispatchEvent(new CustomEvent('zenith:site-access-granted'));
  }

  function showError(message) {
    if (!errorEl) return;
    errorTextEl.textContent = message;
    errorEl.classList.add('is-visible');
  }
  function hideError() {
    if (!errorEl) return;
    errorEl.classList.remove('is-visible');
  }

  async function checkAccess() {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/access/check`, {
        headers: getToken() ? { 'X-Site-Access': getToken() } : {},
      });
      if (res.ok) {
        hideGate();
      } else {
        clearToken();
        showForm();
      }
    } catch (err) {
      // Sin conexión con el backend: no se puede confirmar el acceso, así
      // que por seguridad se deja el bloqueo activo con un mensaje claro
      // en vez de dejar pasar a ciegas.
      if (statusEl) {
        statusEl.textContent = 'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.';
      }
      showForm();
    }
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideError();
      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Verificando…';

      try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/access/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: input.value.trim() }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          showError(data.error || 'Código incorrecto');
          input.value = '';
          input.focus();
          return;
        }

        if (data.token) setToken(data.token);
        hideGate();
      } catch (err) {
        showError('No se pudo conectar con el servidor. Intenta de nuevo.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  // Si otra parte de la app detecta que el token guardado ya no sirve
  // (por ejemplo, api.js recibe un 403 en cualquier petición), se vuelve a
  // mostrar el bloqueo sin esperar a la próxima carga de página.
  window.addEventListener('zenith:site-access-revoked', () => {
    overlay.classList.add('is-active');
    showForm();
  });

  checkAccess();
})();
