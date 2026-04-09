/* ============================================================
   filters.js — Filtros con dependencia de depósito + buscador
   ============================================================ */

/**
 * Inicializa listeners de filtros.
 * - Buscador en tiempo real
 * - Depósito: re-popula vehículo y conductor al cambiar
 */
function initFilterListeners() {
  // Buscador por código de orden en tiempo real
  const searchInput = document.getElementById('searchCode');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      APP_STATE.currentPage = 1;
      applyFilters();
    });
  }

  // Al cambiar depósito → re-poblar flotas, vehículos y conductores
  const filterDeposito = document.getElementById('filterDeposito');
  if (filterDeposito) {
    filterDeposito.addEventListener('change', () => {
      // Limpiar selects dependientes para que no queden valores huérfanos
      ['filterFlota', 'filterVehiculo', 'filterConductor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      populateDependentFilters();
    });
  }
}

/**
 * Pobla TODOS los selects desde rawData.
 * Debe llamarse UNA VEZ al recibir datos (o al refrescar).
 * Los selects dependientes se re-poblan por separado al cambiar depósito.
 */
function populateFilters() {
  const stops     = APP_STATE.rawData;
  const depositos = new Set();
  const motivos   = new Set();

  const suppliers  = new Set();

  stops.forEach(stop => {
    if (stop.schema_name) depositos.add(stop.schema_name);
    (stop.orders || []).forEach(o => {
      if (o.reason)         motivos.add(o.reason);
      if (o.supplier_name)  suppliers.add(o.supplier_name);
    });
  });

  fillSelect('filterDeposito',  [...depositos].sort());
  fillSelect('filterMotivo',    [...motivos].sort());
  fillSelect('filterSupplier',  [...suppliers].sort());

  // Poblar selects dependientes con todos los datos (sin filtro de depósito aún)
  populateDependentFilters();
}

/**
 * Re-popula flotas, vehículos, conductores y estados
 * según el depósito actualmente seleccionado.
 * Si depósito = "" se muestran todos.
 */
function populateDependentFilters() {
  const selectedDeposito = document.getElementById('filterDeposito')?.value || '';

  // Base de stops según depósito seleccionado
  const baseStops = selectedDeposito
    ? APP_STATE.rawData.filter(s => s.schema_name === selectedDeposito)
    : APP_STATE.rawData;

  const flotas      = new Set();
  const vehiculos   = new Set();
  const conductores = new Set();
  const estados     = new Set();

  baseStops.forEach(stop => {
    if (stop.fleet_name)   flotas.add(stop.fleet_name);
    if (stop.vehicle_code) vehiculos.add(stop.vehicle_code);
    if (stop.driver_name)  conductores.add(stop.driver_name);
    (stop.orders || []).forEach(o => {
      if (o.status) estados.add(o.status);
    });
  });

  fillSelect('filterFlota',     [...flotas].sort());
  fillSelect('filterVehiculo',  [...vehiculos].sort());
  fillSelect('filterConductor', [...conductores].sort());
  fillSelect('filterEstado',    [...estados].sort());
}

/**
 * Rellena un <select> preservando la selección actual.
 * @param {string}   id      — ID del elemento select
 * @param {string[]} options — valores a poblar
 */
function fillSelect(id, options) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const currentVal = sel.value;

  while (sel.options.length > 1) sel.remove(1);

  options.forEach(opt => {
    const el       = document.createElement('option');
    el.value       = opt;
    el.textContent = opt;
    sel.appendChild(el);
  });

  if (currentVal && options.includes(currentVal)) {
    sel.value = currentVal;
  }
}

/**
 * Aplica todos los filtros activos y re-renderiza.
 */
function applyFilters() {
  const deposito  = document.getElementById('filterDeposito')?.value  || '';
  const flota     = document.getElementById('filterFlota')?.value     || '';
  const vehiculo  = document.getElementById('filterVehiculo')?.value  || '';
  const conductor = document.getElementById('filterConductor')?.value || '';
  const estado    = document.getElementById('filterEstado')?.value    || '';
  const categoria = document.getElementById('filterCategoria')?.value || '';
  const motivo    = document.getElementById('filterMotivo')?.value    || '';
  const supplier  = document.getElementById('filterSupplier')?.value  || '';

  const searchRaw = document.getElementById('searchCode')?.value || '';
  const search    = searchRaw.trim().toLowerCase();

  // Mejora 5: filtro de estado de ruta
  const routeF = APP_STATE.routeFilter || 'all';

  // Login: restricción de depósito para perfil monitoreosuc
  const userDeps = APP_STATE.userDepositos; // null = sin restricción

  const rows = [];

  APP_STATE.rawData.forEach(stop => {
    // Filtro de ruta (Mejora 5)
    if (routeF === 'not_started' && stop.route_is_started !== false) return;
    if (routeF === 'in_progress' && !(stop.route_is_started === true && stop.route_is_finished === false)) return;
    if (routeF === 'finished'    && stop.route_is_finished !== true) return;

    // Restricción de perfil: monitoreosuc solo ve sus depósitos
    if (userDeps && userDeps.length > 0 && !userDeps.includes(stop.schema_name)) return;

    if (deposito  && stop.schema_name  !== deposito)  return;
    if (flota     && stop.fleet_name   !== flota)     return;
    if (vehiculo  && stop.vehicle_code !== vehiculo)  return;
    if (conductor && stop.driver_name  !== conductor) return;

    const orders = (stop.orders || []).filter(order => {
      if (estado    && order.status        !== estado)    return false;
      if (categoria && order.category      !== categoria) return false;
      if (motivo    && order.reason        !== motivo)    return false;
      if (supplier  && order.supplier_name !== supplier)  return false;

      if (search) {
        const code    = (order.code    || '').toLowerCase();
        const altCode = (order.alt_code || '').toLowerCase();
        if (!code.includes(search) && !altCode.includes(search)) return false;
      }
      return true;
    });

    if (orders.length === 0) return;
    orders.forEach(order => rows.push(buildFlatRow(stop, order)));
  });

  APP_STATE.filteredOrders = rows;
  APP_STATE.currentPage    = 1;
  APP_STATE.driversPage    = 1;
  renderAll();
  // Mejora 7: verificar nuevos "Domicilio No Visitado"
  if (typeof checkNewDomicilioNoVisitado === 'function') checkNewDomicilioNoVisitado();
}

