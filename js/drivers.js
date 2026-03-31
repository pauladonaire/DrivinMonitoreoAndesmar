/* ============================================================
   drivers.js — Efectividad por conductor con paginación y sorting
   ============================================================ */

/**
 * Inicializa los listeners de sorting en la tabla de conductores.
 * Llamar una sola vez desde main.js.
 */
function initDriversTableSorting() {
  document.querySelectorAll('#driversTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (APP_STATE.driversSort.col === col) {
        APP_STATE.driversSort.dir = APP_STATE.driversSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        APP_STATE.driversSort.col = col;
        APP_STATE.driversSort.dir = 'asc';
      }
      document.querySelectorAll('#driversTable thead th').forEach(t =>
        t.classList.remove('sort-asc', 'sort-desc')
      );
      th.classList.add(
        APP_STATE.driversSort.dir === 'asc' ? 'sort-asc' : 'sort-desc'
      );
      APP_STATE.driversPage = 1;
      renderDriversTable();
    });
  });
}

/**
 * Agrega las órdenes filtradas por conductor y calcula métricas.
 *
 * FÓRMULA DE EFECTIVIDAD:
 *   approved   = órdenes con status 'approved' o 'delivered'
 *   gestionadas = órdenes con status != 'pending'
 *   efectividad = approved / gestionadas × 100
 *
 * TIEMPO EN RUTA (corregido para no duplicar):
 *   Se agrupa por route_started_at. Para cada grupo, se toma el
 *   mayor pod_arrival (o route_finished_at) como fin de ruta.
 *   El tiempo final = Σ (fin_grupo - inicio_grupo) por cada ruta única.
 *
 * @returns {Object[]} array de filas de conductor ordenables
 */
function buildDriverRows() {
  const orders = APP_STATE.filteredOrders;

  const map = {};

  orders.forEach(o => {
    const key = o.driver_name || '(sin conductor)';
    if (!map[key]) {
      map[key] = {
        driver_name:  key,
        driver_email: o.driver_email || '',
        vehicle_code: o.vehicle_code || '',
        total:      0,
        entregas:   0,
        retiros:    0,
        aprobadas:  0,
        rechazadas: 0,
        pending:    0,
        // Para tiempo en ruta: mapa de rutas únicas por route_started_at
        // { routeKey: { startedMs, maxEndMs, hasEnd } }
        routeMap: {},
      };
    }

    const d = map[key];
    d.total++;

    if (o.category === 'delivery') d.entregas++;
    if (o.category === 'pickup')   d.retiros++;

    // "Aprobadas" = entregadas exitosamente (API usa 'approved' o 'delivered')
    if (o.status === 'approved' || o.status === 'delivered') d.aprobadas++;
    if (o.status === 'rejected')  d.rechazadas++;
    if (o.status === 'pending')   d.pending++;

    // Acumular tiempo de ruta sin duplicar:
    // Usamos el stop original (_stop) para acceder a TODOS sus pod_arrivals
    if (o._stop && o._stop.route_started_at) {
      const stop      = o._stop;
      const routeKey  = stop.route_started_at; // clave única de ruta
      const startedMs = new Date(stop.route_started_at).getTime();

      if (!d.routeMap[routeKey]) {
        d.routeMap[routeKey] = {
          startedMs,
          maxEndMs: 0,
          hasEnd:   false,
        };
      }

      const rg = d.routeMap[routeKey];

      // Revisar todos los pod_arrivals de TODAS las órdenes de este stop
      // (no solo las filtradas) para obtener el fin real de la ruta
      (stop.orders || []).forEach(ord => {
        if (ord.pod_arrival) {
          const t = new Date(ord.pod_arrival).getTime();
          if (!isNaN(t)) {
            rg.hasEnd   = true;
            rg.maxEndMs = Math.max(rg.maxEndMs, t);
          }
        }
      });

      // Fallback: route_finished_at
      if (!rg.hasEnd && stop.route_finished_at) {
        const t = new Date(stop.route_finished_at).getTime();
        if (!isNaN(t)) {
          rg.hasEnd   = true;
          rg.maxEndMs = Math.max(rg.maxEndMs, t);
        }
      }
    }
  });

  // Convertir a array con métricas calculadas
  return Object.values(map).map(d => {
    // Efectividad: aprobadas / gestionadas (excluye pendientes del denominador)
    const gestionadas = d.total - d.pending;
    const eff = gestionadas > 0
      ? parseFloat(((d.aprobadas / gestionadas) * 100).toFixed(1))
      : 0;

    // Tiempo en ruta: sumar cada ruta única (evita duplicado)
    let totalMinRuta   = 0;
    let tieneEnCurso   = false;

    Object.values(d.routeMap).forEach(rg => {
      if (!rg.hasEnd) {
        tieneEnCurso = true;
        return;
      }
      if (rg.maxEndMs > rg.startedMs) {
        totalMinRuta += Math.floor((rg.maxEndMs - rg.startedMs) / 60000);
      }
    });

    let routeTimeStr;
    if (totalMinRuta > 0) {
      const h = Math.floor(totalMinRuta / 60);
      const m = totalMinRuta % 60;
      routeTimeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      if (tieneEnCurso) routeTimeStr += '+';
    } else if (tieneEnCurso) {
      routeTimeStr = 'en-curso';
    } else {
      routeTimeStr = '—';
    }

    return {
      driver_name:  d.driver_name,
      driver_email: d.driver_email,
      vehicle_code: d.vehicle_code,
      total:        d.total,
      entregas:     d.entregas,
      retiros:      d.retiros,
      aprobadas:    d.aprobadas,
      rechazadas:   d.rechazadas,
      eff,
      routeTime:    routeTimeStr,
    };
  });
}

