/* ============================================================
   state.js — Estado global + helpers reutilizables
   ============================================================ */

const APP_STATE = {
  rawData:        [],
  filteredOrders: [],
  driversMap:     {},   // { email: { phone, ... } }
  addressesMap:   {},   // { address_code: { phone, ... } }

  // Tabla principal
  currentPage: 1,
  pageSize:    PAGE_SIZE,
  sortCol:     null,
  sortDir:     'asc',

  // Tabla de conductores
  driversPage:    1,
  driversPageSize: 15,
  driversSort:    { col: null, dir: 'asc' },

  // Mejora 5: filtro de estado de ruta ('all' | 'not_started' | 'in_progress' | 'finished')
  routeFilter: 'all',

  // Login: depósitos permitidos para perfil monitoreosuc (null = sin restricción)
  userDepositos: null,

  // Mejora 7: códigos de órdenes ya notificados como "Domicilio No Visitado"
  knownDomicilioNoVisitado: new Set(),

  charts: {
    barras: null,
    dona:   null,
  },
  lastUpdate: null,
  isLoading:  false,
};

/* ============================================================
   HELPERS DE TIEMPO
   ============================================================ */

/**
 * Calcula el tiempo en ruta para un stop.
 * Retorna "en-curso", "—", o "Xh Ym".
 */
function calcRouteTime(stop) {
  const inicio = stop.route_started_at;
  if (!inicio) return '—';
  const inicioMs = new Date(inicio).getTime();
  if (isNaN(inicioMs)) return '—';

  const orders   = stop.orders || [];
  const arrivals = orders
    .map(o => o.pod_arrival)
    .filter(Boolean)
    .map(t => new Date(t).getTime())
    .filter(t => !isNaN(t));

  let finMs;
  if (arrivals.length > 0) {
    finMs = Math.max(...arrivals);
  } else if (stop.route_finished_at) {
    finMs = new Date(stop.route_finished_at).getTime();
  } else {
    return 'en-curso';
  }

  const diffMs = finMs - inicioMs;
  if (diffMs < 0) return '—';
  const totalMin = Math.floor(diffMs / 60000);
  const horas    = Math.floor(totalMin / 60);
  const mins     = totalMin % 60;
  return horas > 0 ? `${horas}h ${mins}m` : `${mins}m`;
}

/** Formatea una fecha ISO a HH:MM local */
function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/* ============================================================
   HELPERS DE UI
   ============================================================ */

function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\+\-\(\)\.]/g, '');
}

function showCopyTooltip(event) {
  const tooltip = document.getElementById('copyTooltip');
  if (!tooltip) return;
  tooltip.style.left = (event.clientX + 10) + 'px';
  tooltip.style.top  = (event.clientY - 28) + 'px';
  tooltip.classList.add('show');
  setTimeout(() => tooltip.classList.remove('show'), 1800);
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.style.display = 'none';
}

/* ============================================================
   HELPERS DE RENDER
   ============================================================ */

function renderContactButtons(phone) {
  if (!phone) return `<span class="no-phone">Sin teléfono</span>`;
  const p = cleanPhone(phone);
  const phoneEsc = phone.replace(/'/g, "\\'");
  return `
    <div class="contact-buttons">
      <button class="btn-contact"
        onclick="navigator.clipboard.writeText('${phoneEsc}').then(()=>showCopyTooltip(event))"
        title="Copiar número">📋</button>
      <a class="btn-contact" href="https://wa.me/${p}" target="_blank" title="WhatsApp">💬</a>
      <a class="btn-contact" href="tel:${phone}" title="Llamar">📞</a>
    </div>`;
}

/** Badge de estado. Soporta 'approved', 'delivered', 'rejected', 'pending', 'partial'. */
function renderStatusBadge(status) {
  if (!status) return '—';
  const map = {
    approved:  ['badge--delivered', 'Aprobado'],
    delivered: ['badge--delivered', 'Entregado'],
    rejected:  ['badge--rejected',  'Rechazado'],
    pending:   ['badge--pending',   'Pendiente'],
    partial:   ['badge--other',     'Parcial'],
  };
  const [cls, txt] = map[status] || ['badge--other', status];
  return `<span class="badge ${cls}">${txt}</span>`;
}

function renderCategoryBadge(category) {
  if (!category) return '—';
  if (category === 'delivery') return `<span class="badge badge--delivery">Entrega</span>`;
  if (category === 'pickup')   return `<span class="badge badge--pickup">Retiro</span>`;
  return `<span class="badge badge--other">${category}</span>`;
}

function effectivenessClass(pct) {
  if (pct < 70) return 'eff--danger';
  if (pct < 90) return 'eff--warning';
  return 'eff--success';
}

function esc(str) {
  if (str == null) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Genera números de página con elipsis — compartido entre tablas */
function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}
