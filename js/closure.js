/* ============================================================
   closure.js — Cierre del día: localStorage, EmailJS y CSV
   ============================================================

   INSTRUCCIONES EmailJS:
   1. Crear cuenta en https://www.emailjs.com (plan Free — 200 emails/mes)
   2. Add New Service → conectar tu cuenta de email (Gmail, Outlook, etc.)
      Copiar el "Service ID" generado.
   3. Email Templates → New Template → diseñar el mail con estas variables:
        {{date}}, {{total_orders}}, {{total_delivered}}, {{total_rejected}},
        {{effectiveness}}, {{top_reasons}}, {{closed_at}}
      Copiar el "Template ID".
   4. Account → copiar Public Key.
   5. Pegar los tres valores en js/config.js:
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY
   ============================================================ */

/**
 * Procedimiento completo de cierre del día.
 * Guarda en localStorage, envía email y muestra modal de confirmación.
 */
async function closeDayProcedure() {
  const hoy     = getTodayString();
  const orders  = APP_STATE.filteredOrders.length > 0
    ? APP_STATE.filteredOrders
    : buildFlatAllOrders(); // usar todos si no hay filtros aplicados

  // Calcular métricas finales del día
  const totalOrders       = orders.length;
  const totalDeliveries   = orders.filter(o => o.category === 'delivery').length;
  const totalPickups      = orders.filter(o => o.category === 'pickup').length;
  const totalRejected     = orders.filter(o => o.status === 'rejected').length;

  // Misma fórmula que kpis.js: aprobadas / gestionadas (excluye pending)
  const totalApproved = orders.filter(o => o.status === 'approved').length;
  const totalManaged  = orders.filter(o => o.status !== 'pending').length;

  const entregasManaged  = orders.filter(o => o.category === 'delivery' && o.status !== 'pending').length;
  const entregasApproved = orders.filter(o => o.category === 'delivery' && o.status === 'approved').length;
  const retirosManaged   = orders.filter(o => o.category === 'pickup'   && o.status !== 'pending').length;
  const retirosApproved  = orders.filter(o => o.category === 'pickup'   && o.status === 'approved').length;

  const effGeneral  = totalManaged    > 0 ? ((totalApproved   / totalManaged)    * 100).toFixed(1) : '0.0';
  const effDelivery = entregasManaged > 0 ? ((entregasApproved / entregasManaged) * 100).toFixed(1) : '0.0';
  const effPickup   = retirosManaged  > 0 ? ((retirosApproved  / retirosManaged)  * 100).toFixed(1) : '0.0';
  const otdPct      = totalOrders     > 0
    ? ((orders.filter(o => o.is_otd === true).length / totalOrders) * 100).toFixed(1)
    : '0.0';

  // Top 5 motivos de rechazo
  const rejMap = {};
  orders.filter(o => o.status === 'rejected').forEach(o => {
    const r = o.reason || 'Sin motivo';
    rejMap[r] = (rejMap[r] || 0) + 1;
  });
  const topRejectionReasons = Object.entries(rejMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  // Top 10 conductores con más rechazadas
  const driverRejMap = {};
  orders.filter(o => o.status === 'rejected').forEach(o => {
    const k = o.driver_name || '(sin conductor)';
    if (!driverRejMap[k]) driverRejMap[k] = { total: 0, vehicle: o.vehicle_code || '' };
    driverRejMap[k].total++;
  });
  const topDriversRejected = Object.entries(driverRejMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([driver, d]) => ({ driver, count: d.total, vehicle: d.vehicle }));

  // Top 5 clientes con más rechazadas
  const clientRejMap = {};
  orders.filter(o => o.status === 'rejected').forEach(o => {
    const k = o.supplier_name || o.client_name || o.address_customer_name || '(sin cliente)';
    clientRejMap[k] = (clientRejMap[k] || 0) + 1;
  });
  const topClientsRejected = Object.entries(clientRejMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([client, count]) => ({ client, count }));

  // Órdenes pendientes
  const totalPending = orders.filter(o => o.status === 'pending').length;

  // ---- Mejora 8: Resumen por sucursal ----
  const byDeposito = {};
  orders.forEach(o => {
    const dep = o.schema_name || 'Sin sucursal';
    if (!byDeposito[dep]) {
      byDeposito[dep] = { total: 0, aprobadas: 0, rechazadas: 0, pending: 0, entregas: 0, retiros: 0 };
    }
    const d = byDeposito[dep];
    d.total++;
    if (o.category === 'delivery') d.entregas++;
    if (o.category === 'pickup')   d.retiros++;
    if (o.status === 'approved')   d.aprobadas++;
    if (o.status === 'rejected')   d.rechazadas++;
    if (o.status === 'pending')    d.pending++;
  });
  const depositosSummary = Object.entries(byDeposito)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([dep, d]) => {
      const gest = d.total - d.pending;
      const eff  = gest > 0 ? ((d.aprobadas / gest) * 100).toFixed(1) : '0.0';
      return `${dep}: ${d.total} órdenes | ✅ ${d.aprobadas} | ❌ ${d.rechazadas} | Ef: ${eff}%`;
    })
    .join('\n');

  // ---- Mejora 1: Acciones del día ----
  const actionsSummary = (typeof getActionsSummaryText === 'function')
    ? getActionsSummaryText()
    : 'Sin acciones registradas';

  const closedAt = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Objeto de cierre
  const closureData = {
    date:                    hoy,
    totalOrders,
    totalDeliveries,
    totalPickups,
    totalRejected,
    totalApproved,
    totalPending,
    effectivenessGeneral:    effGeneral,
    effectivenessDeliveries: effDelivery,
    effectivenessPickups:    effPickup,
    otdPercent:              otdPct,
    topRejectionReasons,
    topDriversRejected,
    topClientsRejected,
    depositosSummary,  // Mejora 8
    actionsSummary,    // Mejora 1
    closedAt,
  };

  // 1. Guardar en localStorage
  const storageKey = `fleet_closure_${hoy}`;
  localStorage.setItem(storageKey, JSON.stringify(closureData));

  // 2. Enviar email vía EmailJS
  let emailStatus = 'ok';
  let emailMsg    = `Email enviado a ${EMAIL_DESTINO}`;

  if (
    EMAILJS_SERVICE_ID  === '[REEMPLAZAR_CON_SERVICE_ID]'  ||
    EMAILJS_TEMPLATE_ID === '[REEMPLAZAR_CON_TEMPLATE_ID]' ||
    EMAILJS_PUBLIC_KEY  === '[REEMPLAZAR_CON_PUBLIC_KEY]'
  ) {
    emailStatus = 'err';
    emailMsg    = '⚠️ EmailJS no configurado. Completar config.js con los datos de la cuenta.';
  } else {
    try {
      const topReasonsText = topRejectionReasons
        .map((r, i) => `${i + 1}. ${r.reason}: ${r.count}`)
        .join('\n');

      const topDriversText = topDriversRejected
        .map((d, i) => `${i + 1}. ${d.driver} (${d.vehicle}): ${d.count} rechazadas`)
        .join('\n');

      const topClientsText = topClientsRejected
        .map((c, i) => `${i + 1}. ${c.client}: ${c.count} rechazadas`)
        .join('\n');

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          date:            hoy,
          total_orders:    totalOrders,
          total_approved:  totalApproved,
          total_rejected:  totalRejected,
          total_pending:   totalPending,
          eff_general:     `${effGeneral}%`,
          eff_entregas:    `${effDelivery}%`,
          eff_retiros:     `${effPickup}%`,
          otd:             `${otdPct}%`,
          top_reasons:       topReasonsText,
          top_drivers:       topDriversText,
          top_clients:       topClientsText,
          depositos_summary: depositosSummary,  // Mejora 8
          actions_summary:   actionsSummary,    // Mejora 1
          closed_at:         closedAt,
          // Aliases para compatibilidad con template anterior
          effectiveness:   `${effGeneral}%`,
          total_delivered: totalApproved,
        }
      );
    } catch (err) {
      emailStatus = 'err';
      emailMsg    = `Error al enviar email: ${err.text || err.message || 'desconocido'}`;
    }
  }

  // 3. Mostrar modal de confirmación
  showClosureModal(closureData, emailStatus, emailMsg);

  // Actualizar historial
  renderClosureHistory();
}