/**
 * Renderiza la tabla de conductores con paginación y sorting.
 */
function renderDriversTable() {
  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;

  let rows = buildDriverRows();

  // Ordenamiento
  if (APP_STATE.driversSort.col) {
    const col = APP_STATE.driversSort.col;
    const dir = APP_STATE.driversSort.dir;
    rows.sort((a, b) => {
      let va = a[col] ?? '';
      let vb = b[col] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ?  1 : -1;
      return 0;
    });
  } else {
    // Default: ordenar por efectividad DESC
    rows.sort((a, b) => b.eff - a.eff);
  }

  const total    = rows.length;
  const pageSize = APP_STATE.driversPageSize;
  const page     = Math.max(1, Math.min(APP_STATE.driversPage, Math.ceil(total / pageSize) || 1));
  APP_STATE.driversPage = page;

  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="11">
      <div class="empty-state"><div>Sin conductores para los filtros seleccionados</div></div>
    </td></tr>`;
    renderDriversPagination(0, pageSize, page);
    return;
  }

  tbody.innerHTML = pageRows.map(row => {
    const info     = APP_STATE.driversMap[row.driver_email] || {};
    const phone    = info.phone || null;
    const effClass = effectivenessClass(row.eff);
    const routeHtml = row.routeTime === 'en-curso'
      ? `<span class="badge-en-curso">En curso</span>`
      : esc(row.routeTime);

    return `<tr>
      <td>${esc(row.driver_name)}</td>
      <td class="text-muted">${phone ? esc(phone) : '<span class="no-phone">Sin tel.</span>'}</td>
      <td class="text-muted">${esc(row.vehicle_code)}</td>
      <td><strong>${row.total}</strong></td>
      <td>${row.entregas}</td>
      <td>${row.retiros}</td>
      <td style="color:var(--color-success)">${row.aprobadas}</td>
      <td style="color:var(--color-danger)">${row.rechazadas}</td>
      <td><span class="${effClass}">${row.eff}%</span></td>
      <td>${routeHtml}</td>
      <td>${renderContactButtons(phone)}</td>
    </tr>`;
  }).join('');

  renderDriversPagination(total, pageSize, page);
}

/**
 * Renderiza la paginación de la tabla de conductores.
 */
function renderDriversPagination(total, pageSize, currentPage) {
  const container = document.getElementById('driversPagination');
  if (!container) return;

  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goToDriversPage(${currentPage - 1})"
    ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  getPageNumbers(currentPage, totalPages).forEach(p => {
    if (p === '...') {
      html += `<span class="page-btn" style="cursor:default;opacity:.4;">…</span>`;
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}"
        onclick="goToDriversPage(${p})">${p}</button>`;
    }
  });

  html += `<button class="page-btn" onclick="goToDriversPage(${currentPage + 1})"
    ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;

  container.innerHTML = html;
}

/**
 * Navega a una página de la tabla de conductores.
 */
function goToDriversPage(page) {
  APP_STATE.driversPage = page;
  renderDriversTable();
  document.getElementById('driversTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
