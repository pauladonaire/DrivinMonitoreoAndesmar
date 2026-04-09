/* ============================================================
   table.js — Tabla principal paginada y ordenable + Lightbox
   ============================================================ */

// ---- Variables del lightbox ----
let _lbImages = [];
let _lbIndex  = 0;

// Número total de columnas de la tabla (para colspans)
const TABLE_COLS = 24; // +2: PARADA + VISITÓ?

/** Inicializa los listeners de ordenamiento en th.sortable */
function initTableSorting() {
  document.querySelectorAll('#mainTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (APP_STATE.sortCol === col) {
        APP_STATE.sortDir = APP_STATE.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        APP_STATE.sortCol = col;
        APP_STATE.sortDir = 'asc';
      }
      document.querySelectorAll('#mainTable thead th').forEach(t =>
        t.classList.remove('sort-asc', 'sort-desc')
      );
      th.classList.add(APP_STATE.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      APP_STATE.currentPage = 1;
      renderTable();
    });
  });
}

/**
 * Renderiza la tabla principal con paginación.
 */
function renderTable() {
  const tbody   = document.getElementById('mainTableBody');
  const countEl = document.getElementById('tableCount');
  if (!tbody) return;

  let data = [...APP_STATE.filteredOrders];

  // Ordenamiento
  if (APP_STATE.sortCol) {
    data.sort((a, b) => {
      let va = a[APP_STATE.sortCol] ?? '';
      let vb = b[APP_STATE.sortCol] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return APP_STATE.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return APP_STATE.sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // Paginación
  const total    = data.length;
  const pageSize = APP_STATE.pageSize;
  const page     = APP_STATE.currentPage;
  const pageData = data.slice((page - 1) * pageSize, page * pageSize);

  if (countEl) countEl.textContent = `${total} órdenes`;

  if (total === 0) {
    tbody.innerHTML = `
      <tr><td colspan="${TABLE_COLS}">
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div>Sin órdenes para los filtros seleccionados</div>
        </div>
      </td></tr>`;
    renderPagination(0, pageSize, page);
    return;
  }

  tbody.innerHTML = pageData.map(row => buildTableRow(row)).join('');
  renderPagination(total, pageSize, page);
}

/**
 * Construye el HTML de una fila de la tabla.
 * Incluye columna "Tel. Destino" con botones de contacto
 * obtenidos del addressesMap via address_name del stop.
 * @param {Object} row
 * @returns {string}
 */
function buildTableRow(row) {
  // ---- Imágenes ----
  const allImages = [...(row.stop_images || []), ...(row.order_images || [])];
  const imgsHtml  = allImages.length > 0
    ? `<button class="icon-link"
        onclick='openLightbox(${JSON.stringify(allImages)}, 0)'
        title="${allImages.length} imagen(es)">🖼️ ${allImages.length}</button>`
    : '—';

  // ---- POD ----
  const podUrl  = row.pdf_pod_order || row.pdf_pod;
  const podHtml = podUrl
    ? `<a class="icon-link" href="${podUrl}" target="_blank" title="Ver POD">📄</a>`
    : '—';

  // ---- Tiempo en ruta ----
  const routeTime = row._stop ? calcRouteTime(row._stop) : '—';
  const routeHtml = routeTime === 'en-curso'
    ? `<span class="badge-en-curso">En curso</span>`
    : routeTime;

  // ---- Teléfono de destino (directo de v2/pods, campo dest_phone) ----
  const addrPhone       = row.dest_phone || APP_STATE.addressesMap[row.address_name]?.phone || null;
  const addrContactHtml = renderContactButtons(addrPhone);

  // ---- Mejora 3: cerca del punto de entrega ----
  const nearPodHtml = row.near_pod === true
    ? '<span class="badge badge--delivered">✓ Cerca</span>'
    : row.near_pod === false
      ? '<span class="badge badge--rejected">✗ Lejos</span>'
      : '—';

  // ---- Campos custom ----
  const montoCobrar = row.monto_cobrar ? `$${esc(row.monto_cobrar)}` : '—';
  const rtoHtml     = row.rto
    ? `<span class="badge-rto" title="Remito conformado">${esc(row.rto)}</span>`
    : '—';

  // ---- Tooltip de dirección en código de orden ----
  const addrLine1 = esc(row.address_address_1);
  const addrCity  = esc(row.address_city);
  const addrProv  = esc(row.address_county);
  const addrTooltip = (addrLine1 || addrCity || addrProv)
    ? `<span class="td-has-tooltip">${esc(row.code)}<span class="td-tooltip-box"><strong>Dirección:</strong> ${addrLine1 || '—'}<br><strong>Localidad:</strong> ${addrCity || '—'}<br><strong>Provincia:</strong> ${addrProv || '—'}</span></span>`
    : esc(row.code);

  // ---- VISITÓ? ----
  const visitoHtml = row.visit_arrival
    ? (() => {
        const llegada = formatTime(row.visit_arrival);
        const salida  = formatTime(row.visit_leave);
        return `<span class="td-has-tooltip badge badge--delivered">SI<span class="td-tooltip-box">Llegada: ${llegada}<br>Salida: ${salida}</span></span>`;
      })()
    : '<span class="badge badge--rejected">NO</span>';

  // ---- PARADA ----
  const paradaHtml = row.position != null ? String(row.position) : '—';

  return `<tr>
    <td>${esc(row.description)}</td>
    <td class="text-muted" style="text-align:center;">${paradaHtml}</td>
    <td class="text-muted">${esc(row.alt_code) || '—'}</td>
    <td class="text-muted">${addrTooltip}</td>
    <td>${esc(row.client_name || row.address_customer_name)}</td>
    <td class="text-muted">${esc(row.supplier_name) || '—'}</td>
    <td>${addrContactHtml}</td>
    <td>${esc(row.driver_name)}</td>
    <td class="text-muted">${esc(row.vehicle_code)}</td>
    <td class="text-muted">${esc(row.schema_name)}</td>
    <td>${renderCategoryBadge(row.category)}</td>
    <td>${renderStatusBadge(row.status)}</td>
    <td class="text-muted">${row.units_1 != null ? row.units_1 : '—'}</td>
    <td class="text-muted">${row.units_2 != null ? row.units_2 : '—'}</td>
    <td class="text-muted">${formatTime(row.eta)}</td>
    <td class="text-muted">${formatTime(row.pod_arrival)}</td>
    <td style="text-align:center;">${visitoHtml}</td>
    <td class="text-muted">${esc(row.reason) || '—'}</td>
    <td class="text-muted">${esc(row.comment) || '—'}</td>
    <td>${nearPodHtml}</td>
    <td>${podHtml}</td>
    <td>${imgsHtml}</td>
    <td class="text-muted">${montoCobrar}</td>
    <td class="text-muted">${rtoHtml}</td>
  </tr>`;
}

/**
 * Renderiza los controles de paginación.
 */
function renderPagination(total, pageSize, currentPage) {
  const container = document.getElementById('pagination');
  if (!container) return;

  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goToPage(${currentPage - 1})"
    ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  getPageNumbers(currentPage, totalPages).forEach(p => {
    if (p === '...') {
      html += `<span class="page-btn" style="cursor:default;opacity:.4;">…</span>`;
    } else {
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}"
        onclick="goToPage(${p})">${p}</button>`;
    }
  });

  html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})"
    ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;

  container.innerHTML = html;
}

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

function goToPage(page) {
  const totalPages = Math.ceil(APP_STATE.filteredOrders.length / APP_STATE.pageSize);
  if (page < 1 || page > totalPages) return;
  APP_STATE.currentPage = page;
  renderTable();
  document.getElementById('mainTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   LIGHTBOX
   ============================================================ */

function openLightbox(images, index) {
  if (!images || images.length === 0) return;
  _lbImages = images;
  _lbIndex  = index;
  updateLightboxImage();
  document.getElementById('lightboxOverlay').style.display = 'flex';
}

function updateLightboxImage() {
  const img     = document.getElementById('lightboxImage');
  const counter = document.getElementById('lightboxCounter');
  const prev    = document.getElementById('lightboxPrev');
  const next    = document.getElementById('lightboxNext');

  if (img)     img.src = _lbImages[_lbIndex];
  if (counter) counter.textContent = `${_lbIndex + 1} / ${_lbImages.length}`;
  if (prev)    prev.style.display  = _lbImages.length > 1 ? 'flex' : 'none';
  if (next)    next.style.display  = _lbImages.length > 1 ? 'flex' : 'none';
}

function closeLightbox() {
  document.getElementById('lightboxOverlay').style.display = 'none';
  _lbImages = [];
  _lbIndex  = 0;
}

function lightboxPrev() {
  if (!_lbImages.length) return;
  _lbIndex = (_lbIndex - 1 + _lbImages.length) % _lbImages.length;
  updateLightboxImage();
}

function lightboxNext() {
  if (!_lbImages.length) return;
  _lbIndex = (_lbIndex + 1) % _lbImages.length;
  updateLightboxImage();
}

function initLightbox() {
  document.getElementById('lightboxOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'lightboxOverlay') closeLightbox();
  });
  document.getElementById('lightboxClose')?.addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev')?.addEventListener('click', lightboxPrev);
  document.getElementById('lightboxNext')?.addEventListener('click', lightboxNext);
  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay || overlay.style.display === 'none') return;
    if (e.key === 'ArrowLeft')  lightboxPrev();
    if (e.key === 'ArrowRight') lightboxNext();
    if (e.key === 'Escape')     closeLightbox();
  });
}
