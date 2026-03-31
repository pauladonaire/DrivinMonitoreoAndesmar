/* ============================================================
   main.js — Inicialización y orquestación
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {

  initEmailJS();
  initLightbox();
  initTableSorting();
  initFilterListeners();
  initDriversTableSorting();

  setLoadingState(true);

  try {
    const today = getTodayString();

    // ---- Conductores + PODs en PARALELO (más rápido) ----
    const [driversResult, podsResult] = await Promise.allSettled([
      fetchDrivers(),
      fetchPods(today),
    ]);

    // Procesar conductores (si tuvo éxito)
    if (driversResult.status === 'fulfilled') {
      driversResult.value.forEach(d => {
        if (d.email) {
          APP_STATE.driversMap[d.email] = {
            phone:      d.phone      || null,
            first_name: d.first_name || '',
            last_name:  d.last_name  || '',
          };
        }
      });
      console.log(`[main] Conductores cargados: ${driversResult.value.length}`);
    } else {
      console.warn('[main] No se pudieron cargar conductores:', driversResult.reason?.message);
    }

    // Procesar PODs (obligatorio)
    if (podsResult.status === 'rejected') {
      throw podsResult.reason;
    }
    const stops = podsResult.value;

    APP_STATE.rawData    = stops;
    APP_STATE.lastUpdate = new Date();

    console.log(`[main] Stops cargados: ${stops.length}`);
    // DEBUG: identificar campos de teléfono disponibles en v2/pods
    if (stops.length > 0) {
      const s = stops[0];
      console.log('[debug phone] Campos de stop[0]:', {
        contact_phone:         s.contact_phone,
        address_contact_phone: s.address_contact_phone,
        address_phone:         s.address_phone,
        phone:                 s.phone,
        // Muestra todas las keys que contengan "phone"
        phone_keys: Object.keys(s).filter(k => k.toLowerCase().includes('phone')),
      });
    }

    hideErrorBanner();
    populateFilters();
    applyFilters(); // renderiza todo inmediatamente

    console.log(`[main] filteredOrders: ${APP_STATE.filteredOrders.length}`);

  } catch (err) {
    console.error('[main] Error en carga inicial:', err);
    showErrorBanner(`No se pudieron cargar los datos: ${err.message}`);
    setLoadingState(false);
    return;
  }

  setLoadingState(false);
  startAutoRefresh();
  setInterval(checkAutoClosure, 60000);
  renderClosureHistory();

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // Teléfonos en background deshabilitado: el endpoint v3/pods devuelve 403
  // loadPhonesBackground();
});

function initEmailJS() {
  if (!EMAILJS_PUBLIC_KEY || EMAILJS_PUBLIC_KEY.startsWith('[REEMPLAZAR')) {
    console.warn('[EmailJS] No configurado.');
    return;
  }
  try {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  } catch (err) {
    console.warn('[EmailJS] Error al inicializar:', err);
  }
}

/**
 * Carga teléfonos desde v3/pods en segundo plano.
 * Usa caché diario en localStorage.
 */
async function loadPhonesBackground() {
  // Solo ejecutar si hay datos
  if (!APP_STATE.filteredOrders.length) return;

  const addressCodes = [
    ...new Set(APP_STATE.rawData.map(s => s.address_name).filter(Boolean))
  ];
  if (!addressCodes.length) return;

  const today = getTodayString();
  const PHONE_CACHE_KEY = `phone_cache_${today}`;

  // Limpiar caches viejos
  Object.keys(localStorage).forEach(k => {
    if (
      (k.startsWith('phone_cache_') || k.startsWith('addr_cache_')) &&
      k !== PHONE_CACHE_KEY
    ) {
      localStorage.removeItem(k);
    }
  });

  // Intentar desde caché
  const cached = localStorage.getItem(PHONE_CACHE_KEY);
  if (cached) {
    try {
      const map = JSON.parse(cached);
      if (Object.keys(map).length > 0) {
        Object.assign(APP_STATE.addressesMap, map);
        if (APP_STATE.filteredOrders.length) {
          renderTable();
          renderDriversTable();
        }
        console.log(`[phones] Desde caché: ${Object.keys(map).length}`);
        return;
      }
    } catch (e) { /* caché corrupto */ }
  }

  console.log(`[phones] Cargando teléfonos para ${addressCodes.length} direcciones...`);

  try {
    const phonesMap = await fetchPhonesBatch(addressCodes);
    const count = Object.keys(phonesMap).length;

    if (count > 0) {
      try {
        localStorage.setItem(PHONE_CACHE_KEY, JSON.stringify(phonesMap));
      } catch (e) {
        console.warn('[phones] No se pudo guardar caché:', e.message);
      }
      Object.assign(APP_STATE.addressesMap, phonesMap);
      console.log(`[phones] Teléfonos cargados: ${count}`);
      if (APP_STATE.filteredOrders.length) {
        renderTable();
        renderDriversTable();
      }
    } else {
      console.warn('[phones] La API v3 no devolvió teléfonos. Verificar endpoint.');
    }
  } catch (err) {
    console.warn('[phones] Error al cargar teléfonos:', err.message);
  }
}

/**
 * Re-renderiza todos los módulos con manejo de errores por sección.
 */
function renderAll() {
  try { calcAndRenderKPIs();   } catch(e) { console.error('[renderAll] KPIs:', e); }
  try { renderCharts();        } catch(e) { console.error('[renderAll] Charts:', e); }
  try { renderTop10();         } catch(e) { console.error('[renderAll] Top10:', e); }
  try { renderDriversTable();  } catch(e) { console.error('[renderAll] Drivers:', e); }
  try { renderTable();         } catch(e) { console.error('[renderAll] Table:', e); }
}
