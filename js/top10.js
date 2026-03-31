/* ============================================================
   top10.js — Top 10 conductores con más rechazadas
              Top 10 motivos de rechazo
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
 * Agrupa las órdenes rechazadas por conductor y renderiza el ranking.
 */
function renderTop10Drivers() {
  const tbody = document.getElementById('top10DriversBody');
  if (!tbody) return;

  const rechazadas = APP_STATE.filteredOrders.filter(o => o.status === 'rejected');

  // Agrupar por conductor
  const map = {};
  rechazadas.forEach(o => {
    const key = o.driver_name || '(sin conductor)';
    if (!map[key]) {
      map[key] = {
        driver_name:  key,
        driver_email: o.driver_email || '',
        vehicle_code: o.vehicle_code || '',
        total: 0,
        reasons: {}
      };
    }
    map[key].total++;
    const r = o.reason || 'Sin motivo';
    map[key].reasons[r] = (map[key].reasons[r] || 0) + 1;
  });

  // Ordenar por total DESC y tomar top 10
  const sorted = Object.values(map)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state"><div>Sin rechazadas en el período</div></div>
    </td></tr>`;
    return;
  }

  const maxTotal = sorted[0].total;

  tbody.innerHTML = sorted.map((item, idx) => {
    const barPct  = maxTotal > 0 ? ((item.total / maxTotal) * 100).toFixed(0) : 0;
    const isTop1  = idx === 0 ? 'class="top1-rejected"' : '';

    // Motivos agrupados (máx 3 en la celda)
    const reasonsEntries = Object.entries(item.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const reasonsHtml = reasonsEntries
      .map(([r, c]) => `<span>${esc(r)}: <strong>${c}</strong></span>`)
      .join('');

    // Botón de contacto desde driversMap (cruce por email)
    const driverInfo  = APP_STATE.driversMap[item.driver_email] || {};
    const phone       = driverInfo.phone || null;
    const contactHtml = renderContactButtons(phone);

    return `<tr ${isTop1}>
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

  // Agrupar por motivo + categoría
  const map = {};
  rechazadas.forEach(o => {
    const motivo    = o.reason   || 'Sin motivo';
    const categoria = o.category || 'sin categoría';
    const key       = `${motivo}|||${categoria}`;
    map[key] = (map[key] || 0) + 1;
  });

  // Ordenar por cantidad DESC y tomar top 10
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
    const barPct  = maxCount > 0 ? ((item.count / maxCount) * 100).toFixed(0) : 0;
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

  const maxTotal = sorted[0].total;

  tbody.innerHTML = sorted.map((item, idx) => {
    const barPct  = maxTotal > 0 ? ((item.total / maxTotal) * 100).toFixed(0) : 0;
    const pctTotal = totalRechazadas > 0 ? ((item.total / totalRechazadas) * 100).toFixed(1) : 0;
    const topReason = Object.entries(item.reasons).sort((a, b) => b[1] - a[1])[0];
    const topReasonHtml = topReason ? `${esc(topReason[0])}: <strong>${topReason[1]}</strong>` : '—';

    return `<tr>
      <td><strong>${idx + 1}</strong></td>
      <td>${esc(item.name)}</td>
      <td><strong style="color:var(--color-danger)">${item.total}</strong></td>
      <td class="text-muted">${pctTotal}%</td>
      <td><div class="reasons-list"><span>${topReasonHtml}</span></div></td>
    </tr>`;
  }).join('');
}
