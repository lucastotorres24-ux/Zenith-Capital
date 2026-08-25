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
- Alcance confirmado con Lucas: **"ver todo, editar lo operativo"** — esta
  tabla es de solo lectura (perfil, insignia, documentos); para editar
  montos/cantidades se sigue usando la cola de aprobación de abajo, no esta
  tabla. No hay edición de datos personales del usuario desde acá.
- `GET /api/admin/users` (`getAllUsersAdminView` en `data/store.js`) arma
  la vista combinando usuarios + cuentas + documentos + insignia calculada.

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
