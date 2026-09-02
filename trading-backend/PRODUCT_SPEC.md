# Zenith Capital — Especificación de producto

Este documento es la referencia completa de hacia dónde va el producto.
Antes de construir cualquier pantalla nueva, se revisa esta especificación —
así no hay que repetir el contexto en cada conversación.

> Nota de alcance: Zenith Capital es un simulador de práctica. Ningún flujo
> de aquí mueve dinero real ni ejecuta operaciones reales — el objetivo es
> que la experiencia, los datos y el razonamiento se sientan reales y
> verificables, no que lo sean.

## Estado actual (lo ya construido)

- Login / registro con JWT.
- CRUD de cuentas (balance, equity, apalancamiento, tipo, moneda).
- Análisis con IA v1: texto libre generado por OpenAI sobre el estado de
  las cuentas + precios de cripto del momento.
- Ticker de mercado (CoinGecko): precio y variación 24h de 6 criptomonedas.
- Depósitos v1: formulario (monto, banco, contacto) → queda como solicitud
  con estado `en_proceso`, sin acreditar saldo automáticamente. Incluye un
  botón "Pagar con tarjeta" deshabilitado (placeholder visual para cuando
  se conecte un procesador de pago real — no se construye antes de tener
  ese proveedor, por seguridad: nunca se recolectan datos de tarjeta sin un
  procesador real detrás).
- Retiros v1: el usuario elige un método (Binance, Coinbase, Trust Wallet o
  transferencia bancaria) y un monto. Al confirmar, se muestra el mensaje
  "Tu solicitud de retiro ha sido enviada. Serás contactado por tu gestor
  de cuentas para ayudarte con el retiro" y queda registrado en el
  historial con estado `en_proceso`. Todavía no incluye destino
  parcialmente oculto, comisión, ni el flujo completo de revisión de la
  Fase 3 — eso se añade cuando lleguemos a esa fase.
- Ticker de cripto: los precios parpadean en verde/rojo cuando cambian
  entre actualizaciones (cada 15s) — el parpadeo refleja el movimiento real
  de CoinGecko, no un efecto simulado.
- **Fase 0 (fundamento de datos) — holdings**: cada cuenta puede tener
  posiciones abiertas por activo (cantidad + precio medio de compra).
- **Comprar / Vender v1**: botones COMPRAR (verde) y VENDER (rojo) en el
  ticker de cripto y en cada posición abierta. El precio usado es el real
  de CoinGecko que el usuario ve en pantalla. **Ya no se ejecuta al
  instante** (ver "Aprobación manual" más abajo): la operación queda
  "pendiente" y recién descuenta/acredita el balance y crea/actualiza la
  posición cuando Lucas la aprueba desde el panel de administrador. Las
  posiciones abiertas muestran cantidad, precio de compra, precio actual y
  P/L recalculado en vivo cada vez que el ticker se actualiza.
- **Aprobación manual de depósitos, retiros, compras y ventas** (pivote
  importante sobre la v1 original): a pedido explícito de Lucas, ninguna de
  estas cuatro acciones se ejecuta sola — todas quedan "en revisión" hasta
  que él las aprueba (tal cual, o editando el monto/cantidad/precio final
  antes de confirmar) o las rechaza. Solo el login/registro sigue siendo
  instantáneo. **Desde agosto 2026, esa aprobación tiene además una demora
  simulada de 1 a 2 minutos** antes de aplicarse de verdad — ver sección 16.
- **Panel de usuarios registrados, moneda simulada Zenith (ZNT) y modo
  claro/oscuro** — ver secciones 16 y 17 (agosto 2026).
- **Navegación de vuelta al dashboard, bancos reales de Argentina/Perú,
  rediseño estilo Exness de depositar/retirar, moneda local con conversión
  real, página propia de Insignias Zenith, auto-inversión real
  (Diamante/Platino), Comunidad Zenith interactiva (chat de dos vías),
  footer corporativo, buzón de soporte con NIT, y edición directa de
  usuarios desde el panel de administrador** — ver sección 18 (agosto
  2026) para el detalle completo de esta tanda.
- **Footer con texto profesional y columna de Seguridad, sincronización
  automática balance→equity al editar cuentas desde el panel de
  administrador, y el logo funcionando como botón de "volver al inicio"
  en todas las páginas** — ver sección 19 (agosto 2026).
- **Base de datos permanente en MongoDB Atlas (las cuentas ya no
  desaparecen cuando Render reinicia el servicio) y solo se puede
  registrar con correos de dominios reales** — ver sección 20 (agosto
  2026).
- **Inicio de sesión con usuario o correo, correos duplicados bloqueados,
  sesión de 30 días con aviso claro al vencer, buscador de cuentas en el
  panel de administrador, y términos y condiciones reescritos explicando
  qué es el trading** — ver sección 21 (agosto 2026).
- **Panel de trading con velas que se mueven en vivo (no cada 60s), cinco
  plazos (1D a 1A), tres tipos de gráfico (velas/línea/área) e
  indicadores técnicos (medias móviles, Bandas de Bollinger, volumen,
  RSI) con su propio sub-gráfico sincronizado, barra OHLC y pantalla
  completa** — ver sección 22 (agosto 2026).
- **Brecha de seguridad cerrada (ya nadie puede asignarse su propio
  balance — solo Zenith Capital lo asigna), lista de instrumentos con
  buscador y categorías estilo Exness, 37 criptomonedas y 5 metales
  reales (Oro, Plata, Platino, Paladio, Cobre) en el panel de trading** —
  ver sección 23 (agosto 2026).
  - **Depósitos y retiros**: al crearse no tienen todavía una cuenta
    asignada (`accountId: null`, estado `en_proceso`). Al aprobar, Lucas
    elige a qué cuenta del usuario va (o de cuál sale) y puede editar el
    monto final antes de confirmar — recién ahí se mueve el balance. Al
    rechazar, no pasa nada más (queda con estado `rechazado`).
  - **Compras y ventas**: al crearse quedan con estado `pendiente` y no
    tocan el balance ni las posiciones todavía. Al aprobar, Lucas puede
    editar la cantidad y/o el precio final antes de confirmar — recién ahí
    se descuenta/acredita el balance y se crea/actualiza/cierra la
    posición (estado pasa a `aprobada`). Al rechazar, no pasa nada más
    (estado `rechazada`).
  - **Panel de administrador** (`admin.html`): pantalla separada,
    protegida en dos capas — primero el código de acceso general del
    sitio, y además su propio código de administrador (`ADMIN_CODE`, ver
    más abajo) que solo Lucas conoce. Muestra tres colas (Depósitos
    pendientes / Retiros pendientes / Compras y ventas pendientes), cada
    una con los campos editables y botones Aprobar/Rechazar. Se refresca
    sola cada 15 segundos — Lucas eligió revisar el panel él mismo en vez
    de recibir avisos por correo/SMS.
  - **Historial de operaciones** (dashboard del usuario): tabla nueva que
    muestra cada compra/venta con su estado (Pendiente / Aprobada /
    Rechazada) — así el usuario ve en qué quedó su solicitud, ya que el
    balance y las posiciones no cambian hasta que se aprueba.
  - **Fuera de alcance por ahora**: el panel Sube/Baja (sección 14) sigue
    resolviéndose solo, al instante, contra el precio real de CoinGecko
    cuando vence el tiempo — no se llevó a este flujo de aprobación manual
    porque su ventana de vencimiento (30s a 5min) es demasiado corta para
    una revisión manual. Esto no fue pedido explícitamente por Lucas y
    debe confirmarse con él si también debería requerir aprobación.
- **Código de acceso del sitio** (`SITE_ACCESS_CODE`): bloqueo general,
  independiente del login de usuarios, para que el sitio público no quede
  abierto a cualquiera mientras Lucas es el único probándolo. Si la
  variable de entorno `SITE_ACCESS_CODE` está configurada en el backend,
  toda página (excepto la pantalla que pide el código) exige un código
  compartido antes de dejar pasar — una vez ingresado, se guarda en el
  navegador por 180 días. Si la variable no está configurada, este
  bloqueo queda completamente desactivado (no afecta a nadie).
- **Código de administrador** (`ADMIN_CODE`): segunda capa de acceso,
  independiente y encima de la anterior, exclusiva para `admin.html`. Sin
  esta variable configurada en el backend, el panel de administrador
  responde que no está disponible.
- Cambiar contraseña disponible desde el **menú de usuario** en la barra
  superior (requiere la contraseña actual) — ver nota más abajo.
- Los comprobantes de depósito/retiro muestran un número de referencia
  aleatorio (no el ID interno) para que se sienta parte de un sistema con
  miles de registros.
- La barra superior muestra una insignia "★ Zenith Investor" junto al
  nombre de usuario.
- Los formularios de Depósitos y Retiros piden el **número de celular**
  como método de contacto principal (antes pedían correo o WhatsApp por
  igual). Retiros ahora también guarda ese contacto en el historial.
- **Panel de Trading estilo IQ Option v1** (sección 14): página nueva
  (`trading-panel.html`), accesible desde un banner destacado en el
  dashboard. Gráfico de velas con histórico real de las últimas 24h vía
  CoinGecko (`/coins/{id}/ohlc`), selector de activo (BTC/ETH/BNB/SOL/XRP),
  4 duraciones (30s/1min/2min/5min), monto libre, botones grandes SUBE/BAJA
  y retorno fijo del 85%. Usa el **mismo balance** de la cuenta elegida (no
  un saldo aparte): al abrir la operación se descuenta el monto de
  inmediato, y al vencer el tiempo se liquida sola contra el precio real de
  CoinGecko en ese momento — si acierta recibe el monto + 85%, si no, pierde
  lo apostado (empate = se devuelve el monto). Las operaciones abiertas
  muestran una cuenta regresiva en vivo y se retoman solas si se recarga la
  página antes de que venzan. Historial completo debajo del panel.
- **Menú de usuario (dashboard)**: el botón suelto "Cambiar contraseña" que
  vivía en la barra superior se quitó — ahora vive dentro de un menú
  desplegable que se abre al hacer click en el chip del usuario (avatar +
  nombre, ej. "wizzard"/"W"). El menú incluye "Cambiar contraseña" y
  "Cerrar sesión" (mismos `id`s de antes, así que la lógica que ya
  funcionaba no cambió) y es el lugar donde deben ir todos los ajustes de
  cuenta que se agreguen a futuro (tema, correo, etc.) en vez de seguir
  agregando botones sueltos a la barra superior. Se cierra al hacer click
  afuera, con Escape, o al elegir una opción.
- **Animación "invest-rain" (pantalla de acceso) — fix de visibilidad
  (2 rondas)**: la franja donde caen los símbolos se calculaba mal.
  Primera causa: el cálculo medía los contenedores `<div>` de bloque/flex
  (que por defecto ocupan todo el ancho disponible aunque el texto de
  adentro sea angosto) en vez de medir el texto/tarjetas mismos — ya
  corregido. Segunda causa (la que realmente afectaba a Lucas, encontrada
  después): incluso midiendo bien el texto, en anchos de ventana muy
  comunes en laptops (1200-1366px) la franja libre que quedaba a la
  derecha era de apenas 20-90px, por debajo del mínimo de 50px que el
  código exigía para dibujar algo — así que en esas ventanas no aparecía
  nada, silenciosamente. Ahora el mínimo bajó a 18px y los símbolos se
  achican automáticamente en franjas angostas para no recortarse contra
  el borde, así que prácticamente siempre hay algo visible (probado de
  900px a 1920px de ancho). Por debajo de 860px el panel izquierdo
  completo se oculta (comportamiento ya existente, no solo la lluvia).

- **Registro extendido + Términos y condiciones (agosto 2026)**: el
  formulario de "Abrir una cuenta" ahora pide, además de usuario y
  contraseña, **nombre completo**, **correo** y **número de celular**
  (los tres son obligatorios y se validan en el backend: correo con
  formato válido, celular con al menos 7 dígitos). Antes de crear la
  cuenta aparece un popup de **Términos y condiciones** con un resumen
  breve (esto es un simulador, ningún depósito/retiro/compra/venta mueve
  dinero real, todo queda sujeto a revisión manual) y una casilla
  "Acepto los términos y condiciones" — el botón "Crear cuenta" del popup
  queda deshabilitado hasta que se marca la casilla. El backend guarda
  `termsAcceptedAt` y rechaza el registro si `acceptedTerms` no llega en
  `true`. El login ahora devuelve el perfil completo del usuario (no solo
  `id`/`username`).
- **"Mi perfil" (reemplaza el antiguo botón suelto "Cambiar contraseña")**:
  desde el menú de usuario, "Mi perfil" abre un modal con foto/inicial,
  nombre y correo arriba, y tres pestañas:
  - **Datos personales**: teléfono, fecha de nacimiento y dirección de
    vivienda, editables y guardados vía `PUT /api/auth/profile`.
  - **Documentos**: el usuario puede adjuntar PDFs (hasta 10 MB cada uno)
    cuando Zenith le pida algún documento — se suben en base64, se validan
    en el servidor (extensión `.pdf` + primeros bytes `%PDF`) y se guardan
    en disco (`data/uploads/`, fuera del repo). Cada documento se puede
    descargar de nuevo desde la misma pestaña. El panel de administrador
    (`admin.html`) tiene su propia vista de solo lectura de **todos** los
    documentos de **todos** los usuarios, para revisión.
    > Mismo cuidado de seguridad que ya estaba anotado en la sección 9:
    > el mecanismo ya soporta subir cualquier PDF, pero sigue sin ser un
    > flujo de verificación de identidad real — no se debe pedir ni subir
    > documentos de identidad reales de nadie a través de esto.
    > Nota de infraestructura: igual que `data/data.json`, estos PDFs
    > viven en el disco del backend — en Render (plan gratuito, sin disco
    > persistente contratado) un redeploy los borra igual que borraría la
    > base de datos. No pasa nada si ninguna de las dos cosas necesita
    > sobrevivir a un redeploy todavía; si en algún momento sí hace falta,
    > la solución es la misma para ambas: un "persistent disk" de Render.
  - **Contraseña**: el cambio de contraseña que antes vivía suelto en la
    barra superior — misma lógica de antes, ahora es una pestaña más.
