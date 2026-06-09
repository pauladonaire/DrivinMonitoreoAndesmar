/* ============================================================
   objetivos.js — Bloque "OBJETIVOS DEL DÍA"
   Visible para: admin, monitoreo, monitoreosuc (todos los perfiles)
   Actualiza con cada ciclo de renderAll()
   ============================================================ */

let _objTiempoRutaDetalle = [];  // { vehicle, started, tipo, minutes }
let _tiempoRutaListenerAdded = false;

function renderObjetivos() {
  const section = document.getElementById('secObjetivos');
  if (!section) return;

  // Visibilidad según perfil — ocultar solo si no hay sesión activa
  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session) { section.style.display = 'none'; return; }
  section.style.display = '';

  const orders = APP_STATE.filteredOrders;

  if (!orders.length) {
    _objSetCard('objEfectividad', '—', '',     null);
    _objSetCard('objDomVisitado', '—', '',     null);
    _objSetCard('objTiempoRuta',  '—', '',     null);
    _objSetCard('objProdBultos',  '—', '',     null);
    _objSetCard('objNPS',         '—', '',     null);
    return;
  }

  const total     = orders.length;
  const aprobadas = orders.filter(o => o.status === 'approved').length;

  // --- Tarjeta 1: Efectividad ---
  const eff   = pct(aprobadas, total);
  const effOk = eff >= 95;
  _objSetCard('objEfectividad', eff + '%',
    `${aprobadas} aprobadas / ${total} total`,
    effOk,
    effOk ? 'Objetivo: 95%  ✓' : 'Objetivo: 95%  ✗'
  );

  // --- Tarjeta 2: Domicilio Visitado ---
  const rechazadas   = orders.filter(o => o.status === 'rejected');
  const rechSinDNV   = rechazadas.filter(o =>
    (o.reason || '').toLowerCase().trim() !== 'domicilio no visitado'
  );
  const visitados    = aprobadas + rechSinDNV.length;
  const dvPct        = pct(visitados, total);
  const dvOk         = dvPct >= 98;
  _objSetCard('objDomVisitado', dvPct + '%',
    `${visitados} visitados / ${total} total`,
    dvOk,
    dvOk ? 'Objetivo: 98%  ✓' : 'Objetivo: 98%  ✗'
  );

  // --- Tarjeta 3: Tiempo Promedio de Ruta ---
  _objRenderTiempoRuta(orders);

  // --- Tarjeta 4: Productividad Bultos ---
  _objRenderProdBultos(orders);

  // --- Tarjeta 5: NPS ---
  _objRenderNPS(orders);
}

/* --------- helpers internos --------- */

/**
 * Actualiza una tarjeta del bloque OBJETIVOS.
 * @param {string}       cardId
 * @param {string}       value   — valor principal (ej: "92.5%")
 * @param {string}       sub     — subtexto
 * @param {boolean|null} ok      — null = neutral, true = verde, false = rojo
 * @param {string}       [obj]   — texto de objetivo (ej: "Objetivo: 95%  ✓")
 */
function _objSetCard(cardId, value, sub, ok, obj) {
  const card  = document.getElementById(cardId);
  const valEl = document.getElementById(cardId + 'Val');
  const subEl = document.getElementById(cardId + 'Sub');
  const objEl = document.getElementById(cardId + 'Obj');

  if (valEl) valEl.textContent = value;
  if (subEl) subEl.textContent = sub  || '';
  if (objEl) objEl.textContent = obj  || '';

  if (!card) return;
  card.classList.remove('obj-card--ok', 'obj-card--fail');
  if (ok === true)       card.classList.add('obj-card--ok');
  else if (ok === false) card.classList.add('obj-card--fail');
}

