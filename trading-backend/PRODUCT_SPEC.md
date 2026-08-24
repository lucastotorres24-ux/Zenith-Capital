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
  ticker de cripto y en cada posición abierta. Comprar descuenta el total
  del balance de la cuenta elegida; vender lo acredita de vuelta. El precio
  usado es el real de CoinGecko que el usuario ve en pantalla. Las
  posiciones abiertas muestran cantidad, precio de compra, precio actual y
  P/L recalculado en vivo cada vez que el ticker se actualiza.
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

> Pendiente de esta misma sección 10 (no bloqueante): un *ledger* unificado
> que junte depósitos + retiros + compras + ventas + operaciones Sube/Baja
> en una sola vista de historial — hoy cada uno vive en su propia tabla
> (`trades`/`options` sí quedan registrados en el backend, pero todavía no
> tienen una pantalla unificada). El panel de activos personalizados
> (sección 11) y los widgets de "actividad de mercado" (sección 12) siguen
> sin construir. La "mejor construcción de los botones" pedida por Lucas se
> aplicó de forma puntual (iconos en los botones principales del dashboard,
> banner de acceso al panel de trading, botones SUBE/BAJA grandes) — el
> rediseño visual general sigue pendiente como tarea aparte.

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

## 9. Perfil

- Información personal.
- Verificación.
- Documentos.

> Nota de seguridad para cuando lleguemos a esta fase: aunque el flujo se
> construya, no se deben subir ni almacenar documentos de identidad reales
> — se simula con cualquier archivo de prueba. Guardar identificaciones
> reales de forma insegura es un riesgo real aunque el resto de la app sea
> una simulación.

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
- [ ] **Fase 7 — Perfil + verificación**: datos personales y flujo de
      verificación simulado (sin procesar documentos reales).

Depósitos v1 y Retiros v1 (ya construidos) se revisan y extienden en la
Fase 0/3 para que sus estados coincidan con el resto del ledger.

## 10. Compra y venta (motor de trading simulado)

- Botón **COMPRAR** en verde, botón **VENDER** en rojo.
- Comprar descuenta el valor de la operación del saldo disponible de la
  cuenta. Vender acredita el valor correspondiente de vuelta al saldo.
- Se opera sobre precios reales del ticker de cripto (CoinGecko) — el
  movimiento de precio que mueve la ganancia/pérdida es real, no inventado.
- Posiciones abiertas visibles con: activo, cantidad, precio de compra,
  precio actual, y ganancia/pérdida (P/L) recalculada en vivo.
- Esto requiere el concepto de *holding* (posición por activo dentro de una
  cuenta) que hoy no existe — una cuenta solo tiene `balance`/`equity`
  globales. Es exactamente la **Fase 0** del roadmap: holdings + ledger
  unificado. Todo lo demás de esta sección se construye sobre eso.

## 11. Panel de activos personalizados (demo/admin)

Para que la cuenta demo se sienta como un simulador completo tipo IQ
Option, además de los activos de cripto reales:

- Crear activos nuevos (nombre, símbolo, precio inicial).
- Editar nombre, precio y otras características de un activo existente.
- Simular manualmente que el precio de un activo sube o baja — control
  directo, sin depender de un mercado real detrás.
- Las posiciones abiertas sobre esos activos reflejan automáticamente la
  ganancia/pérdida según el precio simulado (mismo motor de la sección 10).
- Se compran/venden con el mismo saldo virtual que los activos reales.
- Todo elemento de un activo personalizado debe decir claramente
  "Simulado" / "Demo" para no confundirse con un activo real.

> Nota de secuencia: la sección 10 (comprar/vender con precios reales de
> cripto) se construye primero porque no depende de un panel nuevo — solo
> del motor de holdings. El panel de activos personalizados de esta
> sección se agrega después, reutilizando el mismo motor de compra/venta.

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
