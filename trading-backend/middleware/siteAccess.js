// Bloqueo de acceso a nivel de sitio (no de usuario): un código único que
// Lucas comparte solo con quien él quiera, y que hay que escribir una vez
// por dispositivo/navegador antes de poder usar la API en absoluto — antes
// incluso de iniciar sesión o registrarse. Pensado para que gente que
// llegue al link por accidente no pueda ni ver la pantalla de login, sin
// que Lucas tenga que iniciar sesión con nada en cada dispositivo suyo.
//
// Si en el servidor no está configurada la variable SITE_ACCESS_CODE, este
// bloqueo queda desactivado automáticamente (para no romper instalaciones
// que todavía no la definieron) — el sitio se comporta como antes.

const jwt = require('jsonwebtoken');

function requireSiteAccess(req, res, next) {
  const configuredCode = process.env.SITE_ACCESS_CODE;
  if (!configuredCode) return next(); // bloqueo no configurado -> desactivado

  const token = req.headers['x-site-access'];
  if (!token) {
    return res.status(403).json({ error: 'Acceso bloqueado. Ingresa el código de acceso del sitio.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.site) throw new Error('token no es de acceso de sitio');
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Acceso bloqueado. Ingresa el código de acceso del sitio.' });
  }
}

module.exports = { requireSiteAccess };