/**
 * Construye el array plano de todas las órdenes sin filtros (directo desde rawData).
 * Se usa en closeDayProcedure si no hay filtros activos.
 */
function buildFlatAllOrders() {
  const rows = [];
  APP_STATE.rawData.forEach(stop => {
    (stop.orders || []).forEach(order => {
      rows.push(buildFlatRow(stop, order));
    });
  });
  return rows;
}

/**
 * Muestra el modal de cierre con el resumen y el estado del email.
 */
function showClosureModal(data, emailStatus, emailMsg) {
  const content = document.getElementById('closureModalContent');
  if (!content) return;

  // Top 10 conductores
  const driversHtml = (data.topDriversRejected || []).length === 0
    ? '<p style="color:#a0b4c8;font-size:12px">Sin rechazadas</p>'
    : (data.topDriversRejected || []).map((d, i) =>
        `<div class="closure-summary-row">
           <span class="closure-summary-label">${i + 1}. ${d.driver} <span style="opacity:.5;font-size:11px">(${d.vehicle})</span></span>
           <span class="closure-summary-value" style="color:var(--color-danger)">${d.count}</span>
         </div>`
      ).join('');

  // Top 5 clientes
  const clientsHtml = (data.topClientsRejected || []).length === 0
    ? '<p style="color:#a0b4c8;font-size:12px">Sin rechazadas</p>'
    : (data.topClientsRejected || []).map((c, i) =>
        `<div class="closure-summary-row">
           <span class="closure-summary-label">${i + 1}. ${c.client}</span>
           <span class="closure-summary-value" style="color:var(--color-danger)">${c.count}</span>
         </div>`
      ).join('');

  // Mejora 8: desglose por sucursal
  const depositosHtml = data.depositosSummary
    ? data.depositosSummary.split('\n').map(line =>
        `<div style="font-size:12px;color:var(--color-text-muted);padding:4px 0;border-bottom:1px solid var(--color-border)">${line}</div>`
      ).join('')
    : '<p style="color:#a0b4c8;font-size:12px">Sin datos</p>';

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">

      <!-- Columna izquierda: resumen general -->
      <div>
        <div style="color:var(--color-cyan);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Resumen</div>
        <div class="closure-summary">
          <div class="closure-summary-row">
            <span class="closure-summary-label">Fecha</span>
            <span class="closure-summary-value">${data.date}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Total órdenes</span>
            <span class="closure-summary-value">${data.totalOrders}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Entregas / Retiros</span>
            <span class="closure-summary-value">${data.totalDeliveries} / ${data.totalPickups}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Aprobadas</span>
            <span class="closure-summary-value" style="color:var(--color-success)">${data.totalApproved ?? '—'}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Rechazadas</span>
            <span class="closure-summary-value" style="color:var(--color-danger)">${data.totalRejected}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Pendientes</span>
            <span class="closure-summary-value" style="color:var(--color-warning)">${data.totalPending ?? '—'}</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Efectividad general</span>
            <span class="closure-summary-value">${data.effectivenessGeneral}%</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Ef. Entregas / Retiros</span>
            <span class="closure-summary-value">${data.effectivenessDeliveries}% / ${data.effectivenessPickups}%</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">OTD</span>
            <span class="closure-summary-value">${data.otdPercent}%</span>
          </div>
          <div class="closure-summary-row">
            <span class="closure-summary-label">Cerrado a las</span>
            <span class="closure-summary-value">${data.closedAt}</span>
          </div>
        </div>

        <!-- Desglose por sucursal (Mejora 8) -->
        <div style="color:var(--color-cyan);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin:16px 0 8px;">Desglose por sucursal</div>
        <div>${depositosHtml}</div>
      </div>

      <!-- Columna derecha: rankings -->
      <div>
        <div style="color:var(--color-cyan);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Top conductores rechazadas</div>
        <div class="closure-summary" style="margin-bottom:16px;">${driversHtml}</div>

        <div style="color:var(--color-cyan);font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">Top 5 clientes</div>
        <div class="closure-summary">${clientsHtml}</div>
      </div>

    </div>
    <div class="closure-email-status ${emailStatus}" style="margin-top:16px;">
      ${emailMsg}
    </div>`;

  document.getElementById('closureModal').style.display = 'flex';
}

/**
 * Abre una ventana de impresión con el resumen del cierre (para guardar como PDF).
 * @param {string} storageKey — clave en localStorage del cierre a imprimir
 */
function printClosureSummary(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) { alert('No se encontraron datos del cierre.'); return; }
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const topReasonsRows = (data.topRejectionReasons || [])
    .map((r, i) => `<tr><td>${i + 1}</td><td>${r.reason}</td><td><b>${r.count}</b></td></tr>`)
    .join('');

  const topDriversRows = (data.topDriversRejected || [])
    .map((d, i) => `<tr><td>${i + 1}</td><td>${d.driver}</td><td>${d.vehicle || '—'}</td><td><b>${d.count}</b></td></tr>`)
    .join('');

  const topClientsRows = (data.topClientsRejected || [])
    .map((c, i) => `<tr><td>${i + 1}</td><td>${c.client}</td><td><b>${c.count}</b></td></tr>`)
    .join('');

  // Mejora 8: tabla por sucursal en PDF
  const depositosRows = (data.depositosSummary || '')
    .split('\n').filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(p => p.trim());
      return `<tr>${parts.map(p => `<td>${p}</td>`).join('')}</tr>`;
    }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cierre del Día — ${data.date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 30px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 24px; }
    h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .kv-table { width: 100%; border-collapse: collapse; }
    .kv-table td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    .kv-table td:first-child { color: #555; width: 55%; }
    .kv-table td:last-child { font-weight: 600; text-align: right; }
    table.rank { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.rank th { background: #f0f0f0; padding: 5px 8px; text-align: left; font-size: 11px; }
    table.rank td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    .red { color: #dc2626; } .green { color: #16a34a; } .orange { color: #d97706; }
    @media print { body { padding: 15px; } }
  </style>
</head>
<body>
  <h1>Cierre del Día — Andesmar Cargas</h1>
  <div class="subtitle">Fecha: ${data.date} · Cerrado a las ${data.closedAt}</div>

  <div class="grid">
    <div>
      <h2>Resumen operativo</h2>
      <table class="kv-table">
        <tr><td>Total órdenes</td><td>${data.totalOrders}</td></tr>
        <tr><td>Entregas</td><td>${data.totalDeliveries}</td></tr>
        <tr><td>Retiros</td><td>${data.totalPickups}</td></tr>
        <tr><td>Aprobadas</td><td class="green">${data.totalApproved ?? '—'}</td></tr>
        <tr><td>Rechazadas</td><td class="red">${data.totalRejected}</td></tr>
        <tr><td>Pendientes</td><td class="orange">${data.totalPending ?? '—'}</td></tr>
        <tr><td>Efectividad general</td><td>${data.effectivenessGeneral}%</td></tr>
        <tr><td>Efectividad entregas</td><td>${data.effectivenessDeliveries}%</td></tr>
        <tr><td>Efectividad retiros</td><td>${data.effectivenessPickups}%</td></tr>
        <tr><td>OTD</td><td>${data.otdPercent}%</td></tr>
      </table>

      <h2>Top motivos de rechazo</h2>
      <table class="rank">
        <thead><tr><th>#</th><th>Motivo</th><th>Cant.</th></tr></thead>
        <tbody>${topReasonsRows || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody>
      </table>

      <h2>Resumen por sucursal</h2>
      <table class="rank">
        <tbody>${depositosRows || '<tr><td>Sin datos</td></tr>'}</tbody>
      </table>
    </div>

    <div>
      <h2>Top conductores con más rechazadas</h2>
      <table class="rank">
        <thead><tr><th>#</th><th>Conductor</th><th>Vehículo</th><th>Rechazadas</th></tr></thead>
        <tbody>${topDriversRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody>
      </table>

      <h2>Top 5 clientes con más rechazadas</h2>
      <table class="rank">
        <thead><tr><th>#</th><th>Cliente / Proveedor</th><th>Rechazadas</th></tr></thead>
        <tbody>${topClientsRows || '<tr><td colspan="3">Sin datos</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

/**
 * Renderiza la tabla del historial de cierres desde localStorage.
 */
function renderClosureHistory() {
  const tbody = document.getElementById('closureHistoryBody');
  if (!tbody) return;

  // Obtener todas las claves de cierre del localStorage
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fleet_closure_')) keys.push(key);
  }

  if (keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state"><div>Sin cierres registrados</div></div>
    </td></tr>`;
    return;
  }

  // Ordenar por fecha DESC
  keys.sort().reverse();

  tbody.innerHTML = keys.map(key => {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(key));
    } catch {
      return '';
    }
    if (!data) return '';

    return `<tr>
      <td>${data.date || '—'}</td>
      <td>${data.totalOrders ?? '—'}</td>
      <td>${data.effectivenessGeneral ?? '—'}%</td>
      <td style="color:var(--color-danger)">${data.totalRejected ?? '—'}</td>
      <td class="text-muted">${data.closedAt || '—'}</td>
      <td>
        <button class="btn-secondary" style="padding:4px 10px;font-size:12px;"
          onclick="showClosureDetail('${key}')">Ver detalle</button>
      </td>
    </tr>`;
  }).join('');
}

