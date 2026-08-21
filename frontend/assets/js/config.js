// Un solo lugar para apuntar el frontend a tu backend.
// Detecta solo si estás abriendo la página en tu compu (localhost) o ya
// desplegada de verdad, y usa la URL correcta en cada caso — así no hay que
// andar cambiando esto a mano cada vez.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const CONFIG = {
  API_BASE_URL: IS_LOCAL
    ? 'http://localhost:4000'
    : 'https://zenith-capital-4zsv.onrender.com',
};
