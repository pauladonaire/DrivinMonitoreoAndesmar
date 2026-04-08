/* ============================================================
   gas.js — Helpers de comunicación con Google Apps Script Web App
   ============================================================ */

/**
 * Envía un POST al Web App de Google Apps Script.
 * @param {Object} payload — debe incluir { action: '...' }
 * @returns {Promise<Object>} — respuesta JSON del script
 */
async function gasPost(payload) {
  const res = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  return res.json();
}

/**
 * Obtiene datos del Web App via GET (lectura de acciones, etc).
 * @param {Object} params — parámetros de URL { action, date, ... }
 * @returns {Promise<Object>}
 */
async function gasGet(params) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${GAS_WEBAPP_URL}?${qs}`);
  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`);
  return res.json();
}
