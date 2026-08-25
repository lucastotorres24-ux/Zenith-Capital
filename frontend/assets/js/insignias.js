// Lógica de la página "Insignias Zenith" (insignias.html): explica los 5
// rangos y calcula en qué rango está la persona ahora mismo, usando la
// misma fórmula que el dashboard (balance de cuentas + valor de holdings).

const RANK_TIERS = [
  { key: 'platino', label: 'Platino', min: 10000 },
  { key: 'diamante', label: 'Diamante', min: 5000 },
  { key: 'oro', label: 'Oro', min: 1500 },
  { key: 'plata', label: 'Plata', min: 800 },
  { key: 'bronce', label: 'Bronce', min: 250 },
];

// Contenido "de vitrina": privilegios inventados para que cada rango se
// sienta como un logro real dentro de la plataforma de práctica. Diamante
// y Platino incluyen automatización real de inversión (ver Asesoría IA en
// el dashboard, solo visible desde Diamante en adelante).
const TIER_CONTENT = {
  bronce: {
    icon: '🥉',
    tagline: 'Tu primer paso como inversionista Zenith.',
    perks: [
      'Cuenta verificada con insignia Bronce visible en tu perfil.',
      'Acceso completo al panel de trading Sube/Baja y a los mercados en vivo.',
      'Participación en la Comunidad Zenith.',
    ],
  },
  plata: {
    icon: '🥈',
    tagline: 'Empiezas a construir un historial serio.',
    perks: [
      'Todos los beneficios del rango Bronce.',
      'Prioridad en la revisión de tus depósitos y retiros.',
      'Reportes de Análisis con IA más detallados sobre tus cuentas.',
    ],
  },
  oro: {
    icon: '🥇',
    tagline: 'Tu perfil ya se mueve entre los inversionistas más comprometidos.',
    perks: [
      'Todos los beneficios del rango Plata.',
      'Gestor de cuenta dedicado para dudas, depósitos y retiros.',
      'Acceso anticipado a nuevos activos y funciones de la plataforma.',
    ],
  },
  diamante: {
    icon: '💎',
    tagline: 'Nivel premium: Zenith empieza a invertir por ti.',
    perks: [
      'Todos los beneficios del rango Oro.',
      'Asesoría IA avanzada y personalizada según tu perfil de riesgo.',
      'Automatización real de inversión: el sistema puede ejecutar operaciones por ti, dentro de límites de riesgo definidos.',
    ],
    highlight: true,
  },
  platino: {
    icon: '👑',
    tagline: 'El nivel más alto de Zenith Capital.',
    perks: [
      'Todos los beneficios del rango Diamante.',
      'Automatización de inversión con ajustes en tiempo real y prioridad máxima de ejecución.',
      'Línea directa con el equipo de Zenith Capital y condiciones preferenciales.',
    ],
    highlight: true,
  },
};

// Orden ascendente para pintar la grilla (Bronce primero, Platino al final).
const TIERS_ASC = [...RANK_TIERS].reverse();

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  renderTierGrid();
  loadInvestedTotal();
});

function renderUserChip() {
  const user = Api.getUser();
  const name = user?.username || 'Usuario';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-initial').textContent = name.charAt(0).toUpperCase();
}

function wireLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    Api.clearSession();
    window.location.href = 'index.html';
  });
}

function getRankForAmount(amount) {
  return RANK_TIERS.find((t) => amount >= t.min) || null;
}

async function loadInvestedTotal() {
  try {
    const [accounts, holdings] = await Promise.all([Api.getAccounts(), Api.getHoldings()]);
    const balanceTotal = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    // Aproximación con el precio promedio de compra (esta página no corre
    // el ticker en vivo): suficiente para mostrar el progreso de rango.
    const holdingsTotal = holdings.reduce((sum, h) => sum + Number(h.quantity || 0) * Number(h.avgPrice || 0), 0);
    const total = balanceTotal + holdingsTotal;
    renderCurrentRank(total);
  } catch (err) {
    document.getElementById('insignias-current-value').textContent = 'No se pudo calcular';
    document.getElementById('insignias-progress-note').textContent =
      'No pudimos cargar tus cuentas en este momento.';
  }
}

function renderCurrentRank(total) {
  const rank = getRankForAmount(total);
  const valueEl = document.getElementById('insignias-current-value');
  const fillEl = document.getElementById('insignias-progress-fill');
  const noteEl = document.getElementById('insignias-progress-note');

  valueEl.textContent = rank ? `★ Zenith ${rank.label}` : 'Sin rango todavía';
  valueEl.className = `insignias-current-value${rank ? ` rank-${rank.key}` : ''}`;

  const currentIndex = rank ? TIERS_ASC.findIndex((t) => t.key === rank.key) : -1;
  const nextTier = TIERS_ASC[currentIndex + 1];

  if (nextTier) {
    const floor = rank ? rank.min : 0;
    const progress = Math.min(100, Math.max(0, ((total - floor) / (nextTier.min - floor)) * 100));
    fillEl.style.width = `${progress.toFixed(1)}%`;
    fillEl.className = `insignias-progress-fill${rank ? ` rank-${rank.key}` : ''}`;
    const missing = Math.max(0, nextTier.min - total);
    noteEl.textContent = `Te faltan ${money(missing)} para alcanzar el rango ${nextTier.label}.`;
  } else {
    fillEl.style.width = '100%';
    fillEl.className = 'insignias-progress-fill rank-platino';
    noteEl.textContent = '¡Llegaste al rango más alto de Zenith Capital!';
  }

  markActiveTierCard(rank ? rank.key : null);
}

function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function renderTierGrid() {
  const grid = document.getElementById('insignias-grid');
  grid.innerHTML = TIERS_ASC.map((tier) => {
    const content = TIER_CONTENT[tier.key];
    return `
      <div class="insignia-card rank-${tier.key}${content.highlight ? ' is-premium' : ''}" data-tier="${tier.key}">
        <div class="insignia-card-badge" id="insignia-card-badge-${tier.key}"></div>
        <div class="insignia-card-icon">${content.icon}</div>
        <h3>Zenith ${tier.label}</h3>
        <div class="insignia-card-req">Desde ${money(tier.min)} invertidos</div>
        <p class="insignia-card-tagline">${escapeHtml(content.tagline)}</p>
        <ul class="insignia-card-perks">
          ${content.perks.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
        </ul>
        ${content.highlight ? '<span class="insignia-card-premium-tag">Automatización real</span>' : ''}
      </div>
    `;
  }).join('');
}

function markActiveTierCard(activeKey) {
  document.querySelectorAll('.insignia-card').forEach((card) => {
    const isActive = card.dataset.tier === activeKey;
    card.classList.toggle('is-current', isActive);
    const badgeEl = card.querySelector('.insignia-card-badge');
    if (badgeEl) badgeEl.textContent = isActive ? 'TU RANGO ACTUAL' : '';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
