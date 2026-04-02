/* ============================================================
   actions.js — Panel de Acciones operativas del día
   Mejora 1

   EmailJS template para envío manual: ACTIONS_TEMPLATE_ID
   Variables esperadas en el template:
     {{date}}, {{actions_summary}}, {{generated_at}}
   ============================================================ */

/** Clave de localStorage para acciones del día actual */
function _actionsKey() {
  return `fleet_actions_${getTodayString()}`;
}

/** Carga las acciones del día desde localStorage */
function loadActions() {
  try {
    return JSON.parse(localStorage.getItem(_actionsKey()) || '[]');
  } catch {
    return [];
  }
}

/** Persiste las acciones del día en localStorage y limpia días anteriores */
function saveActions(actions) {
  const key = _actionsKey();
  // Limpiar registros de días anteriores
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('fleet_actions_') && k !== key) {
      localStorage.removeItem(k);
    }
  }
  localStorage.setItem(key, JSON.stringify(actions));
}

/**
 * Abre el modal de acciones, popula los selects dinámicos
 * y renderiza la lista actual.
 */
function openActionsModal() {
  _populateActionsSelects();
  renderActionsList();
  document.getElementById('actionsModal').style.display = 'flex';
}

/** Puebla los selects del formulario con datos de APP_STATE.rawData */
function _populateActionsSelects() {
  const depositos  = new Set();
  const clientes   = new Set();
  const vehiculos  = new Set();
  const conductores = new Set();

  APP_STATE.rawData.forEach(stop => {
    if (stop.schema_name)  depositos.add(stop.schema_name);
    if (stop.vehicle_code) vehiculos.add(stop.vehicle_code);
    if (stop.driver_name)  conductores.add(stop.driver_name);
    (stop.orders || []).forEach(o => {
      if (o.supplier_name) clientes.add(o.supplier_name);
    });
  });

  fillSelect('actionDeposito',  [...depositos].sort());
  fillSelect('actionCliente',   [...clientes].sort());
  fillSelect('actionVehiculo',  [...vehiculos].sort());
  fillSelect('actionConductor', [...conductores].sort());
}

/**
 * Guarda una nueva acción desde el formulario del modal.
 * La descripción es obligatoria; el resto son opcionales.
 */
function saveAction() {
  const desc = document.getElementById('actionDescripcion')?.value.trim();
  if (!desc) {
    alert('La descripción / observación es obligatoria.');
    return;
  }

  const action = {
    id:           Date.now(),
    timestamp:    new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    date:         getTodayString(),
    deposito:     document.getElementById('actionDeposito')?.value   || '',
    cliente:      document.getElementById('actionCliente')?.value    || '',
    codigo_orden: document.getElementById('actionCodigoOrden')?.value.trim() || '',
    vehiculo:     document.getElementById('actionVehiculo')?.value   || '',
    conductor:    document.getElementById('actionConductor')?.value  || '',
    descripcion:  desc,
  };

  const actions = loadActions();
  actions.push(action);
  saveActions(actions);

  // Limpiar campos del formulario
  document.getElementById('actionDescripcion').value = '';
  document.getElementById('actionCodigoOrden').value = '';
  ['actionDeposito', 'actionCliente', 'actionVehiculo', 'actionConductor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  renderActionsList();
}

/**
 * Elimina una acción por su ID.
 * @param {number} id
 */
function deleteAction(id) {
  const actions = loadActions().filter(a => a.id !== id);
  saveActions(actions);
  renderActionsList();
}

/**
 * Renderiza la lista de acciones del día dentro del modal,
 * ordenadas por hora DESC.
 */
function renderActionsList() {
  const container = document.getElementById('actionsListContainer');
  if (!container) return;

  const actions = loadActions().slice().reverse(); // DESC

  if (actions.length === 0) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:12px;padding:10px 0;">Sin acciones registradas hoy.</p>';
    return;
  }

  container.innerHTML = actions.map(a => {
    const parts = [];
    if (a.deposito)     parts.push(`Suc: ${esc(a.deposito)}`);
    if (a.cliente)      parts.push(`Cliente: ${esc(a.cliente)}`);
    if (a.codigo_orden) parts.push(`Orden: ${esc(a.codigo_orden)}`);
    if (a.vehiculo)     parts.push(`Veh: ${esc(a.vehiculo)}`);
    if (a.conductor)    parts.push(`Cond: ${esc(a.conductor)}`);
    const meta = parts.length > 0 ? parts.join(' | ') : 'General';

    return `<div class="action-item">
      <div class="action-item-meta">
        <span class="action-item-time">[${a.timestamp}]</span>
        <span class="action-item-ctx" title="${meta}">${meta}</span>
        <button class="action-delete-btn" onclick="deleteAction(${a.id})" title="Eliminar">✕</button>
      </div>
      <div class="action-item-desc">${esc(a.descripcion)}</div>
    </div>`;
  }).join('');
}

/**
 * Genera el texto de resumen de acciones del día para incluir en emails.
 * Usado por closure.js en closeDayProcedure().
 * @returns {string}
 */
function getActionsSummaryText() {
  const actions = loadActions();
  if (actions.length === 0) return 'Sin acciones registradas';

  return actions.map(a => {
    const parts = [];
    if (a.deposito)     parts.push(`Sucursal: ${a.deposito}`);
    if (a.cliente)      parts.push(a.cliente);
    if (a.vehiculo)     parts.push(`Vehículo: ${a.vehiculo}`);
    if (a.conductor)    parts.push(`Conductor: ${a.conductor}`);
    if (a.codigo_orden) parts.push(`Orden: ${a.codigo_orden}`);
    const ctx = parts.length > 0 ? parts.join(' | ') : 'General';
    return `[${a.timestamp}] ${ctx} | Descripción: ${a.descripcion}`;
  }).join('\n');
}

/**
 * Envía las acciones del día por email vía EmailJS (template_3jqa29v).
 * Se dispara desde el botón "Enviar acciones" del modal.
 */
async function sendActionsEmail() {
  if (
    !ACTIONS_TEMPLATE_ID ||
    ACTIONS_TEMPLATE_ID === '[REEMPLAZAR_CON_ACTIONS_TEMPLATE_ID]'
  ) {
    alert('⚠️ Template de acciones no configurado. Crear template_3jqa29v en EmailJS y actualizar ACTIONS_TEMPLATE_ID en config.js.');
    return;
  }

  const summary = getActionsSummaryText();
  if (summary === 'Sin acciones registradas') {
    alert('No hay acciones registradas hoy para enviar.');
    return;
  }

  const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, ACTIONS_TEMPLATE_ID, {
      date:            getTodayString(),
      actions_summary: summary,
      generated_at:    now,
    });
    alert('✅ Acciones enviadas por email correctamente.');
  } catch (err) {
    alert(`Error al enviar: ${err.text || err.message || 'desconocido'}`);
  }
}
