/* ============================================================
   kpis.js — Cálculo y renderizado de KPIs
   ============================================================ */

/**
 * Calcula todos los KPIs y los renderiza en las tarjetas del HTML.
 * Opera sobre APP_STATE.filteredOrders.
 *
 * Fórmula de efectividad:
 *   - "Gestionadas" = todas las órdenes con status != 'pending'
 *     (incluye approved, rejected, partial y cualquier otro status)
 *   - Efectividad = approved / gestionadas × 100
 *   - % Pendientes = pending / total × 100
 */
function calcAndRenderKPIs() {
  const orders = APP_STATE.filteredOrders;

  const totalOrdenes = orders.length;

  // Segmentación por categoría
  const entregas = orders.filter(o => o.category === 'delivery');
  const retiros  = orders.filter(o => o.category === 'pickup');

  // Estados clave
  const approved   = orders.filter(o => o.status === 'approved');
  const rejected   = orders.filter(o => o.status === 'rejected');
  const pending    = orders.filter(o => o.status === 'pending');

  // "Gestionadas" = todo lo que NO es pending
  // Incluye: approved, rejected, partial, y cualquier otro estado
  const managed = orders.filter(o => o.status !== 'pending');

  // Por categoría
  const entregasApproved = entregas.filter(o => o.status === 'approved');
  const entregasManaged  = entregas.filter(o => o.status !== 'pending');
  const retirosApproved  = retiros.filter(o  => o.status === 'approved');
  const retirosManaged   = retiros.filter(o  => o.status !== 'pending');

  // ---- Cálculo de efectividades ----
  // Efectividad = aprobadas / gestionadas (excluye pendientes del denominador)
  const efectividadGeneral  = pct(approved.length,        managed.length);
  const efectividadEntregas = pct(entregasApproved.length, entregasManaged.length);
  const efectividadRetiros  = pct(retirosApproved.length,  retirosManaged.length);

  // % Pendientes (órdenes sin gestionar sobre el total)
  const pctPendientes = pct(pending.length, totalOrdenes);

  // ---- Fila 1: valores absolutos ----
  setKPI('kpiTotalOrdenes',    totalOrdenes,     'valTotalOrdenes',    null, '');
  setKPI('kpiTotalEntregas',   entregas.length,  'valTotalEntregas',   null, '');
  setKPI('kpiTotalRetiros',    retiros.length,   'valTotalRetiros',    null, '');
  setKPI('kpiTotalRechazadas', rejected.length,  'valTotalRechazadas', null, '');

  // ---- Fila 2: efectividades con color semántico ----
  setKPI('kpiEfectividadGeneral',  efectividadGeneral,  'valEfectividadGeneral',  efectividadGeneral,  '%');
  setKPI('kpiEfectividadEntregas', efectividadEntregas, 'valEfectividadEntregas', efectividadEntregas, '%');
  setKPI('kpiEfectividadRetiros',  efectividadRetiros,  'valEfectividadRetiros',  efectividadRetiros,  '%');

  // % Pendientes: color inverso (más alto = peor)
  setKPI('kpiPendientes', pctPendientes, 'valPendientes', null, '%');
  colorPendientes('kpiPendientes', pctPendientes);

  // ---- Mejora 4: Promedio de bultos y kg por vehículo ----
  const vehicleBultos = {};
  const vehicleKg     = {};
  orders.forEach(o => {
    const v = o.vehicle_code || '(sin vehículo)';
    vehicleBultos[v] = (vehicleBultos[v] || 0) + (o.units_2 || 0);
    vehicleKg[v]     = (vehicleKg[v]     || 0) + (o.units_1 || 0);
  });
  const vehicleList = Object.keys(vehicleBultos);
  const avgBultos = vehicleList.length > 0
    ? (Object.values(vehicleBultos).reduce((a, b) => a + b, 0) / vehicleList.length).toFixed(1)
    : '—';
  const avgKg = vehicleList.length > 0
    ? (Object.values(vehicleKg).reduce((a, b) => a + b, 0) / vehicleList.length).toFixed(1)
    : '—';

  const avgOrders = vehicleList.length > 0
    ? (totalOrdenes / vehicleList.length).toFixed(1)
    : '—';

  const valBultosEl   = document.getElementById('valAvgBultos');
  const valKgEl       = document.getElementById('valAvgKg');
  const valVehiclesEl = document.getElementById('valVehiclesActive');
  const valAvgOrdersEl = document.getElementById('valAvgOrders');
  if (valBultosEl)    valBultosEl.textContent    = avgBultos;
  if (valKgEl)        valKgEl.textContent        = avgKg;
  if (valVehiclesEl)  valVehiclesEl.textContent  = vehicleList.length || '—';
  if (valAvgOrdersEl) valAvgOrdersEl.textContent = avgOrders;
}

/**
 * Calcula un porcentaje y lo redondea a 1 decimal.
 * @param {number} num
 * @param {number} den
 * @returns {number}
 */
function pct(num, den) {
  if (!den || den === 0) return 0;
  return parseFloat(((num / den) * 100).toFixed(1));
}

/**
 * Actualiza una tarjeta KPI individual.
 * @param {string} cardId
 * @param {*}      value
 * @param {string} valId
 * @param {number|null} pctVal — porcentaje para color semántico (null = sin color)
 * @param {string} suffix
 */
function setKPI(cardId, value, valId, pctVal, suffix) {
  const card  = document.getElementById(cardId);
  const valEl = document.getElementById(valId);

  if (valEl) valEl.textContent = `${value}${suffix}`;
  if (!card) return;

  card.classList.remove('kpi--danger', 'kpi--warning', 'kpi--success');

  if (pctVal !== null) {
    const p = parseFloat(pctVal);
    if (p < 70)      card.classList.add('kpi--danger');
    else if (p < 90) card.classList.add('kpi--warning');
    else             card.classList.add('kpi--success');
  }
}

/**
 * Colorea la tarjeta de Pendientes con lógica inversa:
 * más pendientes = peor (rojo), pocos pendientes = bueno (verde).
 * @param {string} cardId
 * @param {number} pctPend
 */
function colorPendientes(cardId, pctPend) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.remove('kpi--danger', 'kpi--warning', 'kpi--success');
  const valEl = card.querySelector('.kpi-value');

  if (pctPend > 30) {
    card.classList.add('kpi--danger');
    if (valEl) valEl.style.color = 'var(--color-danger)';
  } else if (pctPend > 10) {
    card.classList.add('kpi--warning');
    if (valEl) valEl.style.color = 'var(--color-warning)';
  } else {
    card.classList.add('kpi--success');
    if (valEl) valEl.style.color = 'var(--color-success)';
  }
}
