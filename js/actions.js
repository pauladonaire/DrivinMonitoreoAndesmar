/* ============================================================
   actions.js — Panel de Acciones operativas del día

   Persistencia: localStorage (caché inmediato) + Google Sheets (fuente de verdad).
   Email: via Google Apps Script (GAS), no EmailJS.
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
 * y renderiza la lista actual. Sincroniza desde GAS en background
 * para que todos los usuarios vean las acciones de los demás.
 */
async function openActionsModal() {
  _populateActionsSelects();
  renderActionsList(); // inmediato desde localStorage
  document.getElementById('actionsModal').style.display = 'flex';

  // Sincronizar desde Google Sheets (fuente de verdad multi-usuario)
  try {
    const result = await gasPost({ action: 'get_actions', date: getTodayString() });
    if (result && result.status === 'ok' && Array.isArray(result.actions)) {
      saveActions(result.actions);
      renderActionsList();
    }
  } catch (err) {
    console.warn('[actions] No se pudo sincronizar con GAS:', err.message);
  }
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
  // Persistir en Google Sheets (background, no bloquea la UI)
  gasPost({ action: 'save_action', data: action })
    .catch(err => console.warn('[actions] Error guardando en GAS:', err.message));
}

/**
 * Elimina una acción por su ID.
 * @param {number} id
 */
function deleteAction(id) {
  const actions = loadActions().filter(a => a.id !== id);
  saveActions(actions);
  renderActionsList();
  // Eliminar en Google Sheets (background)
  gasPost({ action: 'delete_action', id })
    .catch(err => console.warn('[actions] Error eliminando en GAS:', err.message));
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
 * Envía las acciones del día por email vía Google Apps Script.
 * El GAS lee las acciones del Sheet y envía el correo con el template HTML.
 */
async function sendActionsEmail() {
  if (loadActions().length === 0) {
    alert('No hay acciones registradas hoy para enviar.');
    return;
  }
  try {
    await gasPost({ action: 'send_actions_email', date: getTodayString() });
    alert('✅ Correo de acciones enviado correctamente.');
  } catch (err) {
    alert('❌ Error al enviar el correo: ' + (err.message || 'Verificar conexión'));
  }
}