/**
 * Muestra el modal de detalle de un cierre específico.
 * @param {string} key — clave en localStorage
 */
function showClosureDetail(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const pre = document.getElementById('closureDetailContent');
  if (pre) {
    try {
      pre.textContent = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      pre.textContent = raw;
    }
  }
  const printBtn = document.getElementById('btnPrintDetail');
  if (printBtn) printBtn.onclick = () => printClosureSummary(key);
  document.getElementById('closureDetailModal').style.display = 'flex';
}

/**
 * Exporta todos los cierres del localStorage como CSV.
 */
function exportClosureCSV() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fleet_closure_')) keys.push(key);
  }

  if (keys.length === 0) {
    alert('No hay cierres registrados para exportar.');
    return;
  }

  const headers = [
    'Fecha','Total Órdenes','Entregas','Retiros','Rechazadas',
    'Efectividad General %','Efectividad Entregas %','Efectividad Retiros %',
    'OTD %','Cerrado a las'
  ];

  const rows = keys.sort().map(key => {
    let d;
    try { d = JSON.parse(localStorage.getItem(key)); } catch { return null; }
    if (!d) return null;
    return [
      d.date, d.totalOrders, d.totalDeliveries, d.totalPickups, d.totalRejected,
      d.effectivenessGeneral, d.effectivenessDeliveries, d.effectivenessPickups,
      d.otdPercent, d.closedAt
    ].map(v => `"${v ?? ''}"`).join(',');
  }).filter(Boolean);

  const csv     = [headers.join(','), ...rows].join('\n');
  const blob    = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  link.href     = url;
  link.download = `cierres_flota_${getTodayString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Verifica a las 23:55 si se debe hacer el cierre automático.
 * Se llama con setInterval cada minuto desde main.js.
 */
function checkAutoClosure() {
  const now  = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (hhmm === '23:55') {
    // Evitar doble cierre: verificar si ya se cerró hoy
    const key = `fleet_closure_${getTodayString()}`;
    if (!localStorage.getItem(key)) {
      closeDayProcedure();
    }
  }
}
