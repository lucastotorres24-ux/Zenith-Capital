const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dns = require('dns');
const {
  findUserByUsername,
  findUserByEmail,
  findUserByUsernameOrEmail,
  createUser,
  findUserById,
  updateUserPassword,
  getUserProfile,
  updateUserProfile,
} = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function digitsOnly(str) {
  return String(str || '').replace(/[^\d]/g, '');
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// A pedido de Lucas: que solo se pueda registrar con "correos reales", no
// cualquier cosa inventada. No mandamos un correo de confirmación (eso
// necesitaría contratar un servicio externo de envío de correos) — en vez
// de eso, se revisa que el DOMINIO del correo exista de verdad y esté
// configurado para recibir correo (registro MX, o al menos A/AAAA como
// respaldo), usando el propio sistema de nombres de dominio de internet
// (DNS), que es gratis y no necesita ninguna cuenta ni clave. Esto rechaza
// dominios inventados como "asdf@asdf123.com" — no puede confirmar que la
// bandeja de entrada específica exista, pero si el dominio ni siquiera
// puede recibir correo, seguro que la dirección no es real.
async function domainCanReceiveEmail(domain) {
  let sawOnlyTimeouts = true;
  const lookups = [dns.promises.resolveMx, dns.promises.resolve4, dns.promises.resolve6];

  for (const lookup of lookups) {
    try {
      const result = await withTimeout(lookup(domain), 4000);
      if (result && result.length > 0) return true;
    } catch (err) {
      if (err.message !== 'timeout') sawOnlyTimeouts = false;
    }
  }
  // Si todos los intentos fallaron por demora (no porque el dominio no
  // exista), es más probable que sea un problema de red pasajero del
  // servidor que un correo falso — se deja pasar para no bloquear
  // registros válidos por una falla nuestra.
  return sawOnlyTimeouts;
}

// Protección básica contra fuerza bruta: máximo N intentos por IP cada 15 min
// en login/registro. Sin esto, cualquiera podría probar miles de contraseñas.
// En desarrollo local se deja mucho más alto (nadie más puede llegar a tu
// localhost de todos modos); en producción (NODE_ENV=production, como en
// Render) vuelve a ser estricto.
const isProd = process.env.NODE_ENV === 'production';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

router.use(authLimiter);

// POST /api/auth/login
// A pedido de Lucas: se acepta tanto el usuario como el correo con el que
// la persona se registró — findUserByUsernameOrEmail prueba ambos. Y en
// vez de un solo mensaje genérico para cualquier error, se distingue
// "esa cuenta no existe" (invita a registrarse) de "la contraseña está
// mal" — en un sitio de práctica sin datos sensibles reales de por medio,
// esa claridad vale más que ocultar cuál de las dos cosas falló (que es
// lo que sí conviene en un sitio con usuarios reales, para que nadie
// pueda usar el mensaje de error para adivinar qué correos están
// registrados).
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const user = findUserByUsernameOrEmail(String(username).trim());
  if (!user) {
    return res.status(404).json({
      error: 'No encontramos ninguna cuenta con ese usuario o correo. Verifica que esté bien escrito, o crea una cuenta nueva.',
    });
  }

  const passwordMatches = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'La contraseña no es correcta. Inténtalo de nuevo.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    // Sesión larga (30 días) a propósito: es un sitio de práctica sin
    // datos financieros reales de por medio, así que no tiene sentido
    // hacer que la gente vuelva a iniciar sesión cada 2 horas — eso solo
    // generaba confusión (la sesión se cerraba sola de fondo y la
    // siguiente acción, como cambiar la contraseña, fallaba con un error
    // de "token" que no tenía nada que ver con la contraseña en sí).
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: getUserProfile(user.id),
  });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, email, phone, acceptedTerms } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    if (username.length < 3 || password.length < 8) {
      return res.status(400).json({
        error: 'El usuario debe tener al menos 3 caracteres y la contraseña al menos 8',
      });
    }
    if (!fullName || !String(fullName).trim()) {
      return res.status(400).json({ error: 'El nombre completo es requerido' });
    }
    const trimmedEmail = String(email || '').trim();
    if (!email || !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Ingresa un correo válido' });
    }
    const emailDomain = trimmedEmail.split('@')[1];
    if (!(await domainCanReceiveEmail(emailDomain))) {
      return res.status(400).json({
        error: `El dominio "${emailDomain}" no existe o no puede recibir correos — usa tu correo real (Gmail, Outlook, Hotmail, etc.)`,
      });
    }
    const phoneDigits = digitsOnly(phone);
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Ingresa un número de celular válido' });
    }
    if (acceptedTerms !== true) {
      return res.status(400).json({ error: 'Debes aceptar los términos y condiciones para registrarte' });
    }

    const exists = findUserByUsername(username);
    if (exists) {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }
    // A pedido de Lucas: como ahora se puede iniciar sesión con el correo
    // (además del usuario), dos cuentas con el mismo correo generarían
    // ambigüedad sobre cuál de las dos entra al escribirlo — por eso el
    // correo también tiene que ser único, no solo el usuario.
    const emailExists = findUserByEmail(trimmedEmail);
    if (emailExists) {
      return res.status(409).json({
        error: 'Ya existe una cuenta registrada con ese correo. Inicia sesión con ella, o usa un correo distinto.',
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser = createUser({
      username,
      passwordHash,
      fullName: String(fullName).trim(),
      email: trimmedEmail,
      phone: phoneDigits,
      termsAcceptedAt: new Date().toISOString(),
    });

    res.status(201).json(newUser);
  } catch (err) {
    console.error('Error al registrar usuario:', err);
    res.status(500).json({ error: 'Error del servidor, intenta de nuevo en un momento' });
  }
});

// GET /api/auth/me -> perfil completo del usuario logueado (para el modal
// "Mi perfil": nombre, correo, teléfono, fecha de nacimiento, dirección).
router.get('/me', requireAuth, (req, res) => {
  const profile = getUserProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(profile);
});

// PUT /api/auth/profile -> edita los datos personales editables (el
// nombre/correo se piden solo en el registro y no se editan desde acá).
router.put('/profile', requireAuth, (req, res) => {
  const { phone, birthDate, address } = req.body;
  const fields = {};

  if (phone !== undefined) {
    const phoneDigits = digitsOnly(phone);
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Ingresa un número de celular válido' });
    }
    fields.phone = phoneDigits;
  }
  if (birthDate !== undefined) {
    fields.birthDate = birthDate ? String(birthDate) : null;
  }
  if (address !== undefined) {
    fields.address = address ? String(address).trim() : null;
  }

  const updated = updateUserProfile(req.user.id, fields);
  if (!updated) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(updated);
});

// POST /api/auth/change-password (requiere estar logueado)
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva son requeridas' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }

  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const matches = bcrypt.compareSync(currentPassword, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  updateUserPassword(user.id, newHash);

  res.json({ message: 'Contraseña actualizada' });
});

module.exports = router;
