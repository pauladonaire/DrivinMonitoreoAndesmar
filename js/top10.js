/* ============================================================
   top10.js — Top 10 conductores con más rechazadas
              Top 10 motivos de rechazo
              Top 5 clientes con más rechazadas
   ============================================================ */

/**
 * Renderiza ambas tablas top 10.
 * Se llama desde renderAll().
 */
function renderTop10() {
  renderTop10Drivers();
  renderTop10Reasons();
  renderTop5Clients();
}

/* ---- TOP 10 CONDUCTORES ---- */

/**
 * [MEJORA 3] Calcula el ranking de conductores con más rechazadas.
 * Trabaja sobre un array de stops (con .orders[]) para poder calcular
 * tiempo en ruta. Usado por renderTop10Drivers() y closeDayProcedure().
 *
 * @param {Array} stops — array de stops (cada uno con .orders[])
 * @returns {Array} conductores ordenados DESC por rechazadas
 */
function calcTop10Conductores(stops) {
  const map = {};

  stops.forEach(stop => {
    const key = stop.driver_name || '(sin conductor)';

    if (!map[key]) {
      map[key] = {
        name:      key,
        vehicle:   stop.vehicle_code || '',
        email:     stop.driver_email || '',
        rechazadas: 0,
        motivos:   {},
        vdTotal:   0,
        vdEnCalle: 0,
        firstStop: stop,
      };
    }

    (stop.orders || []).forEach(o => {
      // [MEJORA 1c] VD total: todas las órdenes del conductor
      const vd = parseFloat(o.custom_8) || 0;
      map[key].vdTotal += vd;

      // VD en calle: órdenes no entregadas (status !== 'delivered')
      if (o.status !== 'delivered') {
        map[key].vdEnCalle += vd;
      }

      if (o.status === 'rejected') {
        map[key].rechazadas++;
        const r = o.reason || 'Sin motivo';
        map[key].motivos[r] = (map[key].motivos[r] || 0) + 1;
      }
    });
  });

  return Object.values(map)
    .filter(d => d.rechazadas > 0)
    .sort((a, b) => b.rechazadas - a.rechazadas)
    .map(d => {
      const tiempoEnRuta = calcRouteTime(d.firstStop);
      const motivosStr = Object.entries(d.motivos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([r, c]) => `${r}: ${c}`)
        .join(', ');
      return { ...d, tiempoEnRuta, motivosStr };
    });
}

/**
 * Renderiza la tabla Top 10 conductores con rechazadas.
 * Usa APP_STATE.filteredOrders para respetar los filtros activos.
 * [MEJORA 1b] Incluye columna VD en Calle.
 */
