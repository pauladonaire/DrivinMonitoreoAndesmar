/* ============================================================
   respuestas.js — Módulo de Respuestas de Destinatarios
   Gestiona el panel lateral de pre-entregas y actualizaciones
   de dirección respondidas por los destinatarios.
   ============================================================ */

// [RESPUESTAS — estado del módulo]
window.RESP_STATE = {
  preEntrega:   [],            // filas crudas de Hoja 1 (Pre-Entrega)
  actDireccion: [],            // filas crudas de Hoja 2 (Actualización Dirección)
  todos:        [],            // array unificado con prioridad calculada
  filteredDep:  '',            // CND seleccionado en el filtro
  activeTab:    'urgente',
  panelOpen:    false,
  refreshTimer: null,
  REFRESH_MS:   5 * 60 * 1000 // refresco cada 5 minutos
};

/* ============================================================
   CRUCE CON rawData
   ============================================================ */

// [RESPUESTAS — cruce de orden con rawData]
function getDepositoDeOrden(nroOrden) {
  if (!nroOrden || !APP_STATE.rawData) return null;
  const nroStr = String(nroOrden).trim();
  for (const stop of APP_STATE.rawData) {
    for (const order of (stop.orders || [])) {
      if (String(order.code).trim()     === nroStr ||
          String(order.alt_code).trim() === nroStr) {
        return {
          schema_name:  stop.schema_name  || '',
          driver_name:  stop.driver_name  || '',
          vehicle_code: stop.vehicle_code || '',
          driver_email: stop.driver_email || ''
        };
      }
    }
  }
  return null;
}

// [RESPUESTAS — teléfono del conductor desde driversMap]
function getConductorPhone(driverEmail) {
  if (!driverEmail || !APP_STATE.driversMap) return null;
  const d = APP_STATE.driversMap[driverEmail.toLowerCase()];
  return d ? d.phone : null;
}

/* ============================================================
   CARGA DE DATOS
   ============================================================ */

// [RESPUESTAS — carga desde GAS y enriquece con datos locales]
async function loadRespuestas() {
  try {
    const url  = GAS_WEBAPP_URL + '?action=get_respuestas_pendientes';
    const res  = await fetch(url);
    const json = await res.json();
    if (json.status !== 'ok') return;

    RESP_STATE.preEntrega   = json.data.preEntrega   || [];
    RESP_STATE.actDireccion = json.data.actDireccion || [];

    // Unificar y calcular prioridad
    RESP_STATE.todos = [
      // Hoja 2 siempre es urgente: el conductor ya intentó y falló
      ...RESP_STATE.actDireccion.map(r => enrichRespuesta(r, 'urgente')),
      // Hoja 1: prioridad según dir. correcta + estará presente
      ...RESP_STATE.preEntrega.map(r => {
        let prio = 'info';
        if (r.dirCorrecta === 'No')                                        prio = 'urgente';
        else if (r.estaraPresenté === 'No')                                prio = 'aviso';
        return enrichRespuesta(r, prio);
      })
    ].sort((a, b) => {
      const order = { urgente: 0, aviso: 1, info: 2 };
      return order[a.prioridad] - order[b.prioridad];
    });

    updateAlertBadge();
    populateDepSelect();
    if (RESP_STATE.panelOpen) renderDrawerBody();
    marcarOrdenesEnTabla();

  } catch(e) {
    console.warn('[Respuestas] Error al cargar:', e.message);
  }
}

// [RESPUESTAS — enriquece una fila con depósito/conductor cruzado]
function enrichRespuesta(r, prioridad) {
  const cruce = getDepositoDeOrden(r.nroOrden);
  return {
    ...r,
    prioridad,
    schema_name:  cruce ? cruce.schema_name  : '',
    driver_name:  cruce ? cruce.driver_name  : (r.driver_name  || ''),
    vehicle_code: cruce ? cruce.vehicle_code : '',
    driver_email: cruce ? cruce.driver_email : ''
  };
}

