const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const {
  findUserByUsername,
  createUser,
  findUserById,
  updateUserPassword,
  getUserProfile,
  updateUserProfile,
} = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(str) {
  return String(str || '').replace(/[^\d]/g, '');
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
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }

  const user = findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordMatches = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  res.json({
    token,
    user: getUserProfile(user.id),
  });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
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
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ error: 'Ingresa un correo válido' });
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

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = createUser({
    username,
    passwordHash,
    fullName: String(fullName).trim(),
    email: String(email).trim(),
    phone: phoneDigits,
    termsAcceptedAt: new Date().toISOString(),
  });

  res.status(201).json(newUser);
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
