# Trading Backend (proyecto de aprendizaje)

Backend simple en Node.js + Express para un dashboard de cuentas de trading.
Datos persistidos en un archivo JSON (`data/data.json`, se crea solo) + login con JWT.

> Actualizado: ya no usa datos en memoria. `data/store.js` ahora lee y escribe
> en `data/data.json` (ver `data/db.js`), así que los datos sobreviven a
> reinicios del servidor y a redeploys. Se usa un archivo JSON y no SQLite a
> propósito: SQLite (vía `better-sqlite3`) requiere compilar un módulo nativo
> con Python + Visual Studio Build Tools cuando no hay un binario
> precompilado para tu versión de Node, lo cual rompe la instalación en
> muchas máquinas Windows. Un archivo JSON evita ese problema por completo.
> También se agregó un límite de intentos de login/registro
> (`express-rate-limit`) para frenar fuerza bruta, y el servidor ya no
> arranca si dejaste el `JWT_SECRET` de ejemplo.

## 1. Requisitos
- Node.js 18 o superior instalado (`node -v` para verificar)

## 2. Instalación

```bash
cd trading-backend
npm install
cp .env.example .env
```

Abre `.env` y cambia `JWT_SECRET` por cualquier texto largo y aleatorio.

## 3. Correr el servidor

```bash
npm start
```

Deberías ver:
```
Servidor corriendo en http://localhost:4000
```

Para desarrollo con reinicio automático al guardar cambios:
```bash
npm run dev
```

## 4. Probar que funciona

```bash
curl http://localhost:4000/api/health
```

## 5. Usuario de prueba

Ya viene un usuario cargado:
- **usuario:** `demo`
- **contraseña:** `demo1234`

## 6. Endpoints

### Auth

**POST /api/auth/login**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo1234"}'
```
Responde con un `token`. Guárdalo, lo necesitas para todo lo demás.

**POST /api/auth/register** (crear un usuario nuevo)
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"nuevo","password":"1234abcd"}'
```

### Cuentas (requieren el token del login)

En todas estas, reemplaza `TU_TOKEN` por el token que te dio el login.

**GET /api/accounts** — listar tus cuentas
```bash
curl http://localhost:4000/api/accounts \
  -H "Authorization: Bearer TU_TOKEN"
```

**GET /api/accounts/:id** — ver una cuenta
```bash
curl http://localhost:4000/api/accounts/1 \
  -H "Authorization: Bearer TU_TOKEN"
```

**POST /api/accounts** — crear cuenta
```bash
curl -X POST http://localhost:4000/api/accounts \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "EX-10003",
    "accountType": "Standard",
    "currency": "USD",
    "balance": 500,
    "equity": 495,
    "leverage": "1:50"
  }'
```

**PUT /api/accounts/:id** — actualizar cuenta
```bash
curl -X PUT http://localhost:4000/api/accounts/1 \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"balance": 1600}'
```

**DELETE /api/accounts/:id** — eliminar cuenta
```bash
curl -X DELETE http://localhost:4000/api/accounts/1 \
  -H "Authorization: Bearer TU_TOKEN"
```

### IA (requiere token)

**POST /api/ai/insights** — análisis de portafolio generado con OpenAI (ver sección 8 para configurarlo)
```bash
curl -X POST http://localhost:4000/api/ai/insights \
  -H "Authorization: Bearer TU_TOKEN"
```

## 7. Cómo llamarlo desde tu frontend (fetch)

```javascript
// Login
const res = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'demo', password: 'demo1234' }),
});
const { token } = await res.json();

// Guarda el token (ej. en una variable de estado o localStorage)

// Pedir cuentas
const accountsRes = await fetch('http://localhost:4000/api/accounts', {
  headers: { Authorization: `Bearer ${token}` },
});
const accounts = await accountsRes.json();
console.log(accounts);
```

## 8. Análisis con IA (OpenAI)

`/api/ai/insights` toma las cuentas del usuario logueado + precios de cripto
en vivo (CoinGecko) y le pide a la API de OpenAI un resumen corto en español
del estado del portafolio y del mercado. Todo corre del lado del servidor —
la API key nunca se expone al navegador.

Para activarlo:

