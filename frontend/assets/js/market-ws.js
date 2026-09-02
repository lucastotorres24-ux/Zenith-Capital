// market-ws.js — Cliente de datos de mercado en vivo de Binance (API
// pública, sin llave, sin registro) para reemplazar a CoinGecko como
// fuente principal del precio en vivo y del historial de velas de
// criptomonedas.
//
// Por qué Binance y por qué por WebSocket (no por fetch normal):
//   1. CoinGecko gratis tiene un límite de peticiones por minuto muy bajo,
//      fácil de agotar con el uso normal de esta app (ver PRODUCT_SPEC,
//      sección "Causa real de la mala conectividad de los gráficos").
//   2. La API REST normal de Binance (https://api.binance.com/api/v3/...)
//      no envía las cabeceras CORS que un navegador exige para aceptar la
//      respuesta de un sitio en otro dominio — pedirle datos así, con
//      fetch(), falla siempre con un error de CORS. Por eso NO se usa acá.
//   3. Las conexiones WebSocket (wss://) sí se pueden abrir libremente
//      desde cualquier página, sin ese problema — CORS es una regla que
//      solo aplica a fetch/XHR, nunca a WebSocket. Por eso este archivo
//      solo usa WebSocket: un socket de "stream" que empuja el precio en
//      vivo solo (sin que la página tenga que preguntar), y un socket de
//      "API" al que se le puede pedir historial de velas bajo demanda.
//
// Si por cualquier motivo esto no logra conectar (una red que bloquea
// WebSocket, Binance caído en ese momento, un símbolo que Binance no
// tiene, etc.), cada función que lo usa (en dashboard.js y
// trading-panel.js) cae de vuelta automáticamente al camino anterior con
// CoinGecko — la aplicación nunca se queda sin datos por depender de una
// sola fuente.
const MarketWS = (() => {
  const WS_API_URL = 'wss://ws-api.binance.com:443/ws-api/v3';
  const STREAM_URL_BASE = 'wss://stream.binance.com:9443/stream?streams=';
  const CONNECT_TIMEOUT_MS = 4000;
  const REQUEST_TIMEOUT_MS = 6000;
  // Si una conexión nunca logra abrirse (red que bloquea WebSocket,
  // Binance con un problema pasajero, etc.), antes se dejaba de intentar
  // Binance para siempre en esa visita a la página — así que un solo
  // tropiezo justo al entrar (por ejemplo, una wifi lenta un instante)
  // condenaba TODA la sesión al camino lento de respaldo (CoinGecko, con
  // su límite de peticiones), exactamente el problema que se quería
  // resolver. Ahora, en vez de "roto para siempre", se espera este tiempo
  // y se vuelve a intentar solo — así el sitio se auto-repara apenas la
  // red se estabiliza, sin que la persona tenga que recargar la página.
  const RETRY_COOLDOWN_MS = 15_000;

  // -----------------------------------------------------------------
  // Socket "API" (pedido → respuesta), usado para el historial de velas.
  // -----------------------------------------------------------------
  let apiSocket = null;
  let apiConnectPromise = null;
  const apiPending = new Map();
  let apiSeq = 0;
  let apiBrokenUntil = 0; // 0 = nunca falló (o ya se puede reintentar)

  function connectApi() {
    const now = Date.now();
    if (apiBrokenUntil && now < apiBrokenUntil) return Promise.reject(new Error('WS_UNAVAILABLE'));
    if (apiConnectPromise) return apiConnectPromise;

    apiConnectPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        apiBrokenUntil = Date.now() + RETRY_COOLDOWN_MS;
        apiConnectPromise = null;
        reject(new Error('WS_CONNECT_TIMEOUT'));
      }, CONNECT_TIMEOUT_MS);

      let ws;
      try {
        ws = new WebSocket(WS_API_URL);
      } catch (err) {
        clearTimeout(timer);
        apiBrokenUntil = Date.now() + RETRY_COOLDOWN_MS;
        apiConnectPromise = null;
        reject(err);
        return;
      }

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        apiSocket = ws;
        resolve(ws);
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        const pending = apiPending.get(msg.id);
        if (!pending) return;
        apiPending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.status === 200) pending.resolve(msg.result);
        else pending.reject(new Error((msg.error && msg.error.msg) || 'WS_API_ERROR'));
      });

      const onGone = () => {
        apiSocket = null;
        apiConnectPromise = null;
        apiPending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error('WS_CLOSED')); });
        apiPending.clear();
        if (!settled) {
          // Nunca llegó a abrir: es un fallo real de conexión, así que sí
          // vale la pena esperar el enfriamiento antes de reintentar.
          settled = true;
          clearTimeout(timer);
          apiBrokenUntil = Date.now() + RETRY_COOLDOWN_MS;
          reject(new Error('WS_CONNECT_FAILED'));
        }
        // Si sí llegó a abrir y se cayó después (una red que titila un
        // segundo, Binance reiniciando ese nodo, etc.), no se aplica
        // ningún enfriamiento — ya se demostró que el camino funciona, así
        // que el próximo pedido de velas (el siguiente cambio de activo, o
        // el refresco automático de cada 60s) simplemente vuelve a abrir
        // el socket de una, sin esperar nada de más.
      };
      ws.addEventListener('close', onGone);
      ws.addEventListener('error', onGone);
    });

    return apiConnectPromise;
  }

  async function apiRequest(method, params) {
    await connectApi();
    const id = `zc${Date.now()}${apiSeq++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        apiPending.delete(id);
        reject(new Error('WS_REQUEST_TIMEOUT'));
      }, REQUEST_TIMEOUT_MS);
      apiPending.set(id, { resolve, reject, timer });
      try {
        apiSocket.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        apiPending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  // Historial de velas — reemplaza las dos llamadas REST de CoinGecko
  // (ohlc + market_chart) por un solo pedido que ya trae el volumen
  // incluido en cada vela, así que no hace falta emparejar nada aparte.
  async function getKlines(symbol, interval, limit) {
    const raw = await apiRequest('klines', { symbol, interval, limit });
    if (!Array.isArray(raw)) throw new Error('WS_BAD_RESPONSE');
    return raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  }

  // -----------------------------------------------------------------
  // Socket "stream": precio en vivo que Binance empuja solo (sin que
  // haya que preguntar), para todos los símbolos suscritos a la vez.
  //
  // Este socket se abre UNA vez al entrar al dashboard o al panel de
  // trading y se queda abierto mientras la persona sigue navegando entre
  // activos — por eso, a diferencia del socket de arriba (que se vuelve a
  // pedir bajo demanda en cada cambio de activo), acá si de verdad importa
  // reconectar solo cuando se cae, para que el precio en vivo no se quede
  // "congelado" en silencio por el resto de la visita.
  // -----------------------------------------------------------------
  let streamSocket = null;
  let streamSymbolsKey = '';
  let streamConnectedOnce = false;
  const streamListeners = new Set();
  let lastStreamSymbols = [];
  let streamReconnectTimer = null;
  // Empieza corto (2s) para que un corte pasajero se sienta instantáneo,
  // y se va alargando si sigue fallando (hasta 20s) para no insistir sin
  // parar contra una red que de verdad tiene el WebSocket bloqueado. Se
  // resetea a 2s apenas se logra conectar bien una vez.
  let streamRetryDelayMs = 2000;
  const STREAM_RETRY_MAX_MS = 20_000;

  function tickerStreamName(symbol) { return `${symbol.toLowerCase()}@ticker`; }

  function scheduleStreamReconnect() {
    if (streamReconnectTimer || !streamListeners.size || !lastStreamSymbols.length) return;
    streamReconnectTimer = setTimeout(() => {
      streamReconnectTimer = null;
      streamSymbolsKey = ''; // fuerza a abrir un socket nuevo con el mismo set de símbolos
      connectStream(lastStreamSymbols);
    }, streamRetryDelayMs);
    streamRetryDelayMs = Math.min(streamRetryDelayMs * 2, STREAM_RETRY_MAX_MS);
  }

  function connectStream(symbols) {
    if (!symbols.length) return;
    lastStreamSymbols = symbols;
    const key = symbols.slice().sort().join(',');
    if (streamSocket && streamSymbolsKey === key) return;
    if (streamSocket) { try { streamSocket.close(); } catch {} }
    if (streamReconnectTimer) { clearTimeout(streamReconnectTimer); streamReconnectTimer = null; }

    streamSymbolsKey = key;
    const streamsParam = symbols.map(tickerStreamName).join('/');
    let ws;
    try {
      ws = new WebSocket(STREAM_URL_BASE + streamsParam);
    } catch {
      scheduleStreamReconnect();
      return;
    }

    const connectTimer = setTimeout(() => {
      if (streamSocket === ws && !streamConnectedOnce) {
        try { ws.close(); } catch {}
      }
    }, CONNECT_TIMEOUT_MS);

    ws.addEventListener('open', () => {
      streamConnectedOnce = true;
      streamRetryDelayMs = 2000; // ya conectó bien: la próxima falla vuelve a empezar corta
      clearTimeout(connectTimer);
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const data = msg.data || msg;
      if (!data || !data.s) return;
      streamListeners.forEach((cb) => {
        try { cb(data); } catch {}
      });
    });
    ws.addEventListener('close', () => {
      clearTimeout(connectTimer);
      if (streamSocket === ws) {
        streamSocket = null;
        streamSymbolsKey = '';
        scheduleStreamReconnect();
      }
    });
    ws.addEventListener('error', () => {});

    streamSocket = ws;
  }

  // symbols: lista de símbolos Binance (ej. ['BTCUSDT','ETHUSDT']) a
  // seguir en vivo. callback recibe el mensaje crudo de Binance (con
  // .s = símbolo, .c = último precio, .P = variación % 24h).
  // Devuelve una función para cancelar la suscripción.
  function onTicker(symbols, callback) {
    connectStream(symbols);
    streamListeners.add(callback);
    return () => streamListeners.delete(callback);
  }

  function isApiAvailable() { return !(apiBrokenUntil && Date.now() < apiBrokenUntil); }
  function isStreamAvailable() { return Boolean(streamSocket && streamConnectedOnce); }

  return { getKlines, onTicker, isApiAvailable, isStreamAvailable };
})();
