// Segunda capa de acceso, solo para el panel de administrador
// (admin.html): además de pasar el código de acceso del sitio, hay que
// tener un token de administrador válido — obtenido con el código
// ADMIN_CODE, separado del código general del sitio y de las contraseñas
// de usuario. Así el panel donde se controla el precio de las monedas
// propias queda protegido incluso de alguien que ya tenga el código
// general del sitio.

const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(403).json({ error: 'Acceso de administrador requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.admin) throw new Error('token no es de administrador');
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Acceso de administrador requerido' });
  }
}

module.exports = { requireAdmin };