/**
 * Construye una fila plana combinando stop + order.
 */
function buildFlatRow(stop, order) {
  return {
    description:           stop.description           || '',
    vehicle_code:          stop.vehicle_code          || '',
    vehicle_description:   stop.vehicle_description   || '',
    schema_name:           stop.schema_name           || '',
    schema_code:           stop.schema_code           || '',
    fleet_name:            stop.fleet_name            || '',
    driver_name:           stop.driver_name           || '',
    driver_email:          stop.driver_email          || '',
    address_name:          stop.address_name          || '',
    address_address_1:     stop.address_address_1     || '',
    address_city:          stop.address_city          || '',
    address_county:        stop.address_county        || '',
    address_customer_name: stop.address_customer_name || '',
    // Teléfono de destino extraído directamente del v2/pods
    dest_phone: stop.contact_phone
             || stop.address_contact_phone
             || stop.address?.contact_phone
             || stop.phone
             || stop.address_phone
             || order.contact_phone
             || null,
    eta:                   stop.eta                   || null,
    route_started_at:      stop.route_started_at      || null,
    route_finished_at:     stop.route_finished_at     || null,
    route_is_finished:     stop.route_is_finished     || false,
    pdf_pod:               stop.pdf_pod               || null,
    stop_images:           Array.isArray(stop.images)  ? stop.images  : [],
    _stop:                 stop,

    code:          order.code          || '',
    alt_code:      order.alt_code      || '',
    order_desc:    order.description   || '',
    category:      order.category      || '',
    status:        order.status        || '',
    reason:        order.reason        || '',
    reason_code:   order.reason_code   || '',
    pod_arrival:   order.pod_arrival   || null,
    client_name:   order.client_name   || '',
    supplier_name: order.supplier_name || '',
    units_1:       order.units_1       ?? null,
    units_2:       order.units_2       ?? null,
    units_3:       order.units_3       ?? null,
    is_otd:        order.is_otd        || false,
    num_retries:   order.num_retries   ?? 0,
    pdf_pod_order: order.pdf_pod_order || null,
    order_images:  Array.isArray(order.images) ? order.images : [],

    // Campos personalizados
    monto_cobrar: order.custom_3 || order.custom_fields?.custom_3 || '',
    rto:          order.custom_9 || order.custom_fields?.custom_9 || '',

    // Mejora 2: comentario del conductor (viene a nivel stop, no order)
    comment:  stop.comment || order.comment || '',
    // Mejora 3: cerca del punto de entrega (viene como string "Si"/"No")
    near_pod: order.near_pod === 'Si' ? true
            : order.near_pod === 'No' ? false
            : (order.near_pod ?? null),

    // Mejora 4 (Login): VISITÓ? — visita al punto
    visit_arrival: stop.visit_arrival || order.visit_arrival || null,
    visit_leave:   stop.visit_leave   || order.visit_leave   || null,

    // Mejora 5: PARADA — posición en la ruta
    position: stop.position ?? order.position ?? null,
  };
}

/* ============================================================
   MEJORA 5 — Filtro de estado de ruta (pills)
   ============================================================ */

/**
 * Cambia el filtro de ruta y re-aplica filtros.
 * @param {'all'|'not_started'|'in_progress'|'finished'} filter
 */
function setRouteFilter(filter) {
  APP_STATE.routeFilter = filter;
  document.querySelectorAll('.route-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === filter);
  });
  APP_STATE.currentPage = 1;
  applyFilters();
}

/* ============================================================
   MEJORA 6 — Filtrado rápido desde Top10
   ============================================================ */

/**
 * Filtra toda la app por conductor (desde click en top10).
 */
function filterByDriver(driverName) {
  const select = document.getElementById('filterConductor');
  if (select) select.value = driverName;
  APP_STATE.currentPage = 1;
  APP_STATE.driversPage = 1;
  applyFilters();
  document.getElementById('mainTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Filtra toda la app por cliente/proveedor (desde click en top5 clientes).
 */
function filterByClient(clientName) {
  const select = document.getElementById('filterSupplier');
  if (select) select.value = clientName;
  APP_STATE.currentPage = 1;
  applyFilters();
  document.getElementById('mainTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Limpia todos los filtros */
function clearFilters() {
  ['filterDeposito','filterFlota','filterVehiculo','filterConductor',
   'filterEstado','filterCategoria','filterMotivo','filterSupplier'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const searchInput = document.getElementById('searchCode');
  if (searchInput) searchInput.value = '';
  // Resetear filtro de ruta (Mejora 5)
  APP_STATE.routeFilter = 'all';
  document.querySelectorAll('.route-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === 'all');
  });
  populateDependentFilters();
  applyFilters();
}