/* ============================================================
   BADGE DE ALERTA EN EL HEADER
   ============================================================ */

// [RESPUESTAS — actualiza el badge de alerta en el header]
function updateAlertBadge() {
  const pendientes = RESP_STATE.todos.filter(r => r.estado === 'Pendiente').length;
  const btn  = document.getElementById('resp-alert-btn');
  if (!btn) return;

  const span = btn.querySelector('.resp-alert-txt');
  const dot  = btn.querySelector('.resp-dot');

  if (pendientes === 0) {
    btn.style.background  = '#14532d';
    btn.style.borderColor = '#22c55e';
    btn.style.color       = '#86efac';
    if (span) span.textContent   = 'Todo gestionado';
    if (dot)  dot.style.background = '#22c55e';
  } else {
    btn.style.background  = '#ef4444';
    btn.style.borderColor = '#ef4444';
    btn.style.color       = 'white';
    if (span) span.textContent   = pendientes + ' respuestas sin gestionar';
    if (dot)  dot.style.background = 'white';
  }
}

/* ============================================================
   PANEL LATERAL
   ============================================================ */

// [RESPUESTAS — abre/cierra el panel lateral]
function togglePanel() {
  RESP_STATE.panelOpen = !RESP_STATE.panelOpen;
  const panel = document.getElementById('resp-panel');
  const btn   = document.getElementById('resp-alert-btn');
  const icon  = document.getElementById('resp-alert-icon');

  if (!panel) return;

  panel.classList.toggle('resp-panel-open', RESP_STATE.panelOpen);
  if (btn)  btn.classList.toggle('resp-btn-active', RESP_STATE.panelOpen);
  if (icon) icon.style.transform = RESP_STATE.panelOpen ? 'rotate(180deg)' : 'rotate(0deg)';

  if (RESP_STATE.panelOpen) renderDrawerBody();
}

