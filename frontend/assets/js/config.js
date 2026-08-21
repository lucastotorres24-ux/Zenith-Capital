const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const CONFIG = {
  API_BASE_URL: IS_LOCAL
    ? 'http://localhost:4000'
    : 'https://zenith-capital-4zsv.onrender.com',
};