1. Crea una API key en [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Ponla en tu `.env` como `OPENAI_API_KEY=sk-...`.
3. Revisa `OPENAI_MODEL` en `.env.example` — los nombres de modelo de OpenAI
   cambian seguido, así que antes de usar esto confirma en tu dashboard de
   OpenAI cuál es el modelo económico vigente y ajústalo si hace falta.

Cada llamada a este endpoint **cuesta dinero real** (aunque centavos con un
modelo económico), por eso trae su propio límite: máximo 15 análisis por
hora por IP (`routes/ai.js`). Si `OPENAI_API_KEY` no está definida, el
endpoint responde `503` con un mensaje claro en vez de romper el resto de la
app.

## 9. Estructura del proyecto

```
trading-backend/
├── server.js           # Punto de entrada
├── routes/
│   ├── auth.js          # login, register
│   ├── accounts.js      # CRUD de cuentas
│   └── ai.js             # Análisis de portafolio con OpenAI
├── middleware/
│   └── auth.js          # verifica el JWT
├── data/
│   ├── db.js             # Carga/guarda data.json + datos de ejemplo
│   └── store.js          # Funciones de acceso a datos
├── package.json
└── .env.example
```

## 10. Qué extender primero

1. ~~Persistencia real~~ ✅ ya guarda en un archivo JSON (`data/db.js` + `data/store.js`). Si el proyecto crece mucho, ahí es cuando sí vale la pena migrar a una base de datos real (SQLite vía `node:sqlite`, que ya viene incluido en Node y no requiere compilar nada, o Postgres si va a tener más de un servidor).
2. **Validación robusta**: ahora mismo la validación es básica (verifica campos requeridos y que balance/equity no sean negativos). Considera `zod` o `joi` para validar tipos, longitudes y formatos de forma más completa.
3. **Historial de operaciones (trades)**: se agrega como un recurso nuevo (`/api/accounts/:id/trades`) siguiendo el mismo patrón que `accounts.js`, más una tabla `trades` en `db.js`.
4. **Manejo de errores centralizado**: mover los `try/catch` y respuestas de error a un middleware de errores de Express en vez de repetirlas en cada ruta.
5. **Refresh tokens**: el JWT actual expira en 2h y no se puede renovar sin volver a loguearse; si tu app necesita sesiones más largas, agrega un endpoint de refresh.

## 11. Desplegar esto con un dominio real (Render, gratis)

Este backend guarda datos en un archivo (JSON) y corre como un proceso
continuo, así que el hosting tiene que mantenerlo "vivo" — no sirve un
hosting 100% *serverless* como Vercel/Netlify para esta parte (esos son
ideales para el frontend, no para esta API). Render es gratis para empezar
y soporta justo este tipo de proceso:

1. Sube este proyecto a un repositorio de GitHub (`git init`, `git add .`, `git commit`, luego lo conectas a un repo nuevo en GitHub).
2. Entra a [render.com](https://render.com) y crea una cuenta (puedes usar tu cuenta de GitHub).
3. **New +** → **Web Service** → selecciona tu repositorio.
4. Configuración:
   - **Root Directory**: `trading-backend` (si el repo tiene otras carpetas además de esta)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. En la sección **Environment**, agrega las variables:
   - `JWT_SECRET` → un texto largo y aleatorio (no el de ejemplo)
   - `NODE_ENV` → `production`
   - `OPENAI_API_KEY` → tu key real, si quieres que el análisis con IA funcione en producción
   - `OPENAI_MODEL` → opcional, revisa el valor vigente en tu dashboard de OpenAI
6. Deploy. Render te da una URL tipo `https://tu-servicio.onrender.com` — pruébala con `curl https://tu-servicio.onrender.com/api/health`.
7. Cuando tengas el dominio comprado (Cloudflare Registrar, Namecheap, etc.), en Render ve a **Settings → Custom Domain** y sigue las instrucciones para apuntar tu DNS ahí.

**Nota sobre los datos en el plan gratis:** Render Free **no** permite agregar un Disk persistente (eso es de pago) — el sistema de archivos es efímero, así que `data/data.json` se resetea cada vez que el servicio se reinicia, se redespliega, o se "duerme" por inactividad (~15 min sin tráfico en el plan gratis). El usuario demo se vuelve a crear solo en cada arranque; cualquier cuenta que registres en la versión desplegada puede desaparecer en algún reinicio. Para un proyecto de práctica sin dinero real esto no es grave. Si más adelante quieres que los datos persistan de verdad, la opción es una base de datos gestionada (ej. Render Postgres, gratis los primeros 30 días) en vez de un archivo local.

Railway funciona de forma muy similar si prefieres esa opción.
