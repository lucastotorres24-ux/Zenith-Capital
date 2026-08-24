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

- [ ] **Fase 0 — Fundamento de datos**: agregar el concepto de *holdings*
      (posiciones por activo dentro de una cuenta: cantidad, precio medio,
      fecha de compra) y un *ledger* unificado (una tabla que registra
      todo movimiento: depósito, retiro, compra, venta). Todo lo demás se
      apoya en esto.
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

## Pendiente: ajuste manual de ganancia/pérdida (admin)

Pedido: poder modificarle a un cliente su ganancia en una acción o inversión
para cambiar su saldo en la cuenta — útil para simular resultados de
mercado en las pruebas.

Esto necesita el concepto de *holding* (posición por activo) que todavía no
existe — hoy una cuenta solo tiene `balance` y `equity` globales, no
posiciones individuales por activo. Se construye como parte de la
**Fase 0** (ver roadmap arriba): una vez existan los holdings, este ajuste
manual será una edición directa sobre el holding, que recalcula el balance/
equity de la cuenta automáticamente.
