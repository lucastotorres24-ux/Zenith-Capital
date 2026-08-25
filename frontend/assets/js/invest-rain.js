// Animación decorativa de la pantalla de acceso (index.html): "lluvia" tipo
// Matrix con símbolos de inversión y tickers de moneda ($, ₿, Ξ, %, ▲, ▼,
// BTC, ETH, SOL...) en vez del código Matrix original — mismo espíritu
// (columnas cayendo con una cabeza brillante y una estela que se desvanece
// detrás, como un destello dejando rastro) pero con el vocabulario visual
// de la plataforma en vez de katakana random.
//
// A diferencia de la versión anterior (partículas rebotando en una franja
// angosta a la derecha del texto), esta versión ocupa TODO el panel
// ("usa el centro de la página", como pidió Lucas) con columnas más juntas,
// más figuras y más velocidad — más estilo Matrix real. Para que el texto
// que queda encima (título, tarjetas de confianza, tarjeta de IA) se siga
// leyendo perfecto y la app se vea profesional y no saturada, la lluvia no
// se corta de golpe detrás de esos bloques: se atenúa bastante (no
// desaparece del todo, para no perder la columna completa) justo en esa
// zona, con un margen de aire alrededor.

(function () {
  const SYMBOLS = [
    '$', '₿', 'Ξ', '%', '▲', '▼', '¢', '€',
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'LTC', 'TRX', 'XAU',
  ];

  // Color de la "cabeza" (el carácter con destello al frente de cada
  // columna) — tonos de marca (dorado / azul) en vez del verde clásico de
  // Matrix, para que combine con el resto del diseño en vez de desentonar
  // con lo profesional de la empresa.
  const GLOW_COLORS = [
    { core: 'rgba(255, 244, 214, 0.95)', shadow: 'rgba(201, 162, 77, 0.9)' }, // dorado
    { core: 'rgba(214, 236, 255, 0.95)', shadow: 'rgba(57, 135, 229, 0.9)' }, // azul
  ];

  const canvas = document.getElementById('invest-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const aside = canvas.closest('.auth-aside');
  if (!aside) return;

  const dpr = window.devicePixelRatio || 1;
  const DIM_FACTOR = 0.16; // qué tanto se atenúa la lluvia detrás del texto (no se apaga del todo)
  const CONTENT_PADDING = 16; // aire alrededor de cada bloque de texto antes de atenuar
  const COL_WIDTH = 24; // más angosto que antes = columnas más juntas = "más figuras"

  let width = 0;
  let height = 0;
  let columns = [];
  let contentRects = [];

  function measureContentRects(asideRect) {
    const els = [
      document.querySelector('.auth-copy h1'),
      document.querySelector('.auth-copy p'),
      ...document.querySelectorAll('.aside-stat'),
      document.querySelector('.ai-callout'),
    ].filter(Boolean);

    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - asideRect.left - CONTENT_PADDING,
        right: r.right - asideRect.left + CONTENT_PADDING,
        top: r.top - asideRect.top - CONTENT_PADDING,
        bottom: r.bottom - asideRect.top + CONTENT_PADDING,
      };
    });
  }

  function dimAt(x, y) {
    for (let i = 0; i < contentRects.length; i++) {
      const r = contentRects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return DIM_FACTOR;
    }
    return 1;
  }

  function randomSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  function makeColumn(x, spawnMidAir) {
    const fontSize = 13 + Math.random() * 6;
    const rowHeight = fontSize * 1.15;
    const trailCount = 7 + Math.floor(Math.random() * 6);
    return {
      x,
      fontSize,
      rowHeight,
      trailCount,
      speed: 0.9 + Math.random() * 1.7, // más rápido y variado que la versión anterior
      headY: spawnMidAir
        ? Math.random() * (height + trailCount * rowHeight) - trailCount * rowHeight
        : -Math.random() * 300,
      glow: GLOW_COLORS[Math.floor(Math.random() * GLOW_COLORS.length)],
      trail: Array.from({ length: trailCount }, randomSymbol),
    };
  }

  function measure() {
    const asideRect = aside.getBoundingClientRect();
    width = asideRect.width;
    height = asideRect.height;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    contentRects = measureContentRects(asideRect);

    // Columnas de pared a pared del panel — antes quedaban confinadas a una
    // franja angosta a la derecha; ahora usan todo el ancho, incluido el
    // centro, como pidió Lucas.
    const colCount = Math.max(8, Math.round(width / COL_WIDTH));
    columns = [];
    for (let i = 0; i < colCount; i++) {
      const x = (i + 0.5) * (width / colCount);
      columns.push(makeColumn(x, true));
    }
  }

  function step() {
    if (width && height) {
      ctx.clearRect(0, 0, width, height);

      columns.forEach((col, idx) => {
        col.headY += col.speed;

        const totalSpan = col.trailCount * col.rowHeight;
        if (col.headY - totalSpan > height + 40) {
          columns[idx] = makeColumn(col.x, false);
          return;
        }

        ctx.textAlign = 'center';

        // Estela detrás de la cabeza: del carácter más viejo (más arriba,
        // más tenue) al más nuevo — el "rastro" que deja el destello al
        // caer, sin parpadeo porque cada columna guarda sus propios
        // caracteres en vez de recalcularlos cada frame.
        for (let i = col.trailCount - 1; i >= 1; i--) {
          const y = col.headY - i * col.rowHeight;
          if (y < -col.rowHeight || y > height + col.rowHeight) continue;

          const fade = Math.pow(0.8, i);
          const dim = dimAt(col.x, y);
          const char = col.trail[col.trail.length - 1 - i];
          const isTicker = char.length > 1;

          ctx.save();
          ctx.font = `${isTicker ? col.fontSize * 0.8 : col.fontSize}px 'Courier New', ui-monospace, monospace`;
          ctx.globalAlpha = Math.max(0.05, fade * 0.55) * dim;
          ctx.fillStyle = 'rgb(198, 210, 224)';
          ctx.fillText(char, col.x, y);
          ctx.restore();
        }

        // Cabeza: el carácter brillante al frente, con destello
        // (shadowBlur) en el color de marca de la columna — el efecto
        // Matrix que pidió Lucas.
        if (col.headY > -col.rowHeight && col.headY < height + col.rowHeight) {
          const headChar = col.trail[col.trail.length - 1];
          const isTicker = headChar.length > 1;
          const headDim = dimAt(col.x, col.headY);

          ctx.save();
          ctx.font = `${isTicker ? col.fontSize * 0.85 : col.fontSize * 1.05}px 'Courier New', ui-monospace, monospace`;
          ctx.globalAlpha = 0.95 * headDim;
          ctx.shadowColor = col.glow.shadow;
          ctx.shadowBlur = 10 * headDim + 2;
          ctx.fillStyle = col.glow.core;
          ctx.fillText(headChar, col.x, col.headY);
          ctx.restore();
        }

        // De vez en cuando cambia un carácter de la estela (parpadeo sutil,
        // como en Matrix) sin recalcular todo el arreglo cada frame.
        if (Math.random() < 0.02) {
          col.trail[Math.floor(Math.random() * col.trail.length)] = randomSymbol();
        }
      });
    }

    requestAnimationFrame(step);
  }

  measure();
  window.addEventListener('resize', measure);
  requestAnimationFrame(step);
})();
