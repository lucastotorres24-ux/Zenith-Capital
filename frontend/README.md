# Zenith Capital — Frontend

Frontend en HTML + CSS + JavaScript puro (sin frameworks, sin paso de build)
para el `trading-backend`. Dos páginas: login/registro y un dashboard de
cuentas con análisis de IA y ticker de cripto en vivo.

> Cambiar el nombre de marca: está en dos lugares por página (`<title>` y el
> bloque `.brand`) en `index.html` y `dashboard.html`, más el logo de una
> letra en `.brand-mark`. Búscalo y reemplázalo, no hay nada hardcodeado en
> el CSS ni en el JS.

## 1. Estructura

```
frontend/
├── index.html              # Login / registro
├── dashboard.html           # Dashboard (requiere sesión)
├── assets/
│   ├── css/styles.css       # Todo el diseño (un solo archivo)
│   └── js/
│       ├── config.js         # URL del backend
│       ├── api.js            # Cliente fetch hacia la API
│       ├── auth.js            # Lógica de index.html
│       └── dashboard.js       # Lógica de dashboard.html
└── README.md
```

No hay `npm install` que correr aquí — es HTML/CSS/JS plano, se abre
directo en el navegador.

## 2. Correrlo en local

1. Asegúrate de tener el `trading-backend` corriendo en `http://localhost:4000`
   (ver el README de esa carpeta).
2. Abre `assets/js/config.js` y confirma que `API_BASE_URL` apunte ahí
   (ya viene así por defecto).
3. Abre `index.html` en el navegador. Puedes hacer doble clic en el archivo,
   o para evitar problemas de CORS con `file://` en algunos navegadores,
   sirve la carpeta con un servidor simple:
   ```bash
   npx serve .
   # o
   python3 -m http.server 5500
   ```
   y entra a `http://localhost:5500`.
4. Usuario de prueba: `demo` / `demo1234` (ya viene cargado en el backend).

## 3. Qué incluye

- **Login / registro** con las dos pestañas en una sola pantalla, sesión
  guardada en `localStorage` (token JWT).
- **Dashboard**: tiles de balance total, equity total, P/L flotante
  (equity − balance) y número de cuentas.
- **Cuentas**: tarjetas con balance, equity, apalancamiento y P/L por cuenta;
  crear, editar y eliminar desde un modal, todo contra la API real.
- **Ticker de cripto**: precios en vivo de BTC, ETH, USDT, BNB, SOL y XRP
  desde la API pública de CoinGecko (no necesita API key), se refresca cada
  60 segundos.
- Diseño oscuro "fintech" propio (no es una copia de ningún broker), con
  paleta validada para contraste y daltonismo — colores de estado (verde/rojo)
  siempre van acompañados de un ícono (▲/▼), nunca dependen solo del color.
- **Análisis con IA**: panel en el dashboard que llama a `/api/ai/insights`
  del backend y muestra un resumen generado por OpenAI sobre tus cuentas y
  el mercado. Requiere que el backend tenga `OPENAI_API_KEY` configurada
  (ver el README de `trading-backend`, sección 8) — si no está configurada,
  el botón muestra el error tal cual lo devuelve la API, no se rompe nada.

## 4. Desplegarlo con dominio propio

Este frontend es 100% estático (nada de servidor), así que le sirve
cualquiera de las opciones gratuitas que vimos antes: **Vercel**, **Netlify**,
**Cloudflare Pages** o **GitHub Pages**. Pasos generales (Vercel/Netlify son
casi idénticos):

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel/Netlify: **New Project** → conecta el repo → si el repo tiene
   más carpetas (como `trading-backend`), indica `frontend` como *root
   directory*. No hay build command ni output directory que configurar (es
   HTML estático).
3. Antes de desplegar en serio, edita `assets/js/config.js` y cambia
   `API_BASE_URL` por la URL real de tu backend en Render/Railway (no
   `localhost`, porque eso solo existe en tu máquina).
4. Deploy. Te dan una URL tipo `tu-proyecto.vercel.app`.
5. Conecta tu dominio propio desde el panel del hosting (**Settings → Domains**),
   igual que hicimos con el backend en Render.

Una vez el frontend esté en su propio dominio y el backend en el suyo,
confirma que el backend siga con `cors()` sin restringir (así está ahora) o,
si más adelante quieres endurecerlo, limita el origen permitido a la URL
exacta de tu frontend en `trading-backend/server.js`.

## 5. Siguientes pasos posibles

- Flujo de verificación / KYC simulado (varios pasos: datos personales →
  "subir" documento → estado verificado) antes de poder depositar.
- Historial de operaciones por cuenta (requiere el endpoint
  `/api/accounts/:id/trades` que quedó anotado como pendiente en el backend).
- Modo claro además del oscuro, usando las mismas variables CSS.