// [RESPUESTAS — renderiza el cuerpo del drawer con filtro y tab activos]
function renderDrawerBody() {
  const body = document.getElementById('resp-drawer-body');
  if (!body) return;

  const dep = RESP_STATE.filteredDep;
  const tab = RESP_STATE.activeTab;

  let items = RESP_STATE.todos.filter(r => r.estado === 'Pendiente');
  if (dep) items = items.filter(r => r.schema_name === dep);

  if (tab === 'urgente') items = items.filter(r => r.prioridad === 'urgente');
  if (tab === 'aviso')   items = items.filter(r => r.prioridad === 'aviso');
  if (tab === 'info')    items = items.filter(r => r.prioridad === 'info');

  if (items.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;padding:32px 16px;">
        <div style="font-size:28px;margin-bottom:8px">✅</div>
        <div style="font-size:11px;color:#7a9ab8">Sin respuestas pendientes en esta categoría</div>
      </div>`;
    updateTabCounts();
    return;
  }

  body.innerHTML = items.map(r => buildRespCard(r)).join('');
  updateTabCounts();
}

/* ============================================================
   TARJETA DE RESPUESTA
   ============================================================ */

// [RESPUESTAS — construye el HTML de una tarjeta de respuesta]
function buildRespCard(r) {
  const borderColor = r.prioridad === 'urgente' ? '#ef4444'
                    : r.prioridad === 'aviso'   ? '#eab308'
                    : '#22c55e';

  const prioLabel = r.prioridad === 'urgente' ? 'URGENTE — en ruta'
                  : r.prioridad === 'aviso'   ? 'AVISO — coordinar'
                  : 'INFO — con referencia';

  const prioBg    = r.prioridad === 'urgente' ? '#450a0a'
                  : r.prioridad === 'aviso'   ? '#451a03'
                  : '#14532d';
  const prioColor = r.prioridad === 'urgente' ? '#fca5a5'
                  : r.prioridad === 'aviso'   ? '#fed7aa'
                  : '#86efac';

  // Flags visuales según hoja y datos
  const flags = [];
  if (r.hoja === 'Pre-Entrega') {
    if (r.dirCorrecta === 'Sí') flags.push({ cls:'flag-green',  ico:'ti-check',          txt:'Dir. correcta'  });
    else                        flags.push({ cls:'flag-red',    ico:'ti-x',              txt:'Dir. incorrecta' });
    if (r.estaraPresenté === 'Sí') flags.push({ cls:'flag-green',  ico:'ti-check',       txt:'Estará presente' });
    else                           flags.push({ cls:'flag-yellow', ico:'ti-clock',        txt:'No estará'       });
  } else {
    flags.push({ cls:'flag-red', ico:'ti-x', txt:'Intento fallido' });
    if (r.motivo) flags.push({ cls:'flag-yellow', ico:'ti-alert-triangle', txt: r.motivo.replace(/"/g,'') });
  }
  if (r.linkMaps)   flags.push({ cls:'flag-blue', ico:'ti-map-pin', txt:'Maps disponible' });
  if (r.referencia) flags.push({ cls:'flag-blue', ico:'ti-message',  txt:'Con referencia'  });

  const flagsHtml = flags.map(f =>
    `<span class="resp-flag resp-${f.cls}">
       <i class="ti ${f.ico}" style="font-size:8px" aria-hidden="true"></i> ${f.txt}
     </span>`
  ).join('');

  const depBadge = r.schema_name
    ? `<span class="resp-dep-badge">${r.schema_name}</span>`
    : '';

  const refHtml = (r.referencia || r.dirCorregida)
    ? `<div class="resp-ref">"${
        r.dirCorregida
          ? r.dirCorregida + (r.ciudad ? ', ' + r.ciudad : '') + '. '
          : ''
      }${r.referencia || ''}"</div>`
    : '';

  // WhatsApp al conductor
  const phone = getConductorPhone(r.driver_email);
  const waNum = phone ? phone.replace(/[\s\-\+\(\)]/g,'') : '';
  const waMsg = phone
    ? encodeURIComponent(
        `Hola ${r.driver_name || 'conductor'}, el destinatario de la orden ${r.nroOrden} ` +
        (r.dirCorregida ? `corrigió su dirección: ${r.dirCorregida}${r.ciudad ? ', '+r.ciudad : ''}. ` : '') +
        (r.referencia   ? `Referencia: ${r.referencia}. ` : '') +
        (r.linkMaps     ? `Maps: ${r.linkMaps}` : '')
      )
    : '';

  const btnWA = phone
    ? `<button class="resp-btn resp-btn-wa"
               onclick="window.open('https://wa.me/${waNum}?text=${waMsg}','_blank')">WhatsApp</button>`
    : `<button class="resp-btn" style="opacity:0.4;cursor:default" disabled title="Sin teléfono registrado">Sin tel.</button>`;

  const btnMaps = r.linkMaps
    ? `<button class="resp-btn resp-btn-maps"
               onclick="window.open('${r.linkMaps}','_blank')">Maps</button>`
    : '';

  const cardId = 'resp-card-' + r.nroOrden.replace(/[^a-zA-Z0-9]/g,'') + '-' + r.hoja.replace(/\s/g,'');

  return `
    <div class="resp-card" id="${cardId}" style="border-left-color:${borderColor}">
      <div class="resp-card-top">
        <span class="resp-hora">${r.fechaHora}</span>
        <span class="resp-prio" style="background:${prioBg};color:${prioColor}">${prioLabel}</span>
      </div>
      <div class="resp-orden">Orden ${r.nroOrden}</div>
      <div class="resp-meta">
        <span>${r.driver_name || 'sin asignar'}</span>
        ${r.vehicle_code ? `<span>— ${r.vehicle_code}</span>` : ''}
        ${depBadge}
      </div>
      <div class="resp-flags">${flagsHtml}</div>
      ${refHtml}
      <div class="resp-actions">
        <button class="resp-btn resp-btn-gestionar"
                onclick="gestionarRespuesta('${r.hoja.replace(/'/g,"\\'")}','${r.nroOrden}','${cardId}')">
          Marcar gestionado
        </button>
        ${btnWA}
        ${btnMaps}
      </div>
    </div>`;
}