function _objRenderTiempoRuta(orders) {
  const seenStops    = new Set();
  const cerradasMins = [];
  const enCursoMins  = [];
  const now          = Date.now();
  _objTiempoRutaDetalle = [];

  orders.forEach(o => {
    const stop = o._stop;
    if (!stop || !stop.route_started_at) return;

    const stopKey = (stop.vehicle_code || stop.description || '') + '||' + stop.route_started_at;
    if (seenStops.has(stopKey)) return;
    seenStops.add(stopKey);

    const startMs = new Date(stop.route_started_at).getTime();
    if (isNaN(startMs)) return;

    if (stop.route_finished_at) {
      // Cerrada: tiempo = max(pod_arrival de todas las órdenes) - route_started_at
      const arrivals = (stop.orders || [])
        .map(ord => ord.pod_arrival)
        .filter(Boolean)
        .map(t => new Date(t).getTime())
        .filter(t => !isNaN(t));

      const finMs = arrivals.length > 0
        ? Math.max(...arrivals)
        : new Date(stop.route_finished_at).getTime();

      if (!isNaN(finMs) && finMs > startMs) {
        const mins = Math.floor((finMs - startMs) / 60000);
        cerradasMins.push(mins);
        _objTiempoRutaDetalle.push({
          vehicle:  stop.vehicle_code || stop.description || '—',
          started:  stop.route_started_at,
          finished: stop.route_finished_at,
          tipo:     'cerrada',
          minutes:  mins
        });
      }
    } else {
      // En curso: tiempo = ahora - route_started_at
      if (now > startMs) {
        const mins = Math.floor((now - startMs) / 60000);
        enCursoMins.push(mins);
        _objTiempoRutaDetalle.push({
          vehicle:  stop.vehicle_code || stop.description || '—',
          started:  stop.route_started_at,
          finished: null,
          tipo:     'en curso',
          minutes:  mins
        });
      }
    }
  });

  // Registrar click handler una sola vez
  if (!_tiempoRutaListenerAdded) {
    const card = document.getElementById('objTiempoRuta');
    if (card) {
      card.addEventListener('click', showTiempoRutaModal);
      _tiempoRutaListenerAdded = true;
    }
  }

  const fmtMin = mins => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };

  const avgCerradas = cerradasMins.length > 0
    ? Math.round(cerradasMins.reduce((a, b) => a + b, 0) / cerradasMins.length)
    : null;
  const avgEnCurso  = enCursoMins.length > 0
    ? Math.round(enCursoMins.reduce((a, b) => a + b, 0) / enCursoMins.length)
    : null;

  const cerStr  = avgCerradas !== null ? fmtMin(avgCerradas) : '—';
  const curStr  = avgEnCurso  !== null ? fmtMin(avgEnCurso)  : '—';
  const tiempoOk = avgCerradas !== null ? avgCerradas >= 480 : null;

  const card  = document.getElementById('objTiempoRuta');
  const valEl = document.getElementById('objTiempoRutaVal');
  const subEl = document.getElementById('objTiempoRutaSub');
  const objEl = document.getElementById('objTiempoRutaObj');

  if (valEl) valEl.innerHTML =
    `<span class="obj-truta-row">Cerradas: <strong>${cerStr}</strong></span>` +
    `<span class="obj-truta-row">En curso:&nbsp; <strong>${curStr}</strong></span>`;
  if (subEl) subEl.textContent =
    `${cerradasMins.length} cerrada(s) · ${enCursoMins.length} en curso`;
  if (objEl) objEl.textContent = tiempoOk !== null
    ? (tiempoOk ? 'Objetivo: ≥8hs  ✓' : 'Objetivo: ≥8hs  ✗')
    : '';

  if (!card) return;
  card.classList.remove('obj-card--ok', 'obj-card--fail');
  if (tiempoOk === true)       card.classList.add('obj-card--ok');
  else if (tiempoOk === false) card.classList.add('obj-card--fail');
}