- **Insignias Zenith (Bronce / Plata / Oro / Diamante / Platino)**: junto
  al nombre de usuario (arriba a la derecha) aparece una insignia
  coloreada según cuánto tiene el cliente **invertido ahora mismo**
  (balance de todas sus cuentas + valor de mercado de sus posiciones
  abiertas a precio en vivo de CoinGecko) — **no** es un acumulado
  histórico de todo lo que alguna vez depositó, así que puede subir o
  bajar de insignia con el tiempo si su inversión sube o baja. Umbrales:
  Bronce desde $250, Plata desde $800, Oro desde $1.500, Diamante desde
  $5.000, Platino desde $10.000 (por debajo de $250 se muestra "★ Zenith
  Investor" sin insignia todavía). Cada nivel tiene su propio color tanto
  en la insignia como en el avatar del usuario. El cálculo se recalcula
  solo, en el navegador, cada vez que cambian las cuentas, las posiciones
  o el ticker de precios.
- **Comunidad Zenith (`community.html`)**: página nueva, accesible desde
  un banner en el dashboard, con un feed de chat **simulado** entre 10
  clientes certificados ficticios (2 de cada insignia) comentando sobre
  el mercado y la plataforma. Los mensajes se generan solos en el
  servidor con un ritmo realista (no hace falta que nadie esté
  conectado para que seudo-avancen: al entrar cualquiera, el backend
  calcula cuántos mensajes "deberían" existir ya según el tiempo pasado
  y los agrega) y el feed se refresca cada 8 segundos. Aviso permanente
  al pie de página aclarando que es una comunidad simulada, no personas
  reales.
- **Detalle de inversión por posición**: cada fila de "Posiciones
  abiertas" tiene un botón "Detalles" que abre un modal con cantidad,
  precio de compra, precio actual, inversión inicial ($), valor actual
  ($), ganancia/pérdida ($ y %) y el historial de operaciones filtrado a
  ese activo — para que el usuario pueda ver de un vistazo si ganó o
  perdió y cuánto, sin tener que hacer cuentas.
- **Asesoría IA (Diamante y Platino)**: sección nueva en el dashboard,
  visible solo para usuarios con insignia Diamante o Platino, que genera
  (vía OpenAI) sugerencias educativas de qué considerar en las próximas
  operaciones según las posiciones actuales y el mercado. **Nunca
  ejecuta nada sola** — son solo recomendaciones de texto; si el usuario
  decide actuar sobre ellas, tiene que pasar por el mismo botón
  COMPRAR/VENDER de siempre, que a su vez sigue quedando pendiente de
  aprobación manual como el resto de las operaciones (ver "Aprobación
  manual" arriba). Por seguridad, el umbral de acceso también se valida
  en el servidor (con un cálculo de inversión equivalente al del
  frontend, aunque no idéntico byte a byte porque el backend no tiene
  acceso a precios en vivo de mercado) para que nadie lo desbloquee con
  un simple cambio en el navegador.
- **Animación "invest-rain" — rediseño estilo Matrix (agosto 2026)**: la
  versión anterior (símbolos rebotando como monedas en una franja angosta
  a la derecha del texto) se reemplazó por una lluvia estilo Matrix
  clásica: columnas de pared a pared de todo el panel izquierdo (antes
  confinada a un costado), muchas más figuras cayendo, más rápido, cada
  columna con un carácter "cabeza" brillante (con destello/glow en tonos
  dorado o azul de marca, no verde) seguido de una estela que se
  desvanece — mismo vocabulario visual de antes (`$`, `₿`, `Ξ`, `%`, `▲`,
  `▼` y tickers como BTC/ETH/SOL/...). Para que el texto que queda encima
  (título, tarjetas de confianza, tarjeta de IA) se siga leyendo bien, la
  lluvia se atenúa (no desaparece del todo) justo en esa zona.

> Pendiente de esta misma sección 10 (no bloqueante): un *ledger* unificado
> que junte depósitos + retiros + compras + ventas + operaciones Sube/Baja
> en una sola vista de historial — hoy cada uno vive en su propia tabla del
> dashboard (Depósitos / Retiros / Historial de operaciones para compras y
> ventas); `options` (Sube/Baja) sí queda registrado en el backend pero
> todavía no tiene su propia tabla de historial en el dashboard principal
> (vive aparte, debajo del panel de trading). Los widgets de "actividad de
> mercado" (sección 12) siguen sin construir. La "mejor construcción de los
> botones" pedida por Lucas se aplicó de forma puntual (iconos en los
> botones principales del dashboard, banner de acceso al panel de trading,
> botones SUBE/BAJA grandes) — el rediseño visual general sigue pendiente
> como tarea aparte.

Todo lo que sigue es la especificación objetivo — se construye por fases
(ver "Roadmap" al final), no de una sola vez.

---

## 1. Dashboard principal

Lo primero que el usuario debe poder ver, sin scrollear ni pensar:

- Capital depositado (total histórico depositado).
- Valor actual de la cartera.
- Ganancia/pérdida absoluta.
- Rendimiento porcentual.
- Evolución: diaria, semanal, mensual y desde el inicio.
- Distribución de la cartera (por activo).
- Estado de cada operación.
- Última actualización de precios (timestamp visible).
- Botones de **Depositar** y **Retirar**.

Test de la pantalla: en segundos debe responder *¿Cuánto tengo? ¿Cuánto he
ganado o perdido? ¿En qué está mi dinero?*

## 2. Portfolio — "¿En qué estoy invertido?"

Tabla por activo:

| Activo | Cantidad | Precio actual | Valor | % cartera | P/L |
|---|---|---|---|---|---|
| BTC | 0.XX | $XX | $XX | XX% | +$XX |
| ETH | X.XX | $XX | $XX | XX% | -$XX |

Al entrar al detalle de un activo:

- Gráfico histórico.
- Precio actual.
- Cantidad en propiedad del usuario.
- Precio medio de adquisición.
- Ganancia/pérdida.
- Fecha de compra.
- Historial de operaciones de ese activo.
- Fuente del precio.

Clave: el usuario tiene que poder comprobar de dónde sale cada número.

## 3. Mercado en tiempo real

Por cada activo de mercado:

- Precio.
- Variación 24h.
- Volumen.
- Market cap.
- Gráfico.
- Timestamp de actualización.
- Fuente de datos.

Regla dura: nunca mostrar "tiempo real" si en realidad los datos vienen
retrasados o cacheados.

## 4. Depósitos

Flujo: **Depositar → método → importe → confirmación → estado**

Estados posibles: `Pendiente` → `Confirmando` → `Completado` / `Rechazado`.

Cada movimiento genera un **ID de transacción**.

## 5. Retiros

Mismo patrón que depósitos: **Retirar → importe → destino → revisión →
confirmación → estado**

El usuario debe poder consultar por cada retiro:

- Fecha.
- Importe.
- Método.
- Destino (parcialmente oculto — ej. `****4821`).
- Comisión.
- ID de operación.
- Estado.

Regla dura: nunca mostrar un retiro como "Completado" hasta que realmente
lo esté (en este simulador, eso significa: hasta que exista un paso
explícito de confirmación, no de forma automática al solicitarlo).

## 6. Historial / Ledger

La pieza técnicamente más importante: cada movimiento (depósito, retiro,
compra, venta) queda registrado con:

- Fecha
- Tipo
- Activo
- Cantidad
- Precio
- Comisión
- Valor
- ID
- Estado

Con esto el usuario puede reconstruir exactamente cómo llegó de su depósito
inicial a su balance actual.

## 7. Página de cada producto de inversión

Si existe una estrategia o producto específico, debe explicar:

- Qué es.
- En qué activos invierte.
- Objetivo.
- Nivel de riesgo.
- Horizonte temporal.
- Comisiones.
- Principales riesgos.
- Rendimiento histórico real, si existe.
- Metodología utilizada.

No alcanza con poner "AI Trading System" — hay que explicar qué hace
realmente la IA.

## 8. IA / Análisis

El objetivo es que se sienta sofisticado porque **hay información real
detrás**, no porque hay una animación bonita. Ejemplo de formato:

```
AI Market Analysis
BTC — Sentiment: Neutral
Volatility: Moderate
Trend: +2.4%
Market conditions: Moderate risk

¿Por qué?
- Volumen
- Tendencia
- Volatilidad
- Noticias/datos utilizados
- Indicadores
```

Siempre mostrando el razonamiento (los datos de entrada), no solo la
conclusión.

## 9. Perfil — construido (agosto 2026)

- [x] Información personal: nombre completo, correo y celular se piden en
      el registro; fecha de nacimiento y dirección se editan después
      desde "Mi perfil" → pestaña "Datos personales" (ver "Estado
      actual" arriba para el detalle completo).
- [x] Documentos: pestaña "Documentos" en el mismo modal — subir y
      descargar PDFs, con vista de administrador para revisar los de
      todos los usuarios.
- [ ] Verificación: todavía no existe un flujo de verificación en sí
      (aprobar/rechazar un documento, marcar a un usuario como
      "verificado", etc.) — hoy los documentos solo se guardan y se
      pueden ver/descargar, nadie los "aprueba" formalmente todavía.

> Nota de seguridad (sigue vigente): aunque el flujo de documentos ya
> está construido, no se deben subir ni almacenar documentos de identidad
> reales — se simula con cualquier archivo de prueba. Guardar
> identificaciones reales de forma insegura es un riesgo real aunque el
> resto de la app sea una simulación.

---

## Mapa del sitio

```
USER
│
├── Dashboard
│   ├── Balance
│   ├── Performance
│   ├── Portfolio
│   └── Market
│
├── Portfolio
│   ├── Assets
│   ├── Allocation
│   └── Performance
│
├── Markets
│   ├── Prices
│   ├── Charts
│   └── Analysis
│
├── Transactions
│   ├── Deposits
│   ├── Withdrawals
│   ├── Trades
│   └── Ledger
│
├── Investment Products
│   ├── Description
│   ├── Risk
│   ├── Holdings
│   └── Performance
│
└── Profile
    ├── Personal information
    ├── Verification
    └── Document
```

---

## Roadmap propuesto (fases de construcción)

No se construye todo de una vez — cada fase depende de la anterior.
Marcar con [x] cuando una fase quede terminada.

- [x] **Fase 0 — Fundamento de datos**: holdings (posiciones por activo,
      cantidad + precio medio) y el motor de compra/venta ya están
      construidos. Falta la parte de *ledger unificado* como pantalla
      propia (hoy depósitos/retiros/compras/ventas viven cada uno en su
      tabla) — se hace en la Fase 3 junto con Retiros.
- [ ] **Fase 1 — Dashboard real**: capital depositado, valor de cartera,
      P/L absoluto y %, evolución día/semana/mes/desde el inicio,
      distribución por activo, última actualización.
- [ ] **Fase 2 — Portfolio**: tabla de activos + página de detalle por
      activo con gráfico histórico y datos de origen.
- [ ] **Fase 3 — Retiros + Ledger visible**: flujo de retiro simétrico al
      de depósito, y una pantalla de historial completo.
- [ ] **Fase 4 — Mercado enriquecido**: volumen, market cap, gráfico,
      fuente y timestamp por activo.
- [ ] **Fase 5 — IA de análisis enriquecida**: sentiment/volatilidad/
      tendencia con el razonamiento visible (no solo la conclusión).
- [ ] **Fase 6 — Producto de inversión**: página de detalle de la
      estrategia (riesgo, comisiones, metodología).
- [x] **Fase 7 (parcial) — Perfil**: datos personales (nombre, correo,
      celular, fecha de nacimiento, dirección) y subida/descarga de
      documentos PDF ya construidos (ver sección 9). Falta el flujo de
      **verificación** en sí (aprobar/rechazar un documento, marcar a un
      usuario como verificado).

Depósitos v1 y Retiros v1 (ya construidos) se revisan y extienden en la
Fase 0/3 para que sus estados coincidan con el resto del ledger.

## 10. Compra y venta (motor de trading simulado)

- Botón **COMPRAR** en verde, botón **VENDER** en rojo.
- La solicitud queda **pendiente de aprobación** (ver "Aprobación manual"
  en "Estado actual"): no descuenta ni acredita el saldo de inmediato.
  Recién al aprobarse desde el panel de administrador se mueve el balance
  de la cuenta y se crea/actualiza/cierra la posición — con la cantidad y
  el precio que Lucas deje (puede ser el solicitado o uno editado).
- Se opera sobre precios reales del ticker de cripto (CoinGecko) — el
  movimiento de precio que mueve la ganancia/pérdida es real, no inventado.
- Posiciones abiertas visibles con: activo, cantidad, precio de compra,
  precio actual, y ganancia/pérdida (P/L) recalculada en vivo.
- Esto requiere el concepto de *holding* (posición por activo dentro de una
  cuenta) que hoy no existe — una cuenta solo tiene `balance`/`equity`
  globales. Es exactamente la **Fase 0** del roadmap: holdings + ledger
  unificado. Todo lo demás de esta sección se construye sobre eso.

## 11. Panel de administrador — cola de aprobación (construido)

> Esta sección reemplazó una idea anterior ("panel de activos
> personalizados/monedas propias" con precio editable a mano) que Lucas
> pidió explícitamente descartar antes de construirse del todo: no quería
> inventar una moneda propia, sino poder revisar y editar el monto final
> de las acciones reales de los usuarios (depósito, retiro, compra, venta)
> antes de que se apliquen. Lo que sigue es lo que se construyó en su
> lugar — ver el detalle completo en "Aprobación manual..." dentro de
> "Estado actual", arriba.
>
> **Actualización agosto 2026**: Lucas volvió a pedir una moneda simulada
> propia, esta vez con un mecanismo distinto y ya validado con él (no
> precio editable a mano, sino tendencia/volatilidad que el sistema
> convierte en velas solo) — ver sección 16.3. Las dos cosas conviven sin
> contradicción: la cola de aprobación de este panel sigue controlando las
> acciones reales de los usuarios (depósitos, retiros, compras, ventas —
> incluidas las de ZNT, que pasan por la misma cola), y la moneda Zenith es
> un activo aparte que se puede comprar/vender como cualquier otro.

- Pantalla `admin.html`, separada del login normal de usuarios, protegida
  por el código de acceso del sitio y además por su propio código de
  administrador (`ADMIN_CODE`).
- Tres colas: Depósitos pendientes, Retiros pendientes, Compras y ventas
  pendientes — cada ítem muestra quién lo pidió, los datos originales, y
  campos editables (monto para depósitos/retiros, cantidad y precio para
  compras/ventas) antes de Aprobar o Rechazar.
- Para depósitos/retiros, además hay que elegir a qué cuenta del usuario
  va (o de cuál sale) — no se asigna sola.
- Se refresca sola cada 15 segundos mientras está abierta (sin avisos por
  correo/SMS — Lucas prefiere revisar el panel él mismo).

## 12. Actividad de mercado (elementos para incentivar el uso)

Widgets con temática financiera para que la plataforma se sienta viva,
siempre etiquetados como demo/simulado:

- Anuncios de nuevos activos disponibles.
- Noticias / actualizaciones del mercado.
- Sección de "oportunidades de inversión".
- Avisos de movimientos importantes de precio.
- Indicadores de tendencia (activos al alza / a la baja).
- Mensajes promocionales de la plataforma.

## 13. Cuenta y seguridad

- Opción para cambiar la contraseña desde el perfil/configuración.
- El campo de contacto en Depósitos/Retiros debe pedir el **número de
  celular como método principal** (en vez de tratarlo igual que un correo).

## 14. Panel de trading estilo IQ Option — v1 construido

Inspirado en la captura que Lucas compartió de IQ Option: un panel dedicado
con gráfico de velas, selector de tiempo, monto, y botones "Sube"/"Baja"
con retorno esperado. Decisiones confirmadas con Lucas:

- Vive en su propia página dentro del sitio (`trading-panel.html`), no en
  una ventana emergente — se accede desde un banner en el dashboard.
- Gráfico de velas con datos históricos reales de CoinGecko (endpoint
  `/coins/{id}/ohlc`, público, sin API key, últimas 24h) — no inventados.
  Puede tener minutos/horas de rezago frente al segundo exacto, cosa que
  Lucas confirmó que está bien.
- Mecánica "Sube/Baja" (internamente `higher`/`lower`, mostrado en pantalla
  como botones **COMPRA** (verde, gana si sube) y **VENDE** (rojo, gana si
  baja) por pedido de Lucas): el usuario elige monto y una duración corta
  (30s a 5min); si el precio al vencer el tiempo es mayor o menor que el de
  entrada según lo elegido, gana un retorno fijo del 85%; si no, pierde el
  monto apostado (empate devuelve el monto). Se resuelve contra el precio
  real de CoinGecko de ese momento.
- Si el usuario todavía no tiene ninguna cuenta creada, el panel muestra un
  aviso claro ("Todavía no tienes ninguna cuenta — créala en el dashboard")
  en vez de dejar el selector de cuenta vacío sin explicación, y deshabilita
  el resto de los controles hasta que exista al menos una cuenta.
- Usa el **mismo balance** que el resto de la plataforma (cuentas ya
  existentes), no un saldo aparte — así todo el dinero simulado de Lucas
  vive en un solo lugar.
- Pendiente futuro (no bloqueante): sumar esta actividad al ledger
  unificado cuando se construya (ver nota en "Estado actual").

## 15. Insignias Zenith, Comunidad y Asesoría IA — construido (agosto 2026)

Resumen de la especificación completa (ver también "Estado actual" arriba
para la descripción orientada al usuario).

### 15.1 Insignias (Bronce / Plata / Oro / Diamante / Platino)

- Umbrales sobre lo **invertido ahora mismo**: Bronce $250, Plata $800,
  Oro $1.500, Diamante $5.000, Platino $10.000+.
- "Invertido ahora mismo" = suma de los `balance` de todas las cuentas del
  usuario + valor de mercado de sus posiciones abiertas. El valor de
  mercado se calcula **dos veces, con datos distintos a propósito**:
  - **En el frontend** (`dashboard.js`, `computeInvestedTotal()`): usa el
    precio en vivo de CoinGecko cuando ya llegó (o el precio medio de
    compra mientras tanto) — esto es lo que decide **qué insignia se
    muestra** en pantalla, porque es lo más preciso y dinámico.
  - **En el backend** (`data/store.js`, `getInvestedProxyByUser`): usa el
    precio medio de compra (`avgPrice`) porque el servidor no tiene
    acceso a precios de mercado en vivo — esto es solo un valor
    **aproximado**, usado únicamente para una cosa: decidir en el
    servidor si a un usuario le corresponde o no el acceso a la Asesoría
    IA (sección 15.3), para que nadie lo desbloquee manipulando el
    navegador. No se usa para decidir qué insignia mostrar.
  - Es intencional que estos dos cálculos puedan diferir un poco entre sí
    (uno usa precio en vivo, el otro precio de compra) — no es un bug.
- Colores por nivel definidos en `styles.css` (`.rank-bronce`,
  `.rank-plata`, `.rank-oro`, `.rank-diamante`, `.rank-platino`), aplicados
  tanto a la insignia junto al nombre como al avatar del usuario.

### 15.2 Comunidad Zenith

- `community.html` + `GET /api/community/messages` (requiere sesión).
- Roster fijo de 10 clientes ficticios (`data/community.js` en el
  backend, duplicado en `community.js` del frontend solo para poder
  pintar la lista completa de la barra lateral) — 2 de cada insignia.
- Generación perezosa: no hay ningún proceso corriendo en segundo plano
  (evita problemas si el servidor gratuito de Render se "duerme" por
  inactividad) — cada vez que alguien pide los mensajes, el backend
  calcula cuántos mensajes "deberían" haberse generado desde la última
  vez según el tiempo transcurrido, y los agrega en ese momento.

### 15.3 Asesoría IA (Diamante y Platino)

- `POST /api/ai/advisory` (requiere sesión). Devuelve texto generado por
  OpenAI con sugerencias sobre las posiciones actuales y el mercado.
- **Alcance confirmado con Lucas**: solo recomendaciones en texto — nunca
  ejecuta una operación automáticamente. Si el usuario quiere actuar
  sobre una sugerencia, usa el flujo normal de COMPRAR/VENDER, que sigue
  pasando por aprobación manual como cualquier otra operación (sección
  10 / "Aprobación manual" en "Estado actual").
- Gate de acceso: solo responde si `getInvestedProxyByUser` (ver 15.1)
  da $5.000 o más (umbral de Diamante) — si no, `403`. Si el umbral se
  cumple pero no hay `OPENAI_API_KEY` configurada, responde `503` (error
  de configuración, no de permisos) — el frontend distingue ambos casos
  y muestra el mensaje correspondiente.
- No requiere ninguna variable de entorno nueva: reutiliza
  `OPENAI_API_KEY`, ya usada por el "Análisis con IA" original.

## 16. Demora de aprobación, panel de usuarios y moneda Zenith (ZNT) — construido (agosto 2026)

### 16.1 Demora simulada de 1 a 2 minutos en la aprobación

- A pedido de Lucas, aprobar/rechazar un depósito, retiro o compra/venta ya
  no aplica el cambio al instante: queda agendado (`pendingAction` /
  `pendingPayload` / `applyAt` en `data/store.js`) y se aplica de verdad
  entre 1 y 2 minutos después (tiempo aleatorio dentro de ese rango), sin
  que el estado visible cambie mientras tanto (el usuario sigue viendo
  "en proceso"/"pendiente" hasta que se aplica de verdad).
- Es **una sola cola de aprobación para todos** — Lucas la usa igual desde
  cualquier máquina donde entre como administrador; no hay un modo
  "prueba" separado del modo real.
- Generación perezosa por request, no por temporizador: cada request al
  backend (cualquiera — hay un middleware global en `server.js`) revisa si
  alguna acción ya decidida cumplió su plazo y, si es así, recién ahí mueve
  el balance/posición de verdad (`runDueAdminActions` en `data/store.js`).
  Igual que el resto de la generación perezosa del proyecto (comunidad,
  ZNT), esto es robusto a que el servidor gratuito de Render se reinicie o
  se duerma por inactividad — no depende de que un proceso siga vivo sin
  interrupción.
- Los campos internos de la decisión (`pendingAction`, `pendingPayload`,
  `applyAt`, `adminDecidedAt`) nunca se exponen en los endpoints que ve el
  usuario (`stripPendingInternals` en `data/store.js`) — solo se ve el
  estado final una vez aplicado.
- El dashboard vuelve a consultar cuentas, depósitos, retiros, posiciones y
  operaciones cada 20 segundos (`OPERATIONAL_REFRESH_MS` en
  `dashboard.js`) para que el cambio aparezca solo, sin recargar la página.

### 16.2 Panel de usuarios registrados (admin)

- Nueva sección "Usuarios registrados" en `admin.html`, antes de las colas
  de aprobación: una fila por usuario con su perfil (usuario/contacto),
  insignia actual, resumen de cuentas (cantidad + balance total),
  cantidad de documentos subidos, y fecha de registro.
- Alcance original (agosto 2026, primera versión): **"ver todo, editar lo
  operativo"** — la tabla era de solo lectura (perfil, insignia,
  documentos) y para editar montos/cantidades solo se podía usar la cola de
  aprobación de abajo. **Esto cambió más adelante, en la misma agosto
  2026**: a pedido explícito de Lucas, ahora sí se puede editar
  directamente el balance/equity/apalancamiento de una cuenta y las
  posiciones de cualquier usuario desde esta misma tabla, sin pasar por la
  cola de aprobación — ver sección 18.10 para el detalle completo. Sigue
  sin haber edición de datos personales (nombre, correo, teléfono) desde
  acá — eso no se pidió y queda fuera de alcance por ahora.
- `GET /api/admin/users` (`getAllUsersAdminView` en `data/store.js`) arma
  la vista combinando usuarios + cuentas (con balance/equity/leverage) +
  posiciones + documentos + insignia calculada.

### 16.3 Moneda simulada Zenith (ZNT)

- Motor propio en `data/zenithCoin.js`: no sigue el precio de ninguna
  moneda real — es una caminata aleatoria (distribución ~normal, no
  uniforme) con dos perillas que Lucas controla desde el panel de
  administrador (sección "Moneda Zenith" en `admin.html`, encima de las
  colas de aprobación):
  - **Tendencia**: subida / bajada / estable (hacia dónde se inclina el
    precio con el tiempo).
  - **Volatilidad**: baja / media / alta (qué tan bruscos son los
    movimientos vela a vela).
  - Los cambios rigen **desde ese momento en adelante** — no reescriben
    velas ya generadas.
- Precio inicial y "circulating supply" en un rango parecido al de una
  cripto real de baja capitalización (sin copiar ninguna en particular),
  para que se sienta como un activo real y no como un número inventado.
- Velas de 15 minutos, generación perezosa igual que la Comunidad Zenith
  (nada corre en segundo plano; cada consulta pone al día las velas que
  "deberían" haberse generado según el tiempo transcurrido) — arranque en
  frío simulando 48h de operación para que el gráfico no se vea vacío la
  primera vez.
- Datos que se muestran, igual que cualquier cripto real: precio, cambio
  24h, máximo/mínimo 24h, volumen 24h, capitalización de mercado.
- `GET /api/market/zenith` (snapshot) y `GET /api/market/zenith/candles`
  (velas, formato compatible con `lightweight-charts`) — ambos requieren
  sesión. `GET /api/admin/zenith-coin` / `PUT /api/admin/zenith-coin` para
  leer/cambiar la configuración (solo admin).
- **Integración en el frontend** (`dashboard.js`): tarjeta dedicada "Zenith
  ZNT" debajo del ticker de cripto (con borde dorado, distinta del resto
  del mercado para que se note que es un activo propio de la plataforma),
  con precio en vivo, variación 24h, máximo/mínimo/volumen/cap. de mercado,
  y botones Comprar/Vender/Ver gráfico. El botón "Ver gráfico" abre un
  modal con velas (`lightweight-charts`, mismo patrón que el panel de
  trading Sube/Baja).
  - ZNT reutiliza el modal genérico de comprar/vender y todo el resto de la
    plataforma (posiciones abiertas, historial, insignias) sin código
    aparte: solo hace falta que `CRYPTO_META` conozca su símbolo/nombre —
    el resto de las funciones (`openTradeModal`, `renderHoldings`, etc.) ya
    funcionan con cualquier activo con precio.
  - **Fuera de alcance por ahora**: no se integró en el panel de trading
    Sube/Baja (`trading-panel.js`) — ese archivo depende directo del
    formato de precios masivos de CoinGecko y necesitaría un caso aparte;
    queda pendiente si Lucas lo pide más adelante.

## 17. Modo claro/oscuro, logo y otros ajustes visuales — construido (agosto 2026)

- **Modo claro/oscuro**: switch en el menú de usuario del dashboard (junto
  a "Mi perfil" y "Cerrar sesión", como pidió Lucas), con paleta clara
  completa definida en `styles.css` (`:root[data-theme="light"]`) sobre el
  mismo sistema de variables que ya usaba todo el sitio — no se tocó cada
  regla una por una. El tema elegido se guarda en `localStorage` y se
  aplica en **todas** las páginas (index, dashboard, admin, comunidad,
  panel de trading) con un script chiquito al inicio de cada `<head>`, para
  que no haya parpadeo del tema anterior al cargar. Los gráficos de velas
  (ZNT y Sube/Baja) también ajustan sus colores según el tema activo.
- **Logo sin borde dorado**: el aro dorado alrededor del ícono se recoloreó
  a un gris metálico (a juego con la "Z" plateada del mismo logo) en
  `assets/img/logo.png` — es un solo archivo usado en todas las páginas, así
  que el cambio aplica en todo el sitio de una vez. El resto del ícono (la
  "Z" y la flecha dorada) no se tocó.
- **Comunidad Zenith más activa**: el promedio de tiempo entre mensajes
  nuevos bajó de 35s a 12s (`AVG_INTERVAL_SECONDS` en `data/community.js`)
  — el frontend ya consultaba cada 8s, así que ahora casi siempre hay algo
  nuevo cuando se revisa.
- **Depósitos y retiros con tono más profesional**: los modales de
  depositar/retirar ahora abren con una nota breve de confianza (revisión
  manual, plazo de 1-2 minutos hábiles, monedas/bancos aceptados) antes del
  formulario, para que se sientan como los de una empresa real y no solo
  un formulario suelto.
- No se rehízo la organización general de las páginas (secciones, orden,
  navegación) — Lucas pidió explícitamente mantener el contexto de lo ya
  construido; los ajustes de esta sección son sobre estética y tono, no
  sobre la estructura.

## 18. Navegación, bancos reales, rediseño Exness, moneda local, Insignias (página), auto-inversión real, Comunidad interactiva, footer corporativo, buzón de soporte y edición directa de admin — construido (agosto 2026)

Segunda tanda grande de features pedida por Lucas en un solo mensaje, con
4 respuestas de aclaración ya incorporadas al construir: auto-inversión
Diamante/Platino = **ejecución automática real** (no solo sugerencias);
edición directa de admin = **misma demora de 1-2 min** que el resto del
sitio; respuestas del buzón de soporte = **solo dentro de la plataforma**
(no correo real); moneda por ubicación = **conversión real con tasas de
cambio** (no solo el símbolo).

### 18.1 Navegación

- El logo (arriba a la izquierda) ahora es un link a `dashboard.html` en
  todas las páginas internas (antes era solo una imagen decorativa).
- Todas las páginas internas que no son el dashboard (`trading-panel.html`,
  `community.html`, `insignias.html`, `support.html`) tienen además una
  flecha "←" junto al chip de usuario, con el mismo destino, para que
  siempre haya una forma obvia de volver sin usar el botón "atrás" del
  navegador.
- Pantalla de acceso (`index.html`): el aviso que antes mostraba las
  credenciales de la cuenta demo se reemplazó por una invitación real a
  registrarse ("¿No tienes cuenta? Regístrate aquí"), ya que el objetivo
  final es que personas reales se registren, no que dependan de una cuenta
  de prueba compartida.

### 18.2 Depósitos: bancos reales de Argentina y Perú

- El campo "Banco" del formulario de depósito pasó de texto libre a un
  `<select>` con bancos reales agrupados por país (`<optgroup>`):
  8 bancos de Argentina (Banco Nación, Provincia de Buenos Aires, Santander
  Río, Galicia, BBVA Argentina, Macro, HSBC Argentina, Credicoop) y 8 de
  Perú (BCP, BBVA Perú, Interbank, Scotiabank Perú, Banco de la Nación,
  BanBif, Banco Pichincha, Mibanco), más una opción "Otro banco / billetera
  internacional" para cualquier otro caso. Es solo texto elegido de una
  lista — no hay integración real con ningún banco, sigue siendo el mismo
  flujo de depósito con aprobación manual de siempre.

### 18.3 Rediseño visual estilo Exness (depositar / retirar)

- Los modales de Depositar y Retirar se rediseñaron visualmente inspirados
  en el estilo de brokers como Exness — sin agregar ni quitar ningún método
  de pago real (sigue siendo transferencia bancaria para depósitos, y
  Binance/Coinbase/Trust Wallet/transferencia para retiros).
- **Depositar**: fila de "trust badges" (Acreditación en 1-2 min / Revisión
  segura / Multi-moneda), y una grilla de tarjetas de método en vez del
  `<select>` de antes — solo "Transferencia bancaria" está activa;
  Binance/Coinbase/Tarjeta se muestran como tarjetas deshabilitadas
  "Próximamente" (mismo criterio de seguridad de siempre: nunca se pide un
  número de tarjeta real sin un procesador de pago detrás).
- **Retirar**: el `<select>` de método se reemplazó por la misma grilla de
  tarjetas (Binance / Coinbase / Trust Wallet / Transferencia bancaria,
  las 4 ya existentes, ahora seleccionables como tarjetas en vez de opciones
  de lista) más su propia fila de trust badges.
- Ningún contrato del backend cambió — mismos campos, mismos endpoints,
  misma cola de aprobación manual con demora de 1-2 min.

### 18.4 Moneda local del cliente (detección + conversión real)

- **Backend** (`data/currency.js` + `routes/currency.js`, sin
  autenticación): `GET /api/currency/detect` ubica el país del visitante
  por IP (usa `x-forwarded-for`/`req.ip`, se salta IPs privadas/locales) y
  devuelve una moneda sugerida; `GET /api/currency/rates` trae tasas de
  cambio reales contra USD (fuente pública, sin API key) con una caché de 1
  hora y una tabla de respaldo fija (`FALLBACK_RATES`) para cuando no hay
  salida a internet — en el sandbox de desarrollo no hay acceso a APIs
  externas, así que siempre se ve el respaldo ahí; en Render (con salida a
  internet real) debería traer tasas en vivo.
- **Frontend** (`assets/js/currency.js`, módulo `Currency`): el usuario
  elige su moneda preferida desde un selector nuevo en el menú de usuario
  (ARS, PEN, COP, MXN, CLP, EUR, BRL además de USD) — se detecta
  automáticamente la primera vez y después queda guardada en el navegador.
- **Dónde se usa**: **solo** en los formularios de Depositar/Retirar (el
  monto se muestra y se escribe en la moneda elegida, y se convierte a USD
  justo antes de mandarlo al backend) y en las tablas de historial de
  depósitos/retiros. **A propósito no se aplica** a los balances/holdings
  de las cuentas (que ya tienen su propio campo `currency` para
  USD/EUR/USDT) ni a ningún otro número de la plataforma — evita el riesgo
  de una doble conversión o un balance que "no cuadra" con lo que el
  usuario recuerda haber depositado. Todo el cálculo interno (balances,
  holdings, depósitos, retiros) sigue guardándose en USD; la conversión es
  puramente de visualización/entrada en esos dos formularios.

### 18.5 Insignias Zenith — página propia (`insignias.html`)

- Página nueva, accesible desde un banner destacado en el dashboard y desde
  el footer, que presenta el programa de rangos completo (mismos 5 niveles
  y umbrales de la sección 15.1: Bronce $250 / Plata $800 / Oro $1.500 /
  Diamante $5.000 / Platino $10.000+) con una narrativa más inspiradora:
  tarjeta de "tu rango actual" con barra de progreso hacia el siguiente
  nivel, y una grilla de 5 tarjetas (una por rango) con una lista de
  privilegios por nivel — desde "acceso completo al panel de trading" en
  Bronce hasta "automatización de inversión con ajustes en tiempo real" en
  Platino. Los privilegios de Diamante/Platino ya son reales (ver 18.6 y
  15.3), los del resto son beneficios de producto (prioridad de revisión,
  reportes de IA más detallados, etc.) pensados para dar una razón concreta
  de subir de nivel.
- No agrega ningún endpoint nuevo — reutiliza el mismo cálculo de insignia
  del dashboard (`RANK_TIERS`/`getRankForAmount`).

### 18.6 Auto-inversión real (Diamante y Platino)

- A diferencia de la Asesoría IA (sección 15.3, que **solo sugiere** en
  texto), esta es **ejecución automática real** — a pedido explícito de
  Lucas. Cada usuario con insignia Diamante o Platino puede activar/
  desactivar la automatización desde un switch en la sección "Asesoría IA"
  del dashboard (`GET`/`PUT /api/ai/auto-invest`, activada por defecto).
- **Alcance importante, ya conversado**: el motor solo opera el activo
  propio **Zenith (ZNT)** — no criptomonedas reales. Motivo técnico: los
  precios de BTC/ETH/etc. los trae cada navegador directo de CoinGecko, sin
  pasar nunca por el backend, así que el servidor no tiene ninguna fuente
  de precio propia y confiable para operarlas por su cuenta. ZNT sí tiene
  precio autoritativo en el servidor (`data/zenithCoin.js`), así que es el
  único activo donde una decisión automática del backend tiene sentido.
- Motor (`runAutoInvestIfDue` en `data/store.js`, revisado en cada request
  igual que el resto de la generación perezosa del proyecto, cada 12
  minutos por usuario): sigue la variación 24h de ZNT — si viene subiendo
  más de 0.2%, arma una compra de hasta 5% del balance de la cuenta con más
  saldo del usuario (mínimo $10); si viene bajando más de 0.2%, arma una
  venta de hasta 5% de lo que ya tiene en ZNT. Nunca ejecuta una operación
  de golpe: la crea con `source: 'auto'` y entra a la **misma cola de
  aprobación de administrador** que cualquier compra/venta manual (misma
  demora de 1-2 min) — Lucas conserva el control final sobre todo lo que
  mueve saldo, tal cual el resto de la plataforma. El panel de
  administrador marca estas operaciones con una etiqueta "🤖 Automática"
  para diferenciarlas de las manuales.

### 18.7 Comunidad Zenith interactiva (chat de dos vías)

- Hasta ahora la Comunidad Zenith (sección 15.2) era un feed de solo
  lectura. Ahora el usuario puede escribir sus propios mensajes
  (`POST /api/community/messages`, hasta 500 caracteres) y aparecen de
  inmediato en el feed, marcados visualmente como propios.
- Cada mensaje de un usuario real recibe una respuesta simulada de uno de
  los 10 clientes ficticios, con una demora aleatoria de 15 a 70 segundos
  (se siente como que alguien está escribiendo, no una respuesta
  instantánea de robot) — misma arquitectura perezosa de siempre
  (`communityPendingReplies` en la base de datos, resuelto en cada consulta
  al feed, sin ningún proceso corriendo en segundo plano). Si el mensaje
  del usuario menciona un activo conocido (BTC, ETH, SOL, etc.), hay 60% de
  probabilidad de que la respuesta lo mencione también, para que se sienta
  relevante a lo que se escribió.
- Sigue siendo, como siempre, una comunidad simulada — el aviso permanente
  al pie de página se actualizó para aclarar que los mensajes propios del
  usuario sí son reales, pero las respuestas y el resto de los
  participantes no lo son.

### 18.8 Footer corporativo con enlaces reales

- Se agregó un footer (`site-footer`) a todas las páginas internas
  (dashboard, panel de trading, comunidad, insignias, soporte) con 4
  columnas: **Tecnología** (qué es blockchain / qué es Ethereum, enlaces a
  Investopedia y ethereum.org), **Mercado y noticias** (CoinDesk, Reuters
  Markets, Bloomberg Markets, Investor.gov/SEC), **Producto** (enlaces
  internos: Dashboard, Panel de Trading, Comunidad, Insignias) y
  **Contacto** (enlace al nuevo buzón de soporte, sección 18.9).
- A propósito **no** se inventaron nombres de empresas "partner" ficticias
  (para no insinuar una relación comercial real con nadie) — en su lugar,
  todos los enlaces externos son a contenido educativo/informativo genuino
  y ya público (noticias, definiciones, el sitio oficial de la SEC para
  inversionistas), abriendo en pestaña nueva.

### 18.9 Buzón de quejas y peticiones (soporte, con NIT)

- Página nueva `support.html` (accesible desde el footer y el menú de
  navegación): el usuario escribe una queja/petición/duda y recibe de
  inmediato un número de referencia tipo NIT (6 dígitos,
  `generateNit`/`createTicket` en `data/support.js`) para poder seguirla.
- **A pedido explícito de Lucas: las respuestas son solo dentro de la
  plataforma, nunca por correo real.** El panel de administrador tiene una
  sección nueva "Buzón de soporte" (`GET`/`PUT /api/admin/support/:id/reply`)
  donde Lucas ve todas las peticiones de todos los usuarios (abiertas
  primero) y responde con texto libre — la respuesta se ve del lado del
  cliente de inmediato la próxima vez que carga su historial (no pasa por
  la demora de 1-2 min: esto no mueve saldo ni cantidades, es solo un
  mensaje). El historial del usuario muestra cada petición con su NIT,
  estado ("En proceso" / "Respondido") y la respuesta una vez que existe.

### 18.10 Edición directa de usuarios desde el panel de administrador

- Hasta ahora "Usuarios registrados" (sección 16.2) era una tabla de solo
  lectura — Lucas solo podía editar montos a través de la cola de
  aprobación de solicitudes que el cliente ya había pedido. A pedido
  explícito de Lucas, ahora puede editar directamente el balance, equity y
  apalancamiento de cualquier cuenta, y crear, editar o eliminar
  posiciones (holdings) de cualquier usuario, sin que el cliente tenga que
  pedir nada primero — con el botón "Editar" en cada fila de la tabla, que
  despliega un panel con esas cuentas y posiciones.
- **Misma demora de 1-2 minutos que el resto del sitio** (confirmado con
  Lucas): el cambio no se aplica al instante, queda agendado
  (`pendingAdminEdit` en `data/store.js` — mismo patrón que
  `pendingAction`/`pendingPayload` de depósitos/retiros/operaciones, con
  otro nombre para no confundirlo con "aprobar/rechazar una solicitud") y
  se aplica solo cuando se cumple el plazo (`runDueAdminActions`, mismo
  mecanismo perezoso de siempre). Mientras está pendiente, el cliente sigue
  viendo el valor anterior — y el propio panel de administrador se lo deja
  claro a Lucas con una nota "⏳ Cambio pendiente… aplica ~HH:MM" en vez de
  dejarlo editar de nuevo encima.
- Crear una posición nueva desde acá funciona igual: la posición existe
  internamente desde el momento en que se crea, pero queda invisible para
  el usuario (`getHoldingsByUser` la filtra) hasta que se aplica de verdad
  — así nunca aparece "de la nada" con cantidad 0 mientras espera su turno.
- Endpoints nuevos, todos protegidos por `requireAdmin` (mismo código de
  administrador de siempre): `PUT /api/admin/accounts/:id/edit`,
  `POST /api/admin/holdings`, `PUT /api/admin/holdings/:id/edit`,
  `DELETE /api/admin/holdings/:id`. `GET /api/admin/users` ahora también
  incluye `equity`/`leverage` por cuenta y la lista de posiciones de cada
  usuario (antes solo traía `balance`), necesario para poder editarlos.

## 19. Footer profesional con sección de seguridad, sincronización balance→equity y navegación con el logo desde cualquier panel (agosto 2026)

- **Footer institucional**: en `dashboard.html`, `trading-panel.html`,
  `community.html`, `insignias.html` y `support.html` (las 5 páginas que
  comparten el mismo footer) se reescribió el texto de la marca y la línea
  legal inferior para sonar como una plataforma financiera profesional en
  vez de repetir literalmente "plataforma de práctica" — sin dejar de
  aclarar en ningún momento que **es un simulador y ninguna cifra es
  dinero real** (ese punto es no negociable, ver "Restricciones de
  seguridad" más abajo). Se agregó una sexta columna "Seguridad" con
  contenido real (no inventado): aviso de conexión cifrada, aviso de que
  todo depósito/retiro/operación pasa por revisión manual antes de
  aplicarse, aviso de que el panel de administrador tiene acceso
  independiente y protegido, y un enlace real a la página de la SEC sobre
  cómo protegerse de fraudes de inversión
  (`investor.gov/protect-your-investments`). El grid del footer pasó de 4
  a 5 columnas de contenido (`--site-footer-grid` en `styles.css`) para
  darle espacio a la columna nueva. No se tocó el modal de Términos y
  Condiciones de `index.html` (sigue siendo la divulgación legal completa)
  ni el aviso de "clientes simulados" de `community.html`.
- **Sincronización balance → equity al editar desde el panel de admin**:
  antes, si Lucas editaba solo el Balance de una cuenta desde "Editar" en
  el panel de administrador, el Equity se quedaba con su valor viejo — y
  como el dashboard del cliente calcula el "Equity total" y el P/L
  flotante directamente del campo `equity` guardado (no lo recalcula desde
  las posiciones), esto hacía que el balance y el equity mostraran cifras
  inconsistentes hasta que alguien editara el equity aparte. Ahora, en
  `requestAccountEdit` (`data/store.js`): si Lucas edita el Balance y NO
  escribe explícitamente un Equity distinto en el mismo formulario, el
  Equity se ajusta automáticamente al mismo valor del Balance nuevo (sin
  ganancia/pérdida flotante). Si Lucas sí quiere dejar una ganancia/pérdida
  flotante simulada, simplemente escribe un Equity distinto en su propio
  campo — eso se respeta tal cual. El cambio sigue el mismo mecanismo de
  demora de 1-2 minutos de siempre (`pendingAdminEdit` / `applyAt`); el
  cliente ve el balance y el equity nuevos al mismo tiempo, ya
  consistentes, cuando se aplica el cambio.
  - En el formulario de edición del panel de administrador
    (`assets/js/admin.js`) se agregó el mismo comportamiento en vivo del
    lado del navegador: mientras Lucas escribe en el campo Balance, el
    campo Equity se actualiza solo con el mismo valor — hasta que Lucas
    toca el campo Equity directamente (lo escribe él mismo), momento en el
    que deja de seguir al Balance para esa edición. Un texto de ayuda bajo
    los campos explica esto ("💡 Si solo escribes el Balance, el Equity se
    ajusta solo al mismo valor...").
  - El cálculo de insignia/rango (Diamante/Platino, ver sección 17) ya se
    recalculaba en vivo desde el balance actual de las cuentas en cada
    carga — no necesitó ningún cambio, sigue actualizándose solo.
- **Volver tocando el logo desde cualquier panel**: el logo "Zenith
  Capital" de la barra superior (`.brand`) de `dashboard.html` y
  `admin.html` ahora es un enlace real (antes era un simple `<div>`
  decorativo) — en `dashboard.html` vuelve a `dashboard.html` y en
  `admin.html` vuelve a `admin.html`. Las demás páginas
  (`trading-panel.html`, `community.html`, `insignias.html`,
  `support.html`) ya tenían el logo como enlace de vuelta al dashboard
  desde la tanda anterior (sección 18), así que con esto el logo funciona
  como botón de "inicio" en absolutamente todas las páginas del sitio.

## 20. Base de datos permanente en MongoDB Atlas y correos reales al registrarse (agosto 2026)

- **El problema que se arregló**: en Render (donde vive el sitio en línea),
  el plan gratis de los servicios web **no guarda archivos de forma
  permanente** — cada vez que el servicio se reinicia (algo que pasa solo,
  después de 15 minutos sin visitas, o cada vez que se sube una
  actualización), el disco vuelve a su estado original. Como toda la base
  de datos vivía en un archivo (`data/data.json`) dentro de ese disco, esto
  hacía que las cuentas nuevas "desaparecieran" del panel de administrador
  con el tiempo, y que alguien que se registró y volvió días después ya no
  pudiera iniciar sesión — su cuenta ya no existía en el servidor. No era
  un error del código: era que el archivo donde vivían los datos no
  sobrevivía a los reinicios de ese plan gratis.
- **La solución**: los datos ahora se guardan en MongoDB Atlas, un
  servicio de base de datos en internet aparte de Render, con un plan
  gratis para siempre (no como el Postgres gratis de Render, que borra la
  base de datos a los 30 días). Como es un servidor totalmente aparte, no
  le afecta que el backend se reinicie — los datos quedan ahí para
  siempre, sin importar cuántas veces Render duerma o reinicie el
  servicio.
  - `data/db.js` se reescribió para conectarse a MongoDB en vez de leer/
    escribir el archivo local. Para no tener que tocar el resto del
    código (todas las funciones de `data/store.js`, `data/support.js`,
    `data/community.js`, `data/zenithCoin.js` y todas las rutas siguen
    llamando `load()`/`save()` exactamente igual que siempre, de forma
    instantánea), este archivo mantiene una copia de todos los datos en
    memoria que se llena una sola vez al arrancar el servidor
    (`connect()`, llamado desde `server.js` antes de aceptar cualquier
    pedido) y que se manda a MongoDB en segundo plano cada vez que algo
    cambia — sin hacer esperar al usuario.
  - Los PDFs que suben los usuarios (perfil > Documentos) también vivían
    como archivos sueltos en el disco del servidor con el mismo problema
    — ahora se guardan igual, dentro de MongoDB (`data/files.js`), así que
    tampoco se pierden con un reinicio.
  - Nueva variable de entorno **obligatoria**: `MONGODB_URI` (la dirección
    de conexión a tu clúster gratuito de MongoDB Atlas) — sin ella, el
    servidor no arranca y lo explica claramente en los logs, en vez de
    fallar de forma confusa en el primer pedido que llegue. Ver
    `.env.example` para el formato exacto y cómo conseguirla.
- **Solo correos reales al registrarse**: antes, el registro solo
  comprobaba que el correo tuviera la forma básica de un correo (algo@algo
  .algo) — aceptaba direcciones inventadas como `asdf@asdf123.com` sin
  problema. Ahora, además de esa validación de formato, se comprueba que
  el DOMINIO del correo exista de verdad en internet y esté configurado
  para recibir correo (usando el propio sistema de nombres de dominio,
  DNS — gratis, sin necesidad de crear ninguna cuenta ni pagar ningún
  servicio). Esto rechaza dominios inventados; no llega a confirmar que la
  bandeja de entrada específica exista (para eso haría falta mandar un
  correo real de confirmación, lo cual sí requeriría contratar un servicio
  externo de envío de correos — quedó fuera de esta tanda a propósito para
  no sumar una cuenta/costo externo más).

## 21. Inicio de sesión con usuario o correo, correos duplicados, sesión más larga y buscador de cuentas en el admin (agosto 2026)

- **Inicio de sesión con usuario O correo**: antes solo se podía escribir el
  nombre de usuario. Ahora `POST /api/auth/login` acepta cualquiera de los
  dos — `findUserByUsernameOrEmail` (`data/store.js`) prueba ambos. La
  comparación del correo ignora mayúsculas/minúsculas.
- **Correos duplicados bloqueados al registrarse**: como ahora se puede
  entrar por correo, dos cuentas con el mismo correo generarían ambigüedad
  sobre cuál de las dos abre. `POST /api/auth/register` ahora también
  revisa `findUserByEmail` (antes solo revisaba el nombre de usuario) y
  responde 409 si el correo ya está en uso.
- **Mensajes de error distintos en login**: antes cualquier error devolvía
  el mismo "Credenciales inválidas". Ahora, si la cuenta no existe,
  responde 404 con un mensaje que invita a revisar los datos o registrarse;
  si la cuenta existe pero la contraseña está mal, responde 401 con "La
  contraseña no es correcta". (Nota: en un sitio con usuarios reales esto
  se evita a propósito, porque permite a alguien probar qué correos están
  registrados — para este proyecto de práctica, sin datos sensibles reales
  de por medio, Lucas prefirió la claridad.)
- **Sesión de 30 días en vez de 2 horas**: el JWT de login ahora expira en
  `30d` en vez de `2h` (`routes/auth.js`). Esto resuelve un bug real: antes,
  cuando el token vencía a las 2 horas, la persona se quedaba viendo el
  dashboard como si nada (la sesión ya estaba cerrada de fondo, sin
  avisarle), y la siguiente acción que intentara —por ejemplo, cambiar la
  contraseña— fallaba con un error de token que no tenía nada que ver con
  lo que estaba haciendo. Con una sesión mucho más larga, esto casi no
  vuelve a pasar.
- **Aviso claro cuando la sesión sí vence**: por si acaso vence o el token
  queda inválido por otra razón, `assets/js/api.js` ahora detecta la
  respuesta 401 de cualquier pedido autenticado, cierra la sesión local Y
  manda de vuelta a `index.html`, donde `assets/js/auth.js` muestra "Tu
  sesión anterior expiró — inicia sesión de nuevo" (vía `sessionStorage`,
  una bandera de un solo uso). Antes solo se cerraba la sesión sin avisar
  ni redirigir, dejando a la persona parada en una pantalla ya "muerta".
- **Buscador en "Usuarios registrados" (panel de admin)**: una caja de
  búsqueda arriba de la tabla (`admin.html`) filtra en vivo por usuario,
  correo, nombre o celular (`assets/js/admin.js#matchesUserSearch`) — sin
  pedirle nada nuevo al servidor, solo filtra lo que ya se cargó. Muestra
  un contador "X de Y" mientras hay una búsqueda activa, y un mensaje de
  "ninguna cuenta coincide" si no encuentra nada. La lista completa
  (`usersCache`) nunca se pierde: el filtro es solo visual, así que el
  refresco automático de cada 15 segundos sigue trayendo a todos.
- **Términos y condiciones reescritos**: la sección de `index.html` ahora
  explica qué es el trading y cómo funcionan los mercados reales (oferta y
  demanda, noticias, bancos centrales), y enmarca la responsabilidad de la
  persona sobre sus decisiones dentro de la plataforma — con un tono
  serio, de plataforma real, en vez de sonar a "proyecto de práctica". Se
  mantiene, en un solo punto de la lista (no repetido), que es un entorno
  educativo de simulación y ninguna cifra es dinero real — ese punto es
  la única línea roja que no se negoció en esta reescritura (ver
  "Restricciones de seguridad" más abajo).

## 22. Panel de trading "épico" al estilo Exness: velas en vivo, más plazos, tipos de gráfico e indicadores técnicos (agosto 2026)

- **La vela más reciente ahora se mueve en vivo**: antes el gráfico solo se
  refrescaba entero cada 60 segundos (parecía "saltar"). Ahora, cada vez que
  llega un precio nuevo (cada 5 segundos, `pollPrices()`), la última vela se
  actualiza al instante con `series.update()` — sube el máximo, baja el
  mínimo y mueve el cierre con el precio real — y cuando pasa el tiempo
  completo de una vela (según el plazo elegido) se abre una vela nueva
  automáticamente (`updateLiveCandle()` en `trading-panel.js`). No es una
  animación ni una simulación aleatoria: se mueve exactamente con el mismo
  precio en vivo que ya se usaba para abrir/cerrar operaciones.
- **Cinco plazos para estudiar el mismo activo** (`TIMEFRAME_CONFIG`): 1D,
  7D, 1M, 3M y 1A, seleccionables desde una barra de pestañas sobre el
  gráfico. Cada plazo trae velas de un tamaño distinto directamente de
  CoinGecko (más cortas en 1D, más largas en 1A) — nada se inventa, todo
  sigue siendo histórico real. El tamaño real de cada vela se detecta solo
  (mediana del espacio entre velas recibidas) para saber cuándo debe abrirse
  una vela nueva en vivo en ese plazo.
- **Tres formas de ver el mismo precio**: Velas, Línea y Área
  (`CHART_TYPES`), intercambiables sin perder los datos ya cargados
  (`setChartType()`).
- **Cuatro herramientas de análisis, activables por separado**:
  - *Medias móviles*: dos líneas (9 y 21 periodos) calculadas en el
    navegador (`computeSMA()`), sin librería externa de indicadores.
  - *Bandas de Bollinger*: banda superior/inferior a partir de la media y
    la desviación estándar de 20 periodos (`computeBollinger()`).
  - *Volumen*: histograma real de CoinGecko (`/market_chart` →
    `total_volumes`), emparejado con cada vela por rango de tiempo, mostrado
    como capa inferior superpuesta al precio.
  - *RSI (14)*: fuerza relativa calculada con el suavizado de Wilder
    (`computeRSI()`, el estándar de la industria), en un sub-gráfico propio
    debajo del principal (`#panel-rsi-container`) con líneas de referencia
    en 70/30, cuyo desplazamiento y zoom quedan sincronizados con el
    gráfico principal (`subscribeVisibleLogicalRangeChange`).
- **Barra de Apertura/Máximo/Mínimo/Cierre/Volumen** encima del gráfico:
  muestra los datos de la vela sobre la que está el mouse, o los de la vela
  más reciente cuando no se está pasando el mouse por el gráfico.
- **Pantalla completa**: un botón (⛶) expande el gráfico (con su barra de
  herramientas, barra OHLC y RSI) a toda la pantalla — útil para estudiar
  movimientos con más detalle, como en una plataforma real. Se puede salir
  también con la tecla Escape.
- **Insignia de cambio (24h) en cada pestaña de activo**: un porcentaje
  pequeño bajo cada símbolo (BTC, ETH, etc.) en rojo o verde, para comparar
  de un vistazo cuál activo se está moviendo más sin tener que entrar a
  cada uno — igual que una lista de seguimiento ("watchlist") real.
- Los precios en vivo se piden cada 5 segundos en vez de cada 15 (antes
  reservado a otras pantallas), para que el movimiento de la vela en vivo
  se sienta más fluido.

## 23. Cierre de una brecha de seguridad (balance auto-asignable), lista de instrumentos estilo Exness, y metales reales en el panel de trading (agosto 2026)

- **Brecha cerrada: un usuario ya no puede asignarse su propio balance.**
  Se descubrió que el formulario "Nueva cuenta" / "Editar cuenta" del
  dashboard (visible para cualquier usuario logueado, no solo para Lucas)
  tenía campos de Balance y Equity editables que se guardaban tal cual —
  es decir, cualquier persona podía crear o editar una cuenta y escribir
  el saldo que quisiera, sin pasar por depósito ni aprobación. Esto se
  corrigió en dos capas:
  - **Backend** (`routes/accounts.js`): `POST /api/accounts` ahora crea
    toda cuenta nueva con `balance: 0, equity: 0` sin importar qué mande
    el cliente, y `PUT /api/accounts/:id` (la ruta de autoservicio del
    usuario) ya ni siquiera lee esos campos del body — se probó a mano
    mandando `balance: 999999` directamente a la API (sin pasar por el
    formulario) y quedó confirmado que no tiene ningún efecto.
  - **Frontend** (`dashboard.html`/`dashboard.js`): los campos Balance y
    Equity del formulario ahora son de solo lectura (muestran "Se asigna
    al confirmar tu depósito" en una cuenta nueva, o el valor actual en
    una cuenta existente), con una nota explicando que solo el equipo de
    Zenith Capital puede asignar o cambiar el saldo real, desde el panel
    de administrador (`PUT /api/admin/accounts/:id/edit`, sin tocar).
  - El usuario sigue pudiendo crear su propia cuenta (número, tipo, moneda,
    apalancamiento) y usar el resto de la plataforma con ella — solo el
    saldo queda fuera de su alcance hasta que se le asigne manualmente.
- **Mensaje correcto en el panel de trading cuando el saldo es $0**: antes,
  el único aviso disponible era "Todavía no tienes ninguna cuenta" (pensado
  para cuando de verdad no existe ninguna). Como ahora toda cuenta nueva
  empieza en $0, se agregó un segundo aviso, distinto, para cuando la
  cuenta sí existe pero todavía no tiene saldo: "No tienes saldo disponible
  en esta cuenta todavía. Cuando el equipo de Zenith Capital confirme tu
  depósito, tu saldo aparecerá aquí..." — con el monto, la duración y los
  botones Compra/Vende deshabilitados en ambos casos, para no dejar
  intentar operar sin poder. Cambiar de cuenta en el selector reevalúa
  cuál de los dos avisos (o ninguno) corresponde mostrar.
- **Lista de instrumentos con buscador y categorías (estilo Exness)**:
  las pestañas simples de activos se reemplazaron por un panel lateral
  igual al de una plataforma de trading real — buscador de texto,
  pestañas de categoría (Todos / Cripto / Metales) y una lista con ícono,
  símbolo, nombre, precio en vivo y variación 24h por fila, con la fila
  del activo seleccionado resaltada. El encabezado del gráfico ahora
  muestra el nombre y símbolo del activo activo en vez de repetir la
  lista completa de pestañas.
- **Lista de criptomonedas mucho más amplia**: de 13 a 37 criptomonedas
  reales y conocidas (Bitcoin, Ethereum, Solana, XRP, Cardano, Polygon,
  TON, Uniswap, Arbitrum, Optimism, Aptos, Sui, Pepe, Bonk, y más — todas
  con precio real de CoinGecko), organizadas para poder encontrarlas por
  buscador o categoría en vez de una fila interminable de pestañas.
- **Metales reales (Oro, Plata, Platino, Paladio, Cobre)**, vía
  [gold-api.com](https://gold-api.com) — una API gratuita, sin llave y sin
  límite de peticiones para precio en vivo. Como esta API no ofrece
  historial gratuito de velas (a diferencia de CoinGecko para
  criptomonedas), el gráfico de un metal se construye 100% en vivo, vela
  por vela, desde el momento en que se abre por primera vez, y sigue
  acumulando mientras la pestaña esté abierta (el progreso no se pierde
  al cambiar de activo y volver, dentro de la misma sesión). Por esto
  mismo, al seleccionar un metal: los botones de plazo (1D/7D/1M/3M/1A) se
  deshabilitan (no hay historial distinto que traer para cada uno), el
  indicador de Volumen se deshabilita (gold-api.com no da ese dato), y la
  nota bajo el gráfico lo explica con todas las letras. El precio de
  entrada/salida de cada operación con un metal sí es 100% real y en vivo,
  igual que con criptomonedas — nada de esto afecta la validez de las
  operaciones, solo la profundidad del historial visual del gráfico.

## 24. Corrección: el cambio de activo se demoraba o mostraba datos a medias (agosto 2026)

- **Reporte del usuario**: al entrar al panel de trading y cambiar de un
  activo a otro (por ejemplo de Bitcoin a Ethereum) varias veces seguidas,
  el gráfico tardaba bastante en mostrar el que correspondía, o se quedaba
  "a medias" — mostrando por momentos datos que no eran del activo
  seleccionado.
- **Causa real (no solo percepción)**: cada vez que se elegía un activo se
  lanzaba una petición nueva a CoinGecko para traer su historial. Si el
  usuario cambiaba de activo otra vez antes de que la petición anterior
  terminara, ambas respuestas podían llegar en cualquier orden — y la más
  vieja, si llegaba después, terminaba pisando en el gráfico a la más
  nueva. A eso se sumaba que no había ningún aviso visual de "cargando",
  así que la demora se sentía como si la página se hubiera trabado.
- **Corrección aplicada** (`assets/js/trading-panel.js`):
  - **Control de peticiones por turno** (`chartLoadToken`): cada vez que se
    pide un historial nuevo se marca con un número que sube uno por uno.
    Cuando la respuesta llega, se compara ese número con el más reciente;
    si ya no es el más reciente (o sea, el usuario ya cambió de activo de
    nuevo mientras tanto), esa respuesta vieja se descarta sin tocar el
    gráfico. Así, sin importar el orden en que lleguen las respuestas de
    la red, en pantalla siempre termina el activo que el usuario pidió al
    final.
  - **Memoria por activo y plazo** (`cryptoCandleCache`): la primera vez
    que se abre un activo con un plazo (por ejemplo "Bitcoin, 1D") su
    historial se guarda en memoria. Si el usuario vuelve a ese mismo
    activo y plazo más tarde en la misma sesión, el gráfico aparece de
    inmediato con lo guardado, mientras por detrás se pide una versión
    actualizada que reemplaza el dibujo sin que el usuario tenga que
    esperar viendo la pantalla en blanco.
  - **Aviso de "Actualizando gráfico…"**: cuando de verdad hay que esperar
    una petición nueva (primera vez que se abre ese activo/plazo), ahora
    aparece un aviso claro con un ícono girando sobre el gráfico, en vez
    de dejar la pantalla como si estuviera trabada.
- **Verificación**: se probó de forma automatizada simulando una conexión
  lenta (1.5 segundos de demora artificial) y haciendo clic muy rápido
  entre varios activos seguidos, repetidas veces — el gráfico final
  siempre correspondió al último activo elegido, sin mezclas de datos ni
  errores en consola, y el aviso de carga apareció y desapareció en el
  momento correcto.

## 25. Segunda corrección, más profunda, sobre el mismo bug de cambio de activo (agosto 2026)

- **Reporte del usuario**: después de subir la corrección de la sección 24,
  el usuario mandó una captura de pantalla real del panel de trading
  mostrando algo mucho más raro que una simple demora: el gráfico de
  Bitcoin aparecía con velas de una escala de precio que no correspondía a
  Bitcoin (entre 20.000 y 90.000, con una sola vela gigante), la barra de
  Apertura/Máximo/Mínimo/Cierre debajo del gráfico mostraba números de otro
  activo por completo (alrededor de 690-700, ni remotamente el precio real
  de Bitcoin), y el precio "en vivo" a la derecha sí mostraba el número
  correcto de Bitcoin. Tres partes de la misma pantalla mostrando tres
  activos distintos a la vez — la corrección de la sección 24 (que resolvía
  el problema de "una respuesta vieja de la red pisando a una más nueva")
  no alcanzaba a explicar ni a arreglar esto.
- **Causa real, encontrada revisando el código a fondo**: el precio en vivo
  de todos los activos se sigue actualizando cada 5 segundos aunque el
  usuario esté viendo otro — es lo que permite que la lista de la izquierda
  siempre muestre precios frescos. El problema estaba en que, al cambiar de
  activo, la variable que guarda "las velas que se están mostrando en este
  momento" no se vaciaba de inmediato: seguía apuntando literalmente al
  mismo historial guardado del activo anterior. Si esos 5 segundos del
  precio en vivo caían justo mientras el historial del activo nuevo todavía
  no había llegado (algo muy fácil que pase cambiando de activo rápido, o
  simplemente por una CoinGecko algo lenta), el código tomaba el precio en
  vivo del activo NUEVO y lo mezclaba directamente en la última vela
  guardada del activo VIEJO — estirando su rango de precio hacia arriba o
  hacia abajo con un número que no le pertenecía, y a veces corrompiendo
  para siempre el historial guardado de ese activo viejo (no solo lo que se
  veía en pantalla en ese momento). Repetir el cambio de activo varias
  veces seguidas (como describió el usuario: "cuando intento cambiar de
  opciones") iba empeorando la mezcla cada vez más, hasta terminar en algo
  tan extraño como lo que se ve en la captura.
- **Corrección aplicada** (`assets/js/trading-panel.js`, `trading-panel.html`,
  `styles.css`):
  - **Se limpia todo de inmediato al cambiar de activo o de plazo**, antes
    de pedir el historial nuevo — no después. Se vacían las velas en
    memoria, el dibujo del gráfico, el volumen, los indicadores (medias
    móviles, bandas de Bollinger, RSI) y la barra de Apertura/Máximo/
    Mínimo/Cierre (que ahora muestra "—" mientras tanto, en vez de dejar el
    número del activo anterior). Como resultado, el "tick" de precio en
    vivo ya no tiene ninguna vela vieja disponible a la cual pegarle el
    precio del activo nuevo por error — literalmente no hay nada que
    contaminar durante esa espera.
  - **Reintento automático si falla la conexión**: antes, si el pedido del
    historial fallaba (una CoinGecko caída, sin internet un instante, etc.)
    el error se ignoraba en silencio y el gráfico se quedaba en el último
    estado que tuviera, sin ningún aviso — justo el tipo de situación que
    podía verse como "datos raros para siempre". Ahora se reintenta
    automáticamente hasta 2 veces más (3 intentos en total) antes de darse
    por vencido.
  - **Aviso claro si de plano no se pudo cargar**: si los 3 intentos
    fallan, aparece un mensaje explícito sobre el gráfico ("No se pudo
    cargar el historial de este activo. Revisa tu conexión e intenta de
    nuevo.") con un botón "Reintentar" — nunca se deja el gráfico en un
    estado confuso o con datos de otro activo sin explicación. El precio en
    vivo y la posibilidad de comprar/vender siguen funcionando igual de
    bien mientras tanto, porque no dependen del historial del gráfico.
- **Verificación**: se reprodujo el bug exacto de la captura de forma
  automatizada (cambiando de activo mientras el historial todavía estaba
  en camino, y encadenando varios cambios seguidos con precios en vivo
  intercalados de por medio, igual que describió el usuario) confirmando
  primero que SÍ se reproducía con el código de antes de esta corrección, y
  luego que con la corrección aplicada el gráfico, la barra OHLC y el
  precio en vivo siempre terminan mostrando el mismo activo y la misma
  escala de precio, sin excepción. También se probó forzando fallas de red
  repetidas para confirmar que el aviso de error y el botón de Reintentar
  funcionan como se espera.

## 26. Metales que "cargaban como con error", y las cuentas se convierten en Billeteras (agosto 2026)

- **Reporte del usuario**: al intentar ver el gráfico de un metal (Oro,
  Plata, Platino, Paladio o Cobre) en el panel de trading, la pantalla se
  veía como si algo hubiera fallado.
- **Causa real**: a diferencia de las criptomonedas, los metales no tienen
  ningún historial gratuito disponible (ver sección 23) — su gráfico se
  construye 100% en vivo, vela por vela, desde el momento en que se abren.
  Si gold-api.com (la API gratuita que da el precio real de los metales)
  tardaba en responder, fallaba, o el navegador no lograba conectarse por
  cualquier motivo, antes no había NINGÚN aviso de esto: el gráfico se
  quedaba completamente en blanco, con la barra de datos en "—" y sin
  ninguna explicación — exactamente el tipo de pantalla que cualquiera
  interpretaría como "esto está roto", aunque en realidad la plataforma
  seguía funcionando bien y solo estaba esperando (o fallando en silencio)
  una respuesta de una API externa.
- **Corrección aplicada** (`assets/js/trading-panel.js`, `trading-panel.html`):
  - Al elegir un metal por primera vez en la sesión, ahora aparece un aviso
    claro de "Conectando con el precio en vivo…" (el mismo estilo que ya se
    usa para criptomonedas) en vez de una pantalla en blanco sin
    explicación — esto se resuelve solo, normalmente en unos segundos.
  - Si gold-api.com falla varias veces seguidas (unos 15 segundos de
    fallas continuas) sin lograr conectar ni una sola vez, ahora aparece un
    mensaje explícito ("No se pudo conectar con el precio en vivo de este
    metal. Revisa tu conexión e intenta de nuevo.") con un botón
    "Reintentar" que pide el precio otra vez al instante, en vez de esperar
    en silencio hasta el siguiente ciclo de 5 segundos.
  - Se verificó de forma automatizada forzando fallas repetidas de
    gold-api.com para un metal que nunca había cargado en la sesión,
    confirmando que aparece el aviso correcto (y no una pantalla en blanco
    sin explicación), y que el botón Reintentar recupera el gráfico en
    cuanto la conexión vuelve a funcionar.

- **De "Cuenta" a "Billetera"**: a pedido del usuario, quien encontraba
  confuso el botón "Nueva cuenta", todo el flujo de creación y edición de
  cuentas de trading se rediseñó como una **billetera** personal — el
  mismo dato de siempre (mismo balance, mismo sistema de depósitos
  aprobados manualmente, mismas reglas de seguridad), pero presentado de
  forma más clara y personalizable, en el dashboard, en el panel de trading
  y en el panel de administrador.
  - **Nombre y color personalizables**: al crear o editar una billetera,
    el usuario le pone el nombre que quiera (por ejemplo "Billetera
    Principal" o "Ahorros para cripto") y elige un color de una paleta de
    8 opciones — se ve como un punto de color y un acento en el borde de
    la tarjeta de esa billetera en el dashboard. Estos dos campos son
    completamente del usuario: se pueden cambiar cuando quiera, sin pasar
    por el equipo de Zenith Capital, porque son solo personalización visual
    y no afectan el saldo ni las operaciones.
  - **Enlace de la billetera**: cada billetera recibe automáticamente, al
    crearse, un identificador único con forma de enlace (por ejemplo
    `zenith-capital.app/wallet/8f3a...`), visible y copiable con un botón
    "Copiar" tanto en la tarjeta del dashboard como en el modal de edición.
    Es importante ser honestos sobre qué es esto: es un identificador de
    referencia dentro de Zenith Capital, para que la billetera se sienta
    como la de una plataforma real — **no** es una cuenta bancaria ni un
    enlace que conecte con ningún banco de verdad, y no procesa ninguna
    transferencia por sí solo. El dinero real que la persona envía desde
    sus bancos sigue llegando exactamente igual que antes: el equipo de
    Zenith Capital confirma el depósito manualmente y recién ahí aparece el
    saldo en la billetera. Esto se explica con todas las letras en el
    propio formulario, junto al campo del enlace.
  - **Nada de esto reabre la brecha de seguridad cerrada en la sección 23**:
    balance y equity siguen siendo de solo lectura, tanto en el formulario
    como en el servidor — se verificó de nuevo, llamando la API
    directamente (sin pasar por el formulario) con un balance y hasta un
    enlace de billetera inventados en el pedido, confirmando que el
    servidor los ignora por completo y nunca se aplican.
  - **Cuentas existentes de antes de esta actualización**: no se pierde
    nada — al arrancar el servidor, cualquier cuenta que no tuviera todavía
    nombre, color o enlace de billetera recibe automáticamente un nombre
    por defecto ("Mi Billetera"), un color por defecto y un enlace nuevo,
    sin necesidad de que el usuario haga nada.
  - Se actualizó también el panel de trading (el selector ahora dice
    "Billetera" y muestra el nombre elegido) y el panel de administrador
    (columnas y menús ahora dicen "Billeteras"), para que la terminología
    sea consistente en todo el sitio.

## 27. Conectividad de CoinGecko, dashboard menos saturado y pantalla de acceso en celular con el mismo estilo del escritorio (agosto 2026)

- **El problema real detrás de "se queda cargando" al cambiar de moneda**:
  `fetch()` no tiene un límite de tiempo propio. Cuando CoinGecko (la API
  gratuita de precios) "se cuelga" — acepta la conexión pero nunca termina
  de responder, algo que le pasa seguido — un `fetch()` normal se queda
  esperando esa respuesta para siempre. El código ya tenía reintentos (3
  intentos con una pausa entre cada uno) desde la corrección de la sección
  25, pero esos reintentos solo se disparaban cuando el pedido fallaba con
  un error — un pedido que simplemente nunca responde no falla nunca, así
  que nunca llegaba a reintentar ni a mostrar el aviso de error: se quedaba
  con el mensaje de "Actualizando gráfico…" pegado indefinidamente, que es
  exactamente el síntoma que describió Lucas ("si uno sale y vuelve a
  entrar una moneda se queda cargando").
- **La corrección**: se agregó un helper compartido (`fetchWithTimeout` en
  `assets/js/api.js`, disponible en todas las páginas) que cancela el
  pedido con un `AbortController` si no hay respuesta dentro de un tiempo
  límite (9 segundos para el histórico del gráfico, 8 segundos para el
  precio en vivo). Pasado ese tiempo, el pedido "colgado" se convierte en
  un error normal, que dispara el mismo mecanismo de reintentos y el mismo
  aviso de error con botón "Reintentar" que ya existía — ya no hay ningún
  camino en el que la pantalla se quede esperando para siempre. Se aplicó
  en los cuatro lugares del panel de trading que llaman directamente a
  CoinGecko o a gold-api.com (histórico del gráfico, precio en vivo de
  criptos, precio en vivo de metales, y el precio único que se usa para
  liquidar una operación Sube/Baja) y en el ticker de precios del
  dashboard.
- **Verificado**: se simuló una API de CoinGecko que se cuelga por
  completo (nunca responde) — sin la corrección, la pantalla se hubiera
  quedado "cargando" para siempre; con la corrección, a los ~30 segundos
  (3 intentos x ~9s + las pausas entre reintentos) aparece el aviso de
  error con "Reintentar", y al restaurar la conexión y apretar
  "Reintentar", el gráfico carga con normalidad.
- **Dashboard menos saturado**: a pedido de Lucas, el resumen de balance
  (Balance total / Equity total / P/L flotante / Billeteras activas) ahora
  aparece arriba de todo, justo debajo del encabezado — antes había que
  bajar pasando tres banners grandes para verlo. El banner de "Panel de
  Trading Zenith" (el que lleva a las gráficas) quedó justo debajo del
  balance. Los banners grandes de "Comunidad Zenith" e "Insignias Zenith"
  se quitaron del cuerpo del dashboard — ahora son dos íconos chiquitos
  (🏅 Insignias, 💬 Comunidad) en la barra superior, junto al perfil, tanto
  en el dashboard como en el panel de trading. Siguen llevando exactamente
  a las mismas páginas de siempre (`insignias.html`, `community.html`),
  solo que ya no ocupan todo el ancho de la pantalla.
- **Pantalla de acceso (`index.html`) en celular**: antes, por debajo de
  860px de ancho, el panel izquierdo decorativo (`.auth-aside`, con la
  animación de "lluvia" de símbolos de inversión — ver
  `assets/js/invest-rain.js`) se ocultaba por completo, dejando solo el
  formulario de login sobre fondo liso — se veía como una pantalla
  genérica sin identidad de marca. Ahora en celular ese panel se conserva
  como una franja compacta arriba del formulario, con la misma animación
  de lluvia y la marca, recortando solo el contenido más largo (párrafo
  explicativo, tarjetas de "Seguridad/Mercados globales/Análisis
  inteligente", callout de IA) para que no sature una pantalla chica. La
  barra superior del resto del sitio también se hizo más compacta en
  celular (se oculta el nombre de usuario en texto y el texto junto al
  logo, dejando solo íconos) ahora que suma los dos nuevos accesos de
  Insignias/Comunidad.
- Nada de esto cambia cómo se ven los datos en sí (ningún número
  inventado, ninguna cifra de mercado que no venga de CoinGecko/gold-api
  real) — son mejoras de confiabilidad de conexión y de organización
  visual únicamente.

## 28. Binance y Coinbase como método de depósito (agosto 2026)

- Antes, el modal de "Solicitar depósito" solo dejaba elegir
  "Transferencia bancaria" — Binance, Coinbase y Tarjeta aparecían como
  "Próximamente" y no se podían seleccionar, aunque para **retirar** esos
  mismos métodos (menos Tarjeta) ya funcionaban desde antes. Lucas
  preguntó por qué no se podía hacer clic ahí; a pedido suyo se activaron
  Binance y Coinbase también para depositar, igual que ya funcionaban para
  retirar.
- Tarjeta se queda deshabilitada ("Próximamente") — Lucas decidió
  dejarla así, y de todas formas sigue aplicando la restricción de
  seguridad no negociable de más abajo: no se pide número de tarjeta real
  en un sitio de práctica sin un procesador de pago real detrás.
- Cuando el método elegido es Binance o Coinbase, el campo "Banco" (una
  lista de bancos reales) ya no tiene sentido, así que se oculta — el
  formulario pasa a mostrar solo el monto y el número de celular, igual
  que ya pasa en el modal de Retirar, y se avisa que el equipo de Zenith
  Capital contacta a esa persona para indicarle a qué billetera enviar el
  dinero. El backend no cambió: sigue guardando un solo campo de texto
  (antes pensado para el nombre del banco), que ahora recibe "Binance" o
  "Coinbase" cuando corresponde — se ve bien en el historial de depósitos,
  el panel de administrador y el comprobante sin tocar la base de datos ni
  las rutas del servidor. La columna correspondiente en el historial de
  depósitos del dashboard se renombró de "Banco" a "Banco / método" para
  reflejar esto.

## 29. Causa real de la mala conectividad de los gráficos, y por qué la corrección anterior no alcanzaba (agosto 2026)

- Lucas reportó que, incluso después de la corrección anterior (timeout de
  10s por petición), los gráficos seguían con "mal proceso de carga y
  display". Investigando más a fondo, la causa real es que CoinGecko, en
  su plan gratuito (sin llave de API), tiene un límite muy estricto de
  peticiones por minuto — y esta app lo supera fácilmente: el ticker de
  precios pregunta cada 5 segundos, el gráfico se refresca cada 60
  segundos, y cada vez que alguien cambia de activo o de plazo se hacen 2
  peticiones más. Con más de una pestaña o persona usando el sitio al
  mismo tiempo, el límite se agota rápido.
- Encima, el reintento automático que ya existía (3 intentos, 1.5s aparte)
  estaba empeorando el problema: si CoinGecko ya estaba bloqueando por
  exceso de peticiones, esos 3 intentos volvían a golpear el mismo límite
  activo, alargando la falla en vez de resolverla.
- Se agregó una "pausa" compartida: en cuanto cualquier parte del sitio
  recibe un aviso de "demasiadas peticiones" de CoinGecko, TODO el sitio
  deja de intentarle a CoinGecko durante 45 segundos (el ticker, el
  gráfico, el cambio de activo), y en vez de quedarse cargando sin
  avisar, muestra de inmediato un mensaje honesto: "CoinGecko alcanzó su
  límite de peticiones gratuitas por un momento. Esto se resuelve solo en
  menos de un minuto — no hace falta hacer nada." Esto evita gastar el
  límite en reintentos inútiles y deja que se libere solo.
- También se agregó que, cuando la pestaña del navegador está en segundo
  plano (la persona cambió a otra pestaña o minimizó), el sitio deja de
  seguir preguntando precios y gráficos — no tiene sentido gastar el
  límite de peticiones en algo que nadie está mirando. Apenas la persona
  vuelve a esa pestaña, se actualiza todo al instante.
- De paso, se corrigió un error donde, si la petición de precios de
  cripto fallaba (por cualquier motivo, incluyendo lo de arriba), los
  precios de oro y plata (que vienen de un servicio totalmente aparte)
  también se descartaban esa vuelta, aunque sí hubieran llegado bien —
  ahora cada uno se procesa de forma independiente.

## 30. Corrección de un error real en la conversión de moneda para depósitos/retiros (agosto 2026)

- Lucas reportó que, del menú de usuario, "lo único que no sirve es la
  moneda de depósitos" (el resto — Mi perfil, modo oscuro, cerrar sesión —
  sí funcionaba). Se probó el selector de moneda en sí y funciona bien;
  el problema real estaba un paso más adelante, al momento de calcular el
  monto a enviar.
- Causa encontrada: cuando la página carga, pide al servidor las tasas de
  cambio actuales. Si esa petición fallaba o tardaba de más (por ejemplo,
  durante un arranque en frío del servidor gratuito de Render, que puede
  tardar 30-60+ segundos), la app se quedaba silenciosamente con "todo
  vale lo mismo en dólares" para el resto de la sesión — sin avisar nada.
  Eso significa que alguien podía elegir "COP", escribir "50000" pensando
  en pesos colombianos, y la app enviaría una solicitud de depósito por
  $50,000 **dólares** en vez de los ~$12.50 dólares que en realidad
  corresponden — el selector se veía como si funcionara (la etiqueta
  cambiaba a "COP"), pero el cálculo de fondo estaba mal.
- Corrección: (1) esa petición de tasas de cambio ahora tiene un límite de
  tiempo y reintenta una vez más si falla; (2) más importante, se agregó
  un candado que **bloquea el envío** del depósito o retiro con un
  mensaje claro ("Todavía no se cargó la tasa de cambio para {MONEDA}.
  Espera unos segundos e intenta de nuevo.") si la tasa de esa moneda
  todavía no llegó — en vez de mandar un monto equivocado sin que nadie
  se dé cuenta. Esto sigue el mismo principio de honestidad del resto del
  proyecto: mejor avisar y pedir que se espere unos segundos, que enviar
  un número que no es el correcto.

## 31. Panel de administrador: primero los usuarios, luego sus pendientes (agosto 2026)

- Lucas señaló que "se desordena mucho todo lo que sucede cuando un
  usuario hace una operación" y pidió poder ver solo la lista de usuarios
  y entrar a cada uno para ver y editar sus propias operaciones, en vez
  de tener todo mezclado en la pantalla principal del admin.
- Antes, los depósitos, retiros y compras/ventas pendientes de **todos**
  los usuarios se mostraban en tres listas globales, una debajo de la
  otra, sin separar por persona — con más de un usuario activo se volvía
  difícil saber de quién era cada cosa.
- Ahora la fila de cada usuario en "Usuarios registrados" muestra una
  etiqueta de aviso ("N pendientes") solo cuando esa persona tiene algo
  esperando revisión, y la fila se resalta levemente para que salte a la
  vista. Al presionar "Editar" en un usuario, lo primero que aparece —
  antes incluso de sus billeteras — es la sección "Pendientes de
  [nombre]" con únicamente los depósitos, retiros y operaciones de esa
  persona, cada uno con sus mismos botones de Aprobar/Rechazar/editar
  monto de siempre.
- Las tres listas "con todo junto" (de todos los usuarios) se dejaron
  como respaldo, ahora colapsadas dentro de "Ver todos los pendientes
  juntos (todos los usuarios, vista de respaldo)" — útil para un vistazo
  general, pero ya no es lo primero que se ve al entrar al panel.
- Se verificó con una prueba automatizada que aprobar un depósito desde
  el panel de un usuario aplica el cambio exactamente una vez (no dos)
  y que el contador de pendientes de esa persona baja correctamente
  después.

## 32. Cambio de CoinGecko a Binance para precio en vivo e historial de velas — carga casi instantánea (agosto 2026)

- A pesar de la corrección de la sección 29, Lucas reportó que las gráficas
  seguían demorando mucho en cargar apenas se entra a ellas, y que
  cualquier acción (cambiar de activo, de plazo) generaba una espera
  larga — pidió explícitamente evaluar mover los gráficos a otra fuente,
  proponiendo investing.com.
- Investing.com no ofrece una API gratuita de datos para consumir desde
  código propio — solo un widget embebido con su propio diseño ajeno, que
  no se puede personalizar ni incluir la moneda propia Zenith (ZNT). Se le
  presentaron a Lucas las alternativas reales y eligió cambiar a Binance.
- Binance tiene un límite de peticiones muchísimo más alto que el plan
  gratuito de CoinGecko, así que en teoría resolvía el problema de fondo
  — pero al investigar se encontró un obstáculo real: la API normal de
  Binance (la que se llama con una petición HTTP común) no permite que un
  navegador la llame directamente desde una página web en otro dominio
  (un problema de "CORS", una regla de seguridad del navegador) — llamarla
  así falla siempre, sin excepción, sin importar desde dónde se use.
- La solución: Binance sí permite conectarse libremente por WebSocket
  (una conexión persistente, distinta a una petición HTTP normal, a la
  que esa regla de CORS no le aplica). Se construyó un cliente propio
  (`market-ws.js`) que usa exclusivamente WebSocket para hablar con
  Binance:
  - El historial de velas de cada gráfico ahora se pide por WebSocket
    (un solo pedido, con el volumen ya incluido en la respuesta, algo que
    antes con CoinGecko necesitaba dos peticiones separadas). En las
    pruebas, esto bajó el tiempo de "entrar a un gráfico" de varios
    segundos (o la espera completa del límite de CoinGecko cuando estaba
    activo) a *menos de un cuarto de segundo*.
  - El precio en vivo de cada criptomoneda ahora llega empujado por
    Binance por WebSocket apenas cambia — no hay que "preguntar cada 5
    segundos" como antes; el precio en pantalla se actualiza al instante,
    en el momento real en que cambia.
  - Si Binance no logra conectar por cualquier motivo (una red que
    bloquea WebSocket, Binance caído, o alguna moneda puntual que no
    tenga ahí) cada función cae de vuelta sola a CoinGecko, exactamente
    como funcionaba antes — el sitio nunca se queda sin datos por
    depender de una sola fuente.
  - Los metales (oro, plata, platino, paladio, cobre) siguen igual que
    antes, por gold-api.com — Binance no ofrece metales.
  - Tether (USDT), en el ticker del dashboard, se muestra fijo en $1.00 en
    vez de pedirlo a cualquier fuente — está diseñado para valer siempre
    un dólar (respaldado 1 a 1), así que mostrar otra cosa sería menos
    honesto, no más, y evita depender de una fuente de datos aparte solo
    para una moneda que casi nunca se mueve.
- Se verificó con pruebas automatizadas (simulando tanto "Binance
  funciona perfecto" como "Binance está completamente bloqueado") que
  ambos caminos funcionan: con Binance disponible, el gráfico carga en
  fracciones de segundo sin pedirle nada a CoinGecko; con Binance
  bloqueado, el sitio sigue funcionando exactamente como antes por el
  respaldo de CoinGecko, sin quedar nunca sin datos.

## 33. Corrección del punto decimal en montos del admin, y Balance/Equity en la moneda local del usuario (agosto 2026)

- Lucas reportó un bug real: al probar, ingresó un balance de "103.266.83"
  USD en la billetera de un usuario, y al querer editar el total a mano no
  lo dejaba escribir el segundo punto. Causa: los campos de Balance,
  Equity y monto de depósito/retiro en el panel de admin eran
  `<input type="number">` nativos del navegador — ese tipo de campo
  bloquea por diseño escribir un segundo punto o coma, así que cualquier
  formato con separador de miles (muy común para hispanohablantes, ej.
  "103.266,83" o "103.266.83") era literalmente imposible de escribir.
- Corrección: esos cuatro campos (Balance y Equity al editar una cuenta,
  y el monto al aprobar un depósito o retiro) ahora son campos de texto
  normales, con un intérprete propio (`parseFlexibleAmount`) que entiende
  todos los formatos razonables: `103266.83`, `103.266.83`, `103.266,83`,
  `103,266.83`, o un monto redondo como `103.266` (sin centavos). Si lo
  escrito no se puede entender como un número, se avisa con un mensaje
  claro en vez de guardar cualquier cosa. Probado con 16 casos distintos,
  incluyendo el formato exacto que reportó Lucas.
- Durante la investigación de este bug apareció una alarma aparte: en una
  prueba, dos billeteras del mismo usuario terminaron con el balance
  idéntico después de editar solo una. Se investigó a fondo (el código de
  guardado, la base de datos, y una prueba aislada directa contra el
  servidor) y se confirmó que **fue una falsa alarma de la propia forma de
  probar**, no un error real de la plataforma: al repetir la misma prueba
  dos veces sin reiniciar los datos, la primera vez dejó la primera
  billetera "en revisión" (que por diseño oculta sus campos editables
  mientras espera aprobación, para no pisar un cambio a medias), y la
  segunda prueba, al buscar un campo editable de balance, terminó
  agarrando por accidente el de la SEGUNDA billetera. Cada billetera se
  edita de forma completamente independiente; no hay ningún cruce real
  entre cuentas.
- Pedido de Lucas, en dos mensajes seguidos: agregar el peso argentino
  (ARS) "para balance y todos los estilos que tenemos de operación", y
  que sea "funcional cuando yo escoja cuánto agregar en mi balance". Al
  revisar, el selector de moneda ARS ya existía para cualquier usuario
  desde el dashboard (sección 18) — lo que faltaba era en el panel de
  ADMIN, donde Lucas edita manualmente el balance de cada persona. Pedido
  final, ya aclarado: mostrar el Balance (y Equity) en DOS columnas —
  la moneda propia de esa persona, al lado del total en USD — sincronizadas
  entre sí.
- Para que el admin sepa en qué moneda mostrarle el balance a cada
  usuario, ahora el backend recuerda la última moneda que esa persona
  eligió (antes solo se guardaba en el navegador de cada quien, nunca
  llegaba al servidor) — nuevo campo `preferredCurrency` en su perfil,
  actualizado en silencio cada vez que cambia de moneda desde el menú de
  usuario (`PUT /api/auth/currency`), sin que la persona tenga que hacer
  nada extra ni notar que pasó.
- En el panel de admin, al editar la billetera de un usuario que tiene una
  moneda local distinta de USD, ahora aparecen dos campos adicionales al
  lado de Balance y Equity — "Balance (ARS)", "Equity (ARS)", etc. según
  la moneda de esa persona — con la tasa de cambio actual. Escribir en
  cualquiera de los dos campos (USD o moneda local) recalcula el otro al
  instante; al guardar, lo que de verdad se manda y se guarda en el
  servidor es siempre el monto en USD — el balance real de la cuenta
  nunca deja de ser en dólares, la moneda local es solo una forma más
  cómoda de leerlo y escribirlo.
- Verificado de punta a punta con una prueba automatizada: un usuario
  elige ARS como su moneda → el admin, al abrir esa cuenta, ve
  correctamente "Balance (ARS)" con la tasa correcta → escribir 1000 en
  USD actualiza el campo ARS al valor convertido correcto → escribir
  "2.500.000,50" en el campo ARS (combinando el separador de miles con la
  conversión de moneda) recalcula el campo USD al valor correcto → al
  guardar, el monto que de verdad llega al servidor es el equivalente en
  USD, no el número en ARS. Todo funcionó igual con capturas de pantalla
  del panel confirmándolo visualmente.

## 34. Más monedas al crear una billetera, y una moneda no reconocida ya no rompe la tarjeta (agosto 2026)

- Lucas reportó que al crear una billetera nueva, el selector de "Moneda"
  solo ofrecía USD, EUR y USDT, y pidió que estuvieran todas las que ya
  soporta la plataforma.
- Se agregaron las mismas monedas que ya existen en el resto del sitio
  (el selector "Moneda" del menú de usuario, sección 18): ARS, PEN, COP,
  MXN y CLP, además de BRL — junto a USD, EUR y USDT, que ya estaban.
- Al revisar esto se encontró un bug real, todavía no reportado: "USDT"
  no es un código de moneda oficial (ISO), y pedirle al navegador que
  formatee un monto "como moneda" con un código que no reconoce falla
  directamente con un error — así que cualquier billetera creada en USDT
  antes de esta corrección se arriesgaba a que su tarjeta de Balance/
  Equity/P&L no se dibujara bien. Se corrigió para que, si el código de
  moneda no es uno que el navegador reconozca, en vez de fallar se
  muestre el número seguido del código (ej. "0.00 USDT") — igual de claro,
  sin romper nada. Las monedas reales (USD, EUR, ARS, etc.) se siguen
  viendo con su símbolo normal ($1,234.50, €1,234.50, etc.).
- Se recuerda que la moneda de una billetera es solo una etiqueta —
  cuánto vale de verdad esa billetera (su Balance/Equity real) lo sigue
  asignando el equipo de Zenith Capital en USD desde el panel de admin,
  como siempre; esto no cambia esa parte.
- Verificado con una prueba automatizada: las 9 monedas aparecen en el
  selector al crear una billetera nueva, y crear una billetera en USDT ya
  no genera ningún error — se ve correctamente como "0.00 USDT" en su
  tarjeta, confirmado también con una captura de pantalla.

## 35. La página entera esperaba en silencio a un CDN externo, y el socket de precio en vivo no se recuperaba solo (agosto 2026)

- Lucas volvió a pedir explícitamente que el panel de trading cargue de
  inmediato al entrar, que cualquier activo que elija también cargue de
  inmediato, y que moverse entre varias monedas se siga sintiendo fluido
  durante toda la visita — es decir, exactamente el objetivo de la
  sección 32 (el cambio a Binance), pero pidiendo confirmar/reforzar que
  de verdad se cumple siempre, no solo la mayoría de las veces.
- Al poner esto a prueba a fondo (simulando distintas fallas de red, algo
  que en el uso normal es imposible de provocar a propósito) aparecieron
  dos causas reales, más allá de lo ya resuelto con Binance:
  1. **La librería que dibuja el gráfico (lightweight-charts) se cargaba
     con un `<script>` normal de un servidor externo (unpkg.com), del
     tipo que BLOQUEA el resto de la página hasta que termina de
     descargar.** Si ese servidor externo respondía lento en ese momento
     (una red que tropieza, un pico de tráfico del CDN, etc.), TODA la
     página se quedaba esperando — incluyendo cosas que no tienen nada
     que ver con el gráfico, como el precio en vivo o el balance de las
     cuentas. Esto se sentía exactamente como "tarda mucho en conectar",
     aunque el problema no fuera ni de Binance ni de Zenith Capital, sino
     de qué tan rápido respondiera ese servidor externo en ese instante
     puntual.
  2. **El socket que empuja el precio en vivo (a diferencia del que pide
     el historial del gráfico) nunca se reconectaba solo si se cortaba a
     mitad de sesión** — un corte de red de un segundo (wifi que titila,
     la laptop que se suspende un momento, Binance reiniciando ese nodo
     puntual) lo dejaba "congelado" en silencio por el resto de la
     visita: el precio dejaba de sentirse en vivo, sin ningún aviso, y de
     a poco la página volvía a depender del límite gratuito de CoinGecko.
- Corrección de la causa 1: la librería del gráfico ahora se pide en
  paralelo, sin bloquear nada — el resto del panel (precios, cuentas,
  historial de operaciones) arranca de inmediato sin esperar a que esa
  pieza externa esté lista, y el gráfico se dibuja apenas la librería
  llega (normalmente ya está lista para ese momento). Si de verdad no
  llega en 6 segundos, se avisa con el mismo mensaje de siempre ("no se
  pudo cargar el gráfico") en vez de dejar la sección en blanco para
  siempre — y el resto del panel (comprar/vender, precios, cuentas) sigue
  funcionando con total normalidad de todos modos, porque nunca dependió
  de esa librería. Mismo arreglo en el dashboard, para el gráfico de
  Zenith (ZNT).
- Corrección de la causa 2: el socket de precio en vivo ahora se
  reconecta solo apenas se cae, con una espera que empieza corta (2s) y
  se va alargando si sigue fallando (hasta 20s) para no insistir sin
  parar contra una red que de verdad tenga el WebSocket bloqueado — y que
  se resetea a 2s apenas logra conectar bien una vez. También se corrigió
  algo parecido en el socket que pide el historial del gráfico: antes,
  una sola falla de conexión al entrar lo desactivaba para el resto de la
  visita (para no perder tiempo reintentando en cada cambio de activo) —
  ahora, tras 15 segundos de enfriamiento, se vuelve a intentar solo en
  el siguiente cambio de activo, así que un tropiezo pasajero justo al
  entrar ya no condena toda la sesión al camino lento de respaldo.
- Se aclara, porque puede no ser obvio: el precio y el historial de
  velas se piden directamente desde el navegador de cada persona hacia
  los servidores de Binance — esto no pasa por Render ni por Vercel, así
  que el tiempo que tarda Render en "despertar" (plan gratuito) no tiene
  ningún efecto sobre qué tan rápido carga el gráfico.
- Verificado con pruebas automatizadas que simulan cuatro escenarios: (1)
  todo funcionando perfecto — el gráfico del activo por defecto aparece
  en ~250ms y cambiar entre varios activos toma ~180-230ms cada vez, sin
  tocar nunca a CoinGecko; (2) el socket de velas falla al entrar — cae a
  CoinGecko como respaldo y, pasado el enfriamiento, vuelve solo a
  Binance; (3) el socket de precio en vivo se corta a mitad de sesión —
  se reconecta solo y el precio vuelve a actualizarse; (4) el CDN de la
  librería del gráfico está totalmente bloqueado — el precio en vivo y la
  lista de instrumentos igual aparecen en ~150ms, y el gráfico muestra su
  aviso de siempre tras 6 segundos en vez de dejar el panel entero
  congelado.

## 36. Petróleo/Forex/Índices en el panel, billeteras y perfil simplificados, se quita "Análisis con IA", y Rangos se convierte en Planes de Inversión con calculadora ROI y Quick Ledger (agosto 2026)

- Lucas pidió, con un detalle de requerimientos punto por punto, un
  rediseño grande de varias partes de la plataforma. Antes de tocar
  código: la combinación de "planes de inversión con montos fijos" +
  "calculadora que proyecta ganancias a futuro", justo después de
  conversaciones anteriores sobre vender el proyecto o volverlo legítimo,
  coincide con el patrón estructural de esquemas Ponzi/HYIP — así que se
  preguntó explícitamente antes de escribir nada. Lucas confirmó que
  **sigue siendo 100% simulación, sin dinero real de por medio**, y todo
  lo de abajo se construyó sobre esa base (ver la sección de
  Restricciones de seguridad más abajo, sin cambios).

**1. Nuevos activos: Petróleo, Forex e Índices bursátiles**

- Se agregaron al panel de trading tres categorías nuevas, cada una con
  su propia pestaña de filtro: Petróleo (WTI y Brent), Forex (7 pares:
  EUR/USD, GBP/USD, USD/JPY, USD/MXN, USD/COP, USD/ARS, USD/BRL) e
  Índices bursátiles (S&P 500, Dow Jones, Nasdaq 100).
- Petróleo e Índices: precio real vía Alpha Vantage (`data/markets.js`,
  backend nuevo), cacheado varias horas porque el plan gratis de esa API
  da como máximo 25 peticiones/día y solo el cierre del día anterior (no
  en vivo al segundo). Los índices usan un ETF espejo real (SPY, DIA,
  QQQ) porque el plan gratis no da el índice "puro" — se marca así de
  forma honesta en la lista de instrumentos (ver `INDEX_SYMBOLS` con su
  campo `note`). Requiere la variable opcional `ALPHA_VANTAGE_API_KEY`
  (ver `.env.example`); sin ella, estos activos aparecen como "no
  disponible" en vez de romper el resto del panel.
- Forex: no necesitó ninguna fuente nueva — reutiliza las mismas tasas de
  cambio reales que ya usa toda la plataforma (`/api/currency/rates`),
  actualizadas cada hora. El precio de cualquier par se calcula como
  `rates[quote] / rates[base]`.
- Como estos tres tipos de activo no tienen historial de velas gratuito
  (igual que ya pasaba con los metales), el gráfico se construye 100% en
  vivo desde el momento en que se abren, con un aviso propio por
  categoría explicando la frecuencia real de actualización de cada una
  — nunca se inventa un historial que no existe.

**2. Billeteras y perfil más simples**

- Se quitó el campo "Número de billetera" del formulario: ahora una
  billetera se identifica solo por su nombre. El número (`accountNumber`)
  se sigue generando automáticamente por dentro (por si algún reporte
  interno lo necesita) pero ya nunca se le pide ni se le muestra al
  usuario. Se agregó una validación nueva: dos billeteras del mismo
  usuario ya no pueden tener el mismo nombre (antes sí podían, y sin el
  número para diferenciarlas se volvía ambiguo cuál era cuál).
- Se quitó por completo el campo "Tipo de billetera" (Standard/Pro/Zero/
  VIP) del formulario, de la base de datos y de todas las pantallas
  donde se mostraba — ya se había confirmado antes que era puramente
  cosmético, sin ningún efecto real en apalancamiento ni comisiones.
- Se quitó el campo "Dirección de vivienda" del formulario de datos
  personales (el backend ya lo trataba como opcional y no se mostraba en
  ningún otro lado, así que no hizo falta tocar nada del servidor).

**3. Se quita "Análisis con IA"**

- Se eliminó por completo la sección "Análisis con IA" del dashboard (el
  botón "Generar análisis" que llamaba a OpenAI) y su lógica en
  `dashboard.js`. La ruta del backend (`/api/ai/insights`) se deja intacta
  pero sin usar, a propósito, para no tocar nada más de lo pedido.
- Esto es distinto de la "Asesoría IA · Diamante y Platino" (recomendaciones
  para cuentas de rango alto) y de la auto-inversión con ZNT, que siguen
  funcionando exactamente igual que antes — Lucas no pidió tocar esas.

**4. "Rangos" se convierte en "Planes de Inversión"**

- La página `insignias.html` (antes "Insignias Zenith", la vitrina de los
  5 rangos) se reemplazó por `planes.html`/`planes.js` ("Planes de
  Inversión"), con los 5 planes pedidos: Bronce $250, Plata $800, Oro
  $1500, Diamante $3000 y Rubí $5000. Cada tarjeta tiene un botón
  "Seleccionar y depositar" que manda directo al dashboard con el monto
  del plan ya cargado en el formulario de depósito (nunca se salta la
  revisión manual — el depósito sigue quedando "en proceso" hasta que el
  equipo lo confirme, igual que cualquier otro).
- Importante: esto es un sistema DISTINTO del de rangos/insignias que ya
  existía (`RANK_TIERS` en `dashboard.js`, la insignia del encabezado, y
  el umbral que habilita la Asesoría IA avanzada) — ese sigue funcionando
  exactamente igual, sin tocarse. Los nombres de nivel se parecen a
  propósito (Bronce, Plata, Oro, Diamante) pero son dos cosas separadas:
  una es un monto sugerido de depósito con calculadora educativa: la otra
  es un cálculo automático de prestigio según el saldo real de la cuenta.
- Todos los enlaces a "Insignias Zenith" en el resto del sitio
  (`dashboard.html`, `community.html`, `support.html`,
  `trading-panel.html`) se actualizaron a "Planes de Inversión".

**Calculadora de ROI simulado, Quick Ledger, y estilo mejorado**

- **Calculadora de ROI**: widget en `planes.html` con un slider que la
  propia persona mueve para elegir una tasa mensual hipotética (0% a
  8%), y proyecta con interés compuesto cómo se vería el monto del plan
  elegido a 30/60/90 días. A propósito NO hay ninguna tasa sugerida ni
  "recomendada" por la plataforma — el número siempre lo elige la
  persona, y hay un aviso visible y permanente aclarando que es una
  herramienta educativa, no una promesa ni garantía de rendimiento.
- **Quick Ledger**: tabla nueva en la parte de arriba del dashboard con
  los últimos 5 depósitos y su estado — "Pendiente" (en revisión),
  "Aprobado" (confirmado pero el saldo todavía no llega al monto del
  plan elegido, si había uno) o "Activo" (confirmado y el saldo ya
  alcanza ese monto). La relación depósito↔plan se guarda en
  `localStorage` del navegador (no hizo falta tocar el backend): es
  solo una etiqueta informativa, nunca afecta el saldo real.
- **Estilo**: el modo oscuro ahora tiene un tinte azul marino en vez de
  negro/gris puro, y se agregaron brillos "glow" sutiles (azul eléctrico
  y oro metálico, variables `--glow-accent`/`--glow-gold`) en puntos
  puntuales de alto valor — tarjetas de plan premium, la calculadora de
  ROI, el Quick Ledger, botones primarios al pasar el mouse — sin
  saturar el resto de la interfaz. El modo claro usa una versión mucho
  más discreta del mismo efecto.
- **Notificaciones flotantes (toasts)**: ya existían para compra/venta
  simulada en el panel de trading; se reutilizaron (no se reconstruyeron
  desde cero) y se les agregó una animación de entrada y un brillo sutil
  según el tipo de aviso. Seleccionar un plan también dispara un toast
  ("Plan X seleccionado — completa tu depósito de $X para activarlo") al
  llegar al dashboard.

## Restricciones de seguridad (no negociables)

- **Nunca** se construye un formulario que pida número de tarjeta completo,
  CVV o fecha de expiración para que un visitante real lo llene en el sitio
  público desplegado — eso es funcionalmente una página de captura de
  datos de pago, sin importar la intención. El botón "Pagar con tarjeta"
  del modal de Depositar se queda deshabilitado ("próximamente") hasta que
  exista un procesador de pago real detrás, o en su defecto solo pide datos
  no sensibles claramente marcados como simulados.
- Por la misma razón, **no** se recolecta número de cédula/documento de
  identidad real a través de un formulario en el sitio público. Si se llega
  a la Fase 7 (Perfil/Verificación), se simula con archivos de prueba, como
  ya quedó anotado en la sección 9.

## Reglas de diseño

- Sin botones flotantes que queden pegados en pantalla todo el tiempo
  (fuera de la barra superior fija).
- Colores no saturados — profesional, agradable de ver, práctico.
- Los números de referencia de un comprobante (depósito/retiro) deben
  verse como parte de un sistema con miles de registros: se genera un
  número aleatorio grande (rango aproximado 112.125–999.999) en vez de
  mostrar el ID secuencial interno de la base de datos.
- El nombre de usuario que hoy aparece como texto plano ("demo") en la
  barra superior se reemplaza por algo con mejor diseño — ej. una
  insignia tipo "Zenith Investor" en vez del username crudo.
- Paleta: el dorado (`--gold`, tomado del logo) es el segundo color de
  marca, reservado para elementos premium/branding (insignias, etiquetas,
  acentos puntuales) — el azul (`--accent`) sigue siendo el único color de
  acción/interacción (botones, enlaces, estados activos). No mezclar los
  dos usos.
- Iconos decorativos (tarjetas de confianza, callouts) van como SVG en
  línea, monocromos (`stroke="currentColor"`), nunca emoji del sistema —
  el render de emoji varía por SO/navegador y rompe la consistencia visual
  que se busca en una plataforma "premium + institucional".
- Pantalla de acceso (`index.html`) reescrita en agosto 2026 para sonar
  como una plataforma financiera institucional y no solo una demo de IA:
  título "Invierte en los mercados globales con inteligencia.", tres
  tarjetas de confianza (Seguridad / Mercados globales / Análisis
  inteligente) con icono+título+descripción reemplazando los antiguos
  stats numéricos, tarjeta inferior renombrada "Información inteligente
  para decisiones informadas" con etiqueta dorada "Tecnología integrada"
  (ya no se presenta como anuncio de "Powered by OpenAI"), pestaña "Crear
  cuenta" renombrada a "Abrir una cuenta", botón de login con gradiente
  azul/sombra sutil (`.btn-hero`) y aviso discreto "🔒 Conexión segura"
  debajo. La IA sigue existiendo (ver sección 8) pero deja de ser el
  mensaje principal de la marca.