/* ============================================================
   ACCIÓN: GESTIONAR RESPUESTA
   ============================================================ */

// [RESPUESTAS — envía la gestión al GAS y actualiza estado local]
async function gestionarRespuesta(hoja, nroOrden, cardId) {
  const user = (typeof getSession === 'function') ? getSession() : null;
  if (!user) { alert('Debe estar logueado para gestionar respuestas.'); return; }

  const card = document.getElementById(cardId);
  if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }

  try {
    const now = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const res  = await fetch(GAS_WEBAPP_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:         'gestionar_respuesta',
        hoja,
        nroOrden,
        usuario:        user.usuario        || '',
        nombreCompleto: user.nombre_completo || user.usuario || '',
        gestionadoAt:   now
      })
    });
    const json = await res.json();

    if (json.status === 'ok') {
      // Actualizar estado local
      const item = RESP_STATE.todos.find(r => r.nroOrden === nroOrden && r.hoja === hoja);
      if (item) item.estado = 'Gestionado';

      updateAlertBadge();
      updateTabCounts();
      marcarOrdenesEnTabla();

      // Animar la remoción de la tarjeta
      if (card) {
        card.style.transition = 'opacity 0.4s, max-height 0.4s';
        card.style.maxHeight  = card.scrollHeight + 'px';
        requestAnimationFrame(() => {
          card.style.opacity   = '0';
          card.style.maxHeight = '0';
          card.style.padding   = '0';
          card.style.margin    = '0';
        });
        setTimeout(() => { card.style.display = 'none'; }, 450);
      }

    } else {
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
      console.error('[Respuestas] Error al gestionar:', json.message);
    }

  } catch(e) {
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
    console.error('[Respuestas] Error de red:', e.message);
  }
}

/* ============================================================
   BADGES EN LA TABLA DE ÓRDENES
   ============================================================ */

// [RESPUESTAS — pone un badge en la columna código de la tabla principal]
function marcarOrdenesEnTabla() {
  // Limpiar badges previos
  document.querySelectorAll('.resp-orden-badge').forEach(el => el.remove());

  RESP_STATE.todos.forEach(r => {
    document.querySelectorAll('[data-orden-code]').forEach(cell => {
      if (cell.dataset.ordenCode !== r.nroOrden) return;
      if (cell.querySelector('.resp-orden-badge')) return;

      const badge = document.createElement('span');
      badge.className = 'resp-orden-badge';
      badge.style.cssText = `
        font-size:7.5px;font-weight:600;padding:1px 5px;border-radius:3px;
        cursor:pointer;display:inline-block;margin-left:4px;
        background:${r.prioridad==='urgente'?'#450a0a':r.prioridad==='aviso'?'#451a03':'#14532d'};
        color:${r.prioridad==='urgente'?'#fca5a5':r.prioridad==='aviso'?'#fed7aa':'#86efac'};
        ${r.estado==='Gestionado'?'opacity:0.5':''}
      `;
      badge.textContent = r.prioridad === 'urgente' ? 'Dir. fallida'
                        : r.prioridad === 'aviso'   ? 'No estará'
                        : 'Pre-ent.';
      badge.title   = 'Click para abrir el panel de gestión';
      badge.onclick = () => { if (!RESP_STATE.panelOpen) togglePanel(); };
      cell.appendChild(badge);
    });
  });
}

/* ============================================================
   TABS Y CONTADORES
   ============================================================ */