function _objRenderProdBultos(orders) {
  const vmap = APP_STATE.vehiculosMap;
  if (!vmap || !Object.keys(vmap).length) {
    _objSetCard('objProdBultos', '—', 'Capacidades no cargadas', null, '');
    return;
  }

  const perVehiculo = {};
  orders.forEach(o => {
    const v = o.vehicle_code;
    if (!v) return;
    perVehiculo[v] = (perVehiculo[v] || 0) + (Number(o.units_2) || 0);
  });

  const pcts = [];
  Object.entries(perVehiculo).forEach(([code, bultos]) => {
    const info = vmap[code];
    const cap  = info && Number(info.capacidad_bultos) > 0 ? Number(info.capacidad_bultos) : 0;
    if (cap > 0) pcts.push((bultos / cap) * 100);
  });

  if (!pcts.length) {
    _objSetCard('objProdBultos', '—', 'Sin vehículos con capacidad cargada', null, '');
    return;
  }

  const avg = parseFloat((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1));
  const ok  = avg >= 95;
  _objSetCard('objProdBultos', avg + '%',
    `${pcts.length} vehículos con capacidad cargada`,
    ok,
    ok ? 'Objetivo: 95%  ✓' : 'Objetivo: 95%  ✗'
  );
}

function showTiempoRutaModal() {
  const modal   = document.getElementById('tiempoRutaModal');
  const content = document.getElementById('tiempoRutaModalContent');
  if (!modal || !content) return;

  const fmtMin = mins => {
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  };
  const fmtTs = ts => ts ? ts.replace('T', ' ').slice(0, 16) : '—';

  if (!_objTiempoRutaDetalle.length) {
    content.innerHTML = '<p style="color:var(--color-text-muted);padding:16px 0;">Sin datos de rutas para el período cargado.</p>';
  } else {
    const sorted = [..._objTiempoRutaDetalle].sort((a, b) => b.minutes - a.minutes);
    const rows = sorted.map(r => {
      const color  = r.tipo === 'cerrada' ? 'var(--color-success)' : 'var(--color-warning)';
      const badge  = `<span style="font-size:10px;font-weight:600;color:${color};border:1px solid ${color};border-radius:4px;padding:1px 6px;">${r.tipo}</span>`;
      const okRuta = r.tipo === 'cerrada' && r.minutes >= 480;
      const durColor = r.tipo === 'cerrada'
        ? (okRuta ? 'var(--color-success)' : 'var(--color-danger)')
        : 'var(--color-warning)';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:8px 10px;font-size:12px;">${r.vehicle}</td>
        <td style="padding:8px 10px;font-size:12px;color:var(--color-text-muted);">${fmtTs(r.started)}</td>
        <td style="padding:8px 10px;text-align:center;">${badge}</td>
        <td style="padding:8px 10px;font-size:14px;font-weight:600;color:${durColor};">${fmtMin(r.minutes)}</td>
      </tr>`;
    }).join('');

    content.innerHTML = `
      <p style="font-size:11px;color:var(--color-text-muted);margin-bottom:10px;">
        Cerradas: verde si ≥ 8hs · rojo si &lt; 8hs &nbsp;|&nbsp; En curso: naranja (tiempo desde inicio)
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border);">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;">Vehículo / Ruta</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;">Inicio</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;">Estado</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;">Duración</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  modal.style.display = 'flex';
}

function _objRenderNPS(orders) {
  const conRating = orders.filter(o =>
    o.status === 'approved' &&
    ((o.rating_1 != null && o.rating_1 !== '') ||
     (o.rating_2 != null && o.rating_2 !== '') ||
     (o.rating_3 != null && o.rating_3 !== ''))
  );

  if (!conRating.length) {
    _objSetCard('objNPS', '—', 'sin datos NPS', null, '');
    return;
  }

  let promotores = 0, detractores = 0;
  conRating.forEach(o => {
    const suma = (Number(o.rating_1) || 0) + (Number(o.rating_2) || 0) + (Number(o.rating_3) || 0);
    if      (suma >= 14) promotores++;
    else if (suma < 11)  detractores++;
  });

  const score       = parseFloat(((promotores - detractores) / conRating.length * 100).toFixed(1));
  const totalAprob  = orders.filter(o => o.status === 'approved').length;
  const pctTasa     = totalAprob > 0 ? (conRating.length / totalAprob * 100).toFixed(1) : 0;
  const ok          = score >= 95;

  _objSetCard('objNPS',
    (score >= 0 ? '+' : '') + score,
    `${conRating.length} respuestas · ${pctTasa}% tasa`,
    ok,
    ok ? 'Objetivo: 95  ✓' : 'Objetivo: 95  ✗'
  );
}
