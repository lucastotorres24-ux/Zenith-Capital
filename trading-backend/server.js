require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const aiRoutes = require('./routes/ai');
const depositsRoutes = require('./routes/deposits');
const withdrawalsRoutes = require('./routes/withdrawals');
const tradingRoutes = require('./routes/trading');
const accessRoutes = require('./routes/access');
const adminRoutes = require('./routes/admin');
const documentsRoutes = require('./routes/documents');
const communityRoutes = require('./routes/community');
const marketRoutes = require('./routes/market');
const { requireSiteAccess } = require('./middleware/siteAccess');
const { runDueAdminActions } = require('./data/store');

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
// Límite subido de 100kb (por defecto) a 15mb: los PDFs que la gente sube
// desde su perfil viajan como base64 dentro del JSON, y eso pesa más que
// el archivo original.
app.use(express.json({ limit: '15mb' }));

// Antes de responder CUALQUIER request, revisa si algún depósito/retiro/
// operación que Lucas ya aprobó o rechazó desde el panel de administrador
// ya cumplió su demora simulada de 1-2 minutos — si es así, recién ahí se
// aplica de verdad (ver nota larga en data/store.js). Se hace acá y no con
// un setTimeout para que sea robusto si el servidor se reinicia o se
// duerme un rato (plan gratuito de Render).
app.use((req, res, next) => {
  try {
    runDueAdminActions();
  } catch (err) {
    console.error('Error aplicando acciones de administrador pendientes:', err);
  }
  next();
});

// Ruta de salud, útil para probar que el servidor está vivo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// /api/access queda antes del bloqueo de sitio a propósito: es la ruta que
// lo verifica, así que no puede exigirlo ella misma (ver routes/access.js).
app.use('/api/access', accessRoutes);

// A partir de aquí, si SITE_ACCESS_CODE está configurado en el servidor,
// toda petición necesita el token de acceso del sitio (ver
// middleware/siteAccess.js). Si no está configurado, este middleware no
// hace nada y el sitio funciona igual que antes.
app.use(requireSiteAccess);

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/deposits', depositsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/market', marketRoutes);

// Manejo simple de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
