// Animación decorativa de la pantalla de acceso (index.html): símbolos de
// inversión (no el código de Matrix literal) cayendo, en tonos de gris que
// combinan con la paleta oscura de la app — una mezcla de símbolos ($, ₿,
// Ξ, %, ▲, ▼) y tickers de monedas (BTC, ETH, SOL, XRP, BNB, ADA, DOGE,
// DOT, LINK, AVAX, LTC, TRX, XAU). Cada uno cae, rebota una o dos veces
// contra un "piso" invisible, rueda un poco mientras se desvanece, y vuelve
// a aparecer arriba — igual que pidió Lucas.
//
// Queda confinado a una franja angosta a la derecha del bloque de texto
// (título, tarjetas de confianza, tarjeta inferior) — como todo ese
// contenido comparte el mismo ancho máximo por la izquierda, cae siempre
// en el espacio vacío sin importar cuánto mida cada sección verticalmente.
// Esto es más robusto que anclarse a un hueco vertical entre dos bloques
// de texto (que puede cerrarse del todo en ventanas más bajas).

(function () {
  const SYMBOLS = [
    '$', '₿', 'Ξ', '%', '▲', '▼', '¢', '€',
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'LTC', 'TRX', 'XAU',
  ];

  const canvas = document.getElementById('invest-rain');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const aside = canvas.closest('.auth-aside');
  if (!aside) return;

  const dpr = window.devicePixelRatio || 1;

  let width = 0;
  let height = 0;
  let bandLeft = 0;
  let bandRight = 0;
  let ceilingY = 0;
  let floorY = 0;
  let particles = [];

  function measure() {
    const asideRect = aside.getBoundingClientRect();
    width = asideRect.width;
    height = asideRect.height;

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Busca el borde derecho más lejano entre los elementos de contenido
    // realmente acotados en ancho (título, párrafo, cada tarjeta de
    // confianza, tarjeta inferior) — la franja empieza justo después de
    // eso. OJO: se mide sobre estos elementos puntuales y NO sobre sus
    // contenedores (.auth-copy / .aside-stats), porque esos son cajas de
    // bloque/flex sin max-width propio: por defecto ocupan todo el ancho
    // disponible del panel aunque el texto de adentro sea angosto, lo que
    // daría un "borde derecho" falso pegado al borde del panel.
    const contentEls = [
      document.querySelector('.auth-copy h1'),
      document.querySelector('.auth-copy p'),
      ...document.querySelectorAll('.aside-stat'),
      document.querySelector('.ai-callout'),
    ].filter(Boolean);

    let contentRight = width * 0.5;
    contentEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      const rightLocal = r.right - asideRect.left;
      if (rightLocal > contentRight) contentRight = rightLocal;
    });

    // OJO: en muchas ventanas "normales" de laptop (1200-1400px de ancho),
    // la fila de tarjetas de confianza (.aside-stats) por sí sola ya ocupa
    // casi todo el ancho disponible del panel, así que el margen que queda
    // a la derecha es angosto — antes se exigía un mínimo de 50px para
    // dibujar algo, y por debajo de eso simplemente no aparecía nada
    // (esto es lo que pasaba en la ventana real de Lucas). Ahora el margen
    // se calcula un poco más generoso (+20 en vez de +30, y solo 20px de
    // aire a la derecha en vez de 32) y el umbral de "no hay espacio" baja
    // a 18px, así que casi siempre queda una franja visible, aunque sea
    // angosta — el texto igual queda siempre por encima (z-index) así que
    // no hay riesgo de que la lluvia tape ninguna letra.
    bandLeft = Math.min(contentRight + 20, width - 40);
    bandRight = width - 20;

    ceilingY = 28;
    floorY = height - 28;
  }

  function spawn(midAir) {
    const char = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const isTicker = char.length > 1;
    const bandWidth = Math.max(1, bandRight - bandLeft);
    // En franjas angostas los símbolos se achican para que no se corten
    // contra el borde del canvas.
    const shrink = Math.min(1, bandWidth / 70);
    const size = (isTicker ? 10 + Math.random() * 4 : 13 + Math.random() * 8) * (0.55 + 0.45 * shrink);
    const gray = 180 + Math.floor(Math.random() * 65);
    return {
      x: bandLeft + Math.random() * (bandRight - bandLeft),
      y: midAir ? ceilingY + Math.random() * (floorY - ceilingY) : ceilingY - Math.random() * 40,
      vy: 0.32 + Math.random() * 0.38,
      vx: 0,
      rotation: 0,
      char,
      size,
      gray,
      opacity: 0.22 + Math.random() * 0.26,
      bounces: 0,
      rolling: false,
    };
  }

  function init() {
    measure();
    particles = [];
    if (floorY - ceilingY < 100 || bandRight - bandLeft < 18) return; // sin espacio suficiente

    const count = Math.max(3, Math.min(16, Math.round((bandRight - bandLeft) / 40)));
    for (let i = 0; i < count; i++) particles.push(spawn(true));
  }

  function step() {
    if (particles.length) {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        if (!p.rolling) {
          p.vy += 0.016; // gravedad — un poco más rápido que la primera versión
          p.y += p.vy;
          if (p.y >= floorY) {
            p.y = floorY;
            p.bounces += 1;
            p.vy = -p.vy * 0.35; // rebote
            if (p.bounces >= 2 || Math.abs(p.vy) < 0.35) {
              p.rolling = true;
              p.vy = 0;
              p.vx = (Math.random() - 0.5) * 0.7;
            }
          }
        } else {
          p.x += p.vx;
          p.vx *= 0.96; // fricción: se va deteniendo mientras "rueda"
          p.rotation += p.vx * 0.06;
          p.opacity -= 0.0035; // se desvanece
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = `rgb(${p.gray}, ${p.gray}, ${p.gray})`;
        ctx.font = `${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
      });

      particles = particles.map((p) => (p.opacity <= 0 ? spawn(false) : p));
    }
    requestAnimationFrame(step);
  }

  init();
  window.addEventListener('resize', init);
  requestAnimationFrame(step);
})();
