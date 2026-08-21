const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { findUserByUsername, createUser } = require('../data/store');

const router = express.Router();

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
    user: { id: user.id, username: user.username },
  });
});

// POST /api/auth/register (opcional, útil para pruebas rápidas)
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  if (username.length < 3 || password.length < 8) {
    return res.status(400).json({
      error: 'El usuario debe tener al menos 3 caracteres y la contraseña al menos 8',
    });
  }

  const exists = findUserByUsername(username);
  if (exists) {
    return res.status(409).json({ error: 'El usuario ya existe' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = createUser(username, passwordHash);

  res.status(201).json(newUser);
});

module.exports = router;
