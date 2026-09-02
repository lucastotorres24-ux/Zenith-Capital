// Lógica de la página "Planes de Inversión" (planes.html) — reemplaza a la
// antigua "Insignias Zenith" (rangos). El sistema de rangos/insignias
// (badge del header, gating de la Asesoría IA avanzada) sigue existiendo
// tal cual en dashboard.js — esto es una cosa aparte: una selección rápida
// de monto sugerido para el próximo depósito, con una calculadora de
// proyección educativa.
//
// IMPORTANTE (seguridad/ética): sigue siendo 100% simulación. Ningún plan
// procesa dinero real, ninguno garantiza ni promete un rendimiento — la
// calculadora de ROI usa una tasa que el propio usuario elige con un
// slider, solo para explorar "qué pasaría si", nunca un número que Zenith
// Capital ofrezca o prometa.

const INVESTMENT_PLANS = [
  {
    key: 'bronce',
    label: 'Plan Bronce',
    amount: 250,
    icon: '🥉',
    tagline: 'Tu primer paso como inversionista Zenith.',
    features: [
      'Acceso completo al panel de trading Sube/Baja y a los mercados en vivo.',
      'Participación en la Comunidad Zenith.',
      'Historial de depósitos visible en tu Quick Ledger.',
    ],
  },
  {
    key: 'plata',
    label: 'Plan Plata',
    amount: 800,
    icon: '🥈',
    tagline: 'Empiezas a construir un historial serio.',
    features: [
      'Todo lo del Plan Bronce.',
      'Prioridad en la revisión de tus depósitos y retiros.',
      'Acceso a Petróleo, Forex e Índices en el panel de trading.',
    ],
  },
  {
    key: 'oro',
    label: 'Plan Oro',
    amount: 1500,
    icon: '🥇',
    tagline: 'Tu perfil se mueve entre los inversionistas más comprometidos.',
    features: [
      'Todo lo del Plan Plata.',
      'Gestor de cuenta dedicado para dudas, depósitos y retiros.',
      'Acceso anticipado a nuevos activos y funciones de la plataforma.',
    ],
  },
  {
    key: 'diamante',
    label: 'Plan Diamante',
    amount: 3000,
    icon: '💎',
    tagline: 'Nivel premium dentro de Zenith Capital.',
    features: [
      'Todo lo del Plan Oro.',
      'Elegible para la Asesoría IA avanzada (según tu rango de cuenta).',
      'Línea de atención prioritaria con el equipo de Zenith Capital.',
    ],
    highlight: true,
  },
  {
    key: 'rubi',
    label: 'Plan Rubí',
    amount: 5000,
    icon: '❤️',
    tagline: 'El plan sugerido más alto de Zenith Capital.',
    features: [
      'Todo lo del Plan Diamante.',
      'Condiciones preferenciales y revisión exprés de tus movimientos.',
      'Acceso completo a todas las funciones simuladas de la plataforma.',
    ],
    highlight: true,
  },
];

let selectedRoiPlanKey = INVESTMENT_PLANS[0].key;

document.addEventListener('DOMContentLoaded', () => {
  if (!Api.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  renderUserChip();
  wireLogout();
  renderPlanCards();
  wireRoiCalculator();
  updateRoiProjection();
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

function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPlanCards() {
  const grid = document.getElementById('planes-grid');
  grid.innerHTML = INVESTMENT_PLANS.map((plan) => `
    <div class="plan-card${plan.highlight ? ' is-premium' : ''}" data-plan="${plan.key}">
      <div class="plan-card-icon">${plan.icon}</div>
      <h3>${escapeHtml(plan.label)}</h3>
      <div class="plan-card-amount">${money(plan.amount)}</div>
      <p class="plan-card-tagline">${escapeHtml(plan.tagline)}</p>
      <ul class="plan-card-features">
        ${plan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>
      <button type="button" class="btn ${plan.highlight ? 'btn-primary' : 'btn-secondary'} btn-block" data-select-plan="${plan.key}">
        Seleccionar y depositar
      </button>
    </div>
  `).join('');

  grid.querySelectorAll('[data-select-plan]').forEach((btn) => {
    btn.addEventListener('click', () => selectPlanForDeposit(btn.dataset.selectPlan));
  });

  // Selector de la calculadora: se llena con los mismos planes, en el mismo orden.
  const select = document.getElementById('roi-plan-select');
  select.innerHTML = INVESTMENT_PLANS.map((p) => `<option value="${p.key}">${escapeHtml(p.label)} — ${money(p.amount)}</option>`).join('');
  select.value = selectedRoiPlanKey;
}

// Guarda a qué plan corresponde el depósito que la persona está por hacer
// (para que el Quick Ledger del dashboard pueda mostrar el nombre del plan
// y su estado de activación) y la manda directo a la pantalla de depósito
// con el monto del plan ya cargado. Nunca se salta la revisión manual: el
// depósito sigue quedando "en proceso" hasta que el equipo de Zenith
// Capital lo confirme, exactamente igual que cualquier otro depósito.
function selectPlanForDeposit(planKey) {
  const plan = INVESTMENT_PLANS.find((p) => p.key === planKey);
  if (!plan) return;

  try {
    localStorage.setItem('zenith_pending_plan', JSON.stringify({ key: plan.key, label: plan.label, amount: plan.amount }));
  } catch (e) {
    // localStorage no disponible (modo privado, etc.) — el depósito igual
    // funciona, solo que el Quick Ledger no podrá etiquetarlo con el plan.
  }

  window.location.href = `dashboard.html?planKey=${encodeURIComponent(plan.key)}&planAmount=${plan.amount}`;
}

// ---------------------------------------------------------------------
// Calculadora de proyección (ROI simulado) — puramente educativa: interés
// compuesto sobre una tasa mensual que la propia persona elige con el
// slider, nunca un número que la plataforma ofrezca, sugiera o prometa.
// ---------------------------------------------------------------------

function wireRoiCalculator() {
  document.getElementById('roi-plan-select').addEventListener('change', (e) => {
    selectedRoiPlanKey = e.target.value;
    updateRoiProjection();
  });

  const slider = document.getElementById('roi-rate-slider');
  slider.addEventListener('input', () => {
    document.getElementById('roi-rate-value').textContent = `${Number(slider.value).toFixed(1)}%`;
    updateRoiProjection();
  });
}

function updateRoiProjection() {
  const plan = INVESTMENT_PLANS.find((p) => p.key === selectedRoiPlanKey) || INVESTMENT_PLANS[0];
  const monthlyRate = Number(document.getElementById('roi-rate-slider').value) / 100;
  document.getElementById('roi-rate-value').textContent = `${(monthlyRate * 100).toFixed(1)}%`;

  [30, 60, 90].forEach((days) => {
    const months = days / 30;
    const projected = plan.amount * Math.pow(1 + monthlyRate, months);
    const gain = projected - plan.amount;
    document.getElementById(`roi-value-${days}`).textContent = money(projected);
    const gainEl = document.getElementById(`roi-gain-${days}`);
    gainEl.textContent = `${gain >= 0 ? '+' : ''}${money(gain)}`;
    gainEl.classList.toggle('is-up', gain > 0);
    gainEl.classList.toggle('is-flat', gain === 0);
  });
}