// [RESPUESTAS — actualiza los contadores de tabs y footer]
function updateTabCounts() {
  const dep   = RESP_STATE.filteredDep;
  let items   = RESP_STATE.todos.filter(r => r.estado === 'Pendiente');
  if (dep) items = items.filter(r => r.schema_name === dep);

  const nUrgente    = items.filter(r => r.prioridad === 'urgente').length;
  const nAviso      = items.filter(r => r.prioridad === 'aviso').length;
  const nInfo       = items.filter(r => r.prioridad === 'info').length;
  const nGestionado = RESP_STATE.todos.filter(r => r.estado === 'Gestionado').length;

  // Tabs
  const tabs = document.querySelectorAll('.resp-dtab');
  if (tabs[0]) tabs[0].textContent = `Dir. fallida (${nUrgente})`;
  if (tabs[1]) tabs[1].textContent = `No estará (${nAviso})`;
  if (tabs[2]) tabs[2].textContent = `Info (${nInfo})`;

  // Counter en el header del drawer
  const total   = nUrgente + nAviso + nInfo;
  const counter = document.getElementById('resp-pend-count');
  if (counter) counter.textContent = total + ' pend.';

  // Footer stats
  const elU = document.getElementById('resp-count-urgente');
  const elA = document.getElementById('resp-count-aviso');
  const elI = document.getElementById('resp-count-info');
  const elG = document.getElementById('resp-count-gestionado');
  if (elU) elU.textContent = nUrgente;
  if (elA) elA.textContent = nAviso;
  if (elI) elI.textContent = nInfo;
  if (elG) elG.textContent = nGestionado;
}

// [RESPUESTAS — cambia el tab activo]
function setRespTab(tab) {
  RESP_STATE.activeTab = tab;
  document.querySelectorAll('.resp-dtab').forEach(t => t.classList.remove('active'));
  const activeEl = document.querySelector(`.resp-dtab[data-tab="${tab}"]`);
  if (activeEl) activeEl.classList.add('active');
  renderDrawerBody();
}

/* ============================================================
   FILTRO POR DEPÓSITO
   ============================================================ */

// [RESPUESTAS — filtra por depósito desde el select del panel]
function filterByDeposito() {
  const sel = document.getElementById('resp-dep-select');
  RESP_STATE.filteredDep = sel ? sel.value : '';
  renderDrawerBody();
  updateTabCounts();
}

// [RESPUESTAS — pobla el select con los CNDs disponibles en rawData]
function populateDepSelect() {
  const sel = document.getElementById('resp-dep-select');
  if (!sel || !APP_STATE.rawData) return;

  const cnds = [...new Set(APP_STATE.rawData.map(s => s.schema_name).filter(Boolean))].sort();
  const prev = sel.value || '';
  sel.innerHTML = '<option value="">Todos los depósitos</option>' +
    cnds.map(c => `<option value="${c}"${c===prev?' selected':''}>${c}</option>`).join('');
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

// [RESPUESTAS — inicializa el módulo; llamar desde main.js después de cargar rawData]
// [RESPUESTAS — ajusta el top del panel midiendo la posición real del filtro]
function _positionRespPanel() {
  const filtersEl = document.querySelector('.filters-panel');
  const panel     = document.getElementById('resp-panel');
  if (filtersEl && panel) {
    panel.style.top = filtersEl.getBoundingClientRect().bottom + 'px';
  }
}

function initRespuestas() {
  _positionRespPanel();
  window.addEventListener('resize', _positionRespPanel);

  populateDepSelect();
  loadRespuestas();

  // Refresco cada 5 minutos, independiente del refresco principal de PODs
  if (RESP_STATE.refreshTimer) clearInterval(RESP_STATE.refreshTimer);
  RESP_STATE.refreshTimer = setInterval(() => {
    populateDepSelect();
    loadRespuestas();
  }, RESP_STATE.REFRESH_MS);
}