function renderTop10Drivers() {
  const tbody = document.getElementById('top10DriversBody');
  if (!tbody) return;

  // Agrupar filteredOrders por conductor (incluye custom_8 de la fila plana)
  const map = {};
  APP_STATE.filteredOrders.forEach(o => {
    const key = o.driver_name || '(sin conductor)';

    if (!map[key]) {
      map[key] = {
        driver_name:  key,
        driver_email: o.driver_email || '',
        vehicle_code: o.vehicle_code || '',
        total:     0,
        reasons:   {},
        vdEnCalle: 0,
      };
    }

    if (o.status === 'rejected') {
      map[key].total++;
      const r = o.reason || 'Sin motivo';
      map[key].reasons[r] = (map[key].reasons[r] || 0) + 1;
    }

    // VD en calle: órdenes no entregadas
    if (o.status !== 'delivered') {
      map[key].vdEnCalle += parseFloat(o.custom_8) || 0;
    }
  });

  const sorted = Object.values(map)
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state"><div>Sin rechazadas en el período</div></div>
    </td></tr>`;
    return;
  }

  const maxTotal = sorted[0].total;

  tbody.innerHTML = sorted.map((item, idx) => {
    const barPct = maxTotal > 0 ? ((item.total / maxTotal) * 100).toFixed(0) : 0;
    const isTop1 = idx === 0 ? 'class="top1-rejected"' : '';

    const reasonsEntries = Object.entries(item.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const reasonsHtml = reasonsEntries
      .map(([r, c]) => `<span title="${esc(r)}: ${c}">${esc(r)}: <strong>${c}</strong></span>`)
      .join('');

    const driverInfo  = APP_STATE.driversMap[item.driver_email] || {};
    const phone       = driverInfo.phone || null;
    const contactHtml = renderContactButtons(phone);

    const driverEsc = esc(item.driver_name).replace(/'/g, "\\'");
    return `<tr class="top10-row-clickable" ${isTop1}
              onclick="filterByDriver('${driverEsc}')"
              title="Click para filtrar por este conductor">
      <td><strong>${idx + 1}</strong></td>
      <td>${esc(item.driver_name)}</td>
      <td class="text-muted">${esc(item.vehicle_code)}</td>
      <td><strong style="color:var(--color-danger)">${item.total}</strong></td>
      <td><div class="reasons-list">${reasonsHtml}</div></td>
      <td>
        <div class="bar-container">
          <div class="bar-fill bar-fill--danger" style="width:${barPct}%"></div>
        </div>
      </td>
      <td>${contactHtml}</td>
    </tr>`;
  }).join('');
}

/* ---- TOP 10 MOTIVOS DE RECHAZO ---- */

/**
 * Agrupa las rechazadas por motivo + categoría y renderiza el ranking.
 */
function renderTop10Reasons() {
  const tbody = document.getElementById('top10ReasonsBody');
  if (!tbody) return;

  const rechazadas = APP_STATE.filteredOrders.filter(o => o.status === 'rejected');
  const totalRechazadas = rechazadas.length;

  const map = {};
  rechazadas.forEach(o => {
    const motivo    = o.reason   || 'Sin motivo';
    const categoria = o.category || 'sin categoría';
    const key       = `${motivo}|||${categoria}`;
    map[key] = (map[key] || 0) + 1;
  });

  const sorted = Object.entries(map)
    .map(([key, count]) => {
      const [motivo, categoria] = key.split('|||');
      return { motivo, categoria, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state"><div>Sin rechazadas en el período</div></div>
    </td></tr>`;
    return;
  }

  const maxCount = sorted[0].count;

  tbody.innerHTML = sorted.map((item, idx) => {
    const barPct   = maxCount > 0 ? ((item.count / maxCount) * 100).toFixed(0) : 0;
    const pctTotal = totalRechazadas > 0
      ? ((item.count / totalRechazadas) * 100).toFixed(1)
      : 0;

    return `<tr>
      <td><strong>${idx + 1}</strong></td>
      <td>${esc(item.motivo)}</td>
      <td>${renderCategoryBadge(item.categoria)}</td>
      <td><strong>${item.count}</strong></td>
      <td class="text-muted">${pctTotal}%</td>
      <td>
        <div class="bar-container">
          <div class="bar-fill bar-fill--reason" style="width:${barPct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ---- TOP 5 CLIENTES CON MÁS RECHAZADAS ---- */

function renderTop5Clients() {
  const tbody = document.getElementById('top5ClientsBody');
  if (!tbody) return;

  const rechazadas = APP_STATE.filteredOrders.filter(o => o.status === 'rejected');
  const totalRechazadas = rechazadas.length;

  const map = {};
  rechazadas.forEach(o => {
    const key = o.supplier_name || o.client_name || o.address_customer_name || '(sin cliente)';
    if (!map[key]) map[key] = { name: key, total: 0, reasons: {} };
    map[key].total++;
    const r = o.reason || 'Sin motivo';
    map[key].reasons[r] = (map[key].reasons[r] || 0) + 1;
  });

  const sorted = Object.values(map)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="empty-state"><div>Sin rechazadas en el período</div></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((item, idx) => {
    const pctTotal = totalRechazadas > 0 ? ((item.total / totalRechazadas) * 100).toFixed(1) : 0;
    const topReason = Object.entries(item.reasons).sort((a, b) => b[1] - a[1])[0];
    const topReasonHtml = topReason ? `${esc(topReason[0])}: <strong>${topReason[1]}</strong>` : '—';

    const clientEsc = esc(item.name).replace(/'/g, "\\'");
    return `<tr class="top10-row-clickable"
              onclick="filterByClient('${clientEsc}')"
              title="Click para filtrar por este cliente">
      <td><strong>${idx + 1}</strong></td>
      <td>${esc(item.name)}</td>
      <td><strong style="color:var(--color-danger)">${item.total}</strong></td>
      <td class="text-muted">${pctTotal}%</td>
      <td><div class="reasons-list"><span>${topReasonHtml}</span></div></td>
    </tr>`;
  }).join('');
}

/* ---- [MEJORA REC4] EXPORTAR RECHAZADAS A CSV ---- */

/**
 * Exporta las órdenes rechazadas del período actual como CSV.
 * Respeta los filtros activos (usa APP_STATE.filteredOrders).
 */
function exportarRechazadasCSV() {
  const orders = APP_STATE.filteredOrders.filter(o => o.status === 'rejected');

  if (orders.length === 0) {
    alert('Sin órdenes rechazadas para exportar.');
    return;
  }

  const headers = [
    'Fecha', 'Plan', 'Cód. Orden', 'Cód. Dirección', 'Cliente',
    'Conductor', 'Vehículo', 'CND', 'Motivo', 'Categoría', 'Kg', 'Bultos', 'VD'
  ];

  const rows = orders.map(o => {
    const vd = parseFloat(o.custom_8) || 0;
    return [
      getTodayString(),
      o.description  || '',
      o.code         || '',
      o.address_name || '',
      o.client_name  || o.supplier_name || '',
      o.driver_name  || '',
      o.vehicle_code || '',
      o.schema_name  || '',
      o.reason       || '',
      o.category     || '',
      o.units_1      ?? '',
      o.units_2      ?? '',
      vd
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rechazadas_${getTodayString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
