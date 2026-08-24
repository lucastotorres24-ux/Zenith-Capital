require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const aiRoutes = require('./routes/ai');
const depositsRoutes = require('./routes/deposits');
const withdrawalsRoutes = require('./routes/withdrawals');
const tradingRoutes = require('./routes/trading');

const app = express();
const PORT = process.env.PORT || 4000;

// No arrancar si sigue el JWT_SECRET de ejemplo o no está definido:
// con ese valor, cualquiera podría fabricar tokens válidos.
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET === 'cambia_esto_por_un_secreto_largo_y_aleatorio'
) {
  console.error(
    'ERROR: define un JWT_SECRET seguro y único en tu archivo .env antes de iniciar el servidor.'
  );
  process.exit(1);
}

// Necesario en hosting como Render/Railway (corren detrás de un proxy) para
// que express-rate-limit identifique bien la IP real de cada cliente.
app.set('trust proxy', 1);

app.use(cors()); // permite que tu frontend (en otro puerto/dominio) haga peticiones aquí
app.use(express.json());

// Ruta de salud, útil para probar que el servidor está vivo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/deposits', depositsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/trading', tradingRoutes);

// Manejo simple de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
