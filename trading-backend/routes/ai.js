// Análisis de portafolio con IA (OpenAI). Llama a la API de OpenAI del lado
// del servidor (así la API key nunca queda expuesta en el navegador).
//
// IMPORTANTE sobre el modelo: los nombres de modelo de OpenAI cambian con
// frecuencia. OPENAI_MODEL es configurable por variable de entorno
// precisamente por eso — verifica en tu dashboard de OpenAI
// (platform.openai.com) cuál es el modelo económico vigente antes de usar
// esto en serio, y ajusta OPENAI_MODEL en tu .env si hace falta.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAccountsByUser } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Cada request a esta ruta cuesta dinero real (llamada a OpenAI), así que el
// límite es más estricto que en auth: máximo 15 análisis por hora por IP.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Alcanzaste el límite de análisis por hora. Intenta más tarde.' },
});

const CRYPTO_IDS = ['bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'ripple'];

async function fetchCryptoSnapshot() {
  try {
    const ids = CRYPTO_IDS.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // si el mercado no responde, seguimos solo con las cuentas
  }
}

function buildPrompt(accounts, prices) {
  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalEquity = accounts.reduce((sum, a) => sum + Number(a.equity), 0);
  const totalPl = totalEquity - totalBalance;

  const accountLines =
    accounts
      .map(
        (a) =>
          `- ${a.accountNumber} (${a.accountType}, ${a.currency}): balance ${a.balance}, equity ${a.equity}, apalancamiento ${a.leverage}`
      )
      .join('\n') || '- (el usuario todavía no tiene cuentas creadas)';

  const priceLines = prices
    ? Object.entries(prices)
        .map(([id, p]) => `- ${id}: $${p.usd} (${(p.usd_24h_change ?? 0).toFixed(2)}% en 24h)`)
        .join('\n')
    : '- (precios de mercado no disponibles en este momento)';

  return `Eres el asistente de análisis de Zenith Capital, una plataforma de PRÁCTICA para aprender sobre trading e inversión. Los datos de cuentas son simulados y esto NO es asesoría financiera real.

Resumen de cuentas del usuario:
${accountLines}

Totales: balance ${totalBalance.toFixed(2)}, equity ${totalEquity.toFixed(2)}, P/L flotante ${totalPl.toFixed(2)}.

Precios de mercado actuales (cripto, USD):
${priceLines}

Escribe un análisis breve (máximo 120 palabras), en español, con tono profesional pero cercano, que:
1) comente el estado general de las cuentas (P/L flotante, diversificación),
2) mencione qué está haciendo el mercado cripto ahora mismo según los datos de arriba,
3) cierre con una nota clara de que esto es contenido educativo/ilustrativo, no una recomendación de inversión.
No inventes datos que no te di arriba.`;
}

router.post('/insights', aiLimiter, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error:
        'La función de IA no está configurada todavía. Define OPENAI_API_KEY en el archivo .env del backend.',
    });
  }

  const accounts = getAccountsByUser(req.user.id);
  const prices = await fetchCryptoSnapshot();
  const prompt = buildPrompt(accounts, prices);
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 260,
        temperature: 0.6,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || `OpenAI respondió con estado ${response.status}`;
      return res.status(502).json({ error: `OpenAI: ${message}` });
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return res.status(502).json({ error: 'OpenAI no devolvió contenido para analizar.' });
    }

    res.json({ insight: text, model, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo conectar con la API de OpenAI. Intenta de nuevo.' });
  }
});

module.exports = router;
