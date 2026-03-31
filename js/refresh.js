/* ============================================================
   refresh.js — Auto-refresco cada 5 min + countdown
   ============================================================ */

// Variables de control del refresco
let _refreshTimerId    = null;  // ID del setInterval principal
let _countdownTimerId  = null;  // ID del setInterval del countdown
let _nextRefreshAt     = null;  // Date objetivo del próximo refresco

/**
 * Inicia el ciclo de auto-refresco.
 * Debe llamarse una sola vez, desde main.js.
 */
function startAutoRefresh() {
  scheduleNextRefresh();
}

/**
 * Programa el próximo refresco en REFRESH_INTERVAL_MS ms.
 */
function scheduleNextRefresh() {
  clearTimeout(_refreshTimerId);

  _nextRefreshAt   = new Date(Date.now() + REFRESH_INTERVAL_MS);
  _refreshTimerId  = setTimeout(doRefresh, REFRESH_INTERVAL_MS);

  // Iniciar countdown en el header
  startCountdown();
}

/**
 * Ejecuta el refresco: obtiene los PODs del día y re-renderiza.
 */
async function doRefresh() {
  try {
    setLoadingState(true);
    const today = getTodayString();
    const stops = await fetchPods(today);

    APP_STATE.rawData   = stops;
    APP_STATE.lastUpdate = new Date();

    hideErrorBanner();
    populateFilters();
    applyFilters(); // también llama a renderAll()

    updateRefreshText();
  } catch (err) {
    console.error('[Refresh] Error al actualizar datos:', err);
    showErrorBanner(`Error de red al actualizar: ${err.message}`);
  } finally {
    setLoadingState(false);
    scheduleNextRefresh(); // reprogramar el siguiente ciclo
  }
}

/**
 * Re-intento manual desde el banner de error.
 */
async function retryFetch() {
  hideErrorBanner();
  await doRefresh();
}

/**
 * Inicia el countdown visual en el header (se actualiza cada segundo).
 */
function startCountdown() {
  clearInterval(_countdownTimerId);
  _countdownTimerId = setInterval(updateRefreshText, 1000);
  updateRefreshText();
}

/**
 * Actualiza el texto del indicador de refresco en el header.
 */
function updateRefreshText() {
  const textEl = document.getElementById('refreshText');
  if (!textEl) return;

  const lastStr = APP_STATE.lastUpdate
    ? APP_STATE.lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  let nextStr = '--:--';
  if (_nextRefreshAt) {
    const diffMs = _nextRefreshAt - Date.now();
    if (diffMs > 0) {
      const totalSec = Math.ceil(diffMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      nextStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
      nextStr = '00:00';
    }
  }

  textEl.textContent = `Actualizado: ${lastStr} — Próximo en: ${nextStr}`;
}

/**
 * Muestra/oculta el spinner y el punto pulsante según el estado de carga.
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  APP_STATE.isLoading = loading;
  const spinner = document.getElementById('loadingSpinner');
  const dot     = document.getElementById('refreshDot');
  if (spinner) spinner.style.display = loading ? 'block' : 'none';
  if (dot)     dot.style.display     = loading ? 'none'  : 'block';
}

/**
 * Muestra el banner de error con un mensaje específico.
 * @param {string} msg
 */
function showErrorBanner(msg) {
  const banner  = document.getElementById('errorBanner');
  const msgEl   = document.getElementById('errorMessage');
  if (banner) banner.style.display = 'flex';
  if (msgEl)  msgEl.textContent    = msg;
}

/**
 * Oculta el banner de error.
 */
function hideErrorBanner() {
  const banner = document.getElementById('errorBanner');
  if (banner) banner.style.display = 'none';
}
