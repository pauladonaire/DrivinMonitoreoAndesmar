/* ============================================================
   api.js — Funciones de acceso a la API de Drivin
   ============================================================ */

/**
 * Retorna la fecha de hoy en formato YYYY-MM-DD (hora local).
 */
function getTodayString() {
  const hoy  = new Date();
  const yyyy = hoy.getFullYear();
  const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd   = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Obtiene los PODs del día indicado.
 * @param {string} dateStr — formato YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function fetchPods(dateStr) {
  const url      = `${PODS_ENDPOINT}?start_date=${dateStr}&end_date=${dateStr}`;
  const response = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const json = await response.json();
  return json.response || [];
}

/**
 * Obtiene el listado de conductores (rol driver).
 * Se llama UNA SOLA VEZ al iniciar la aplicación.
 * @returns {Promise<Array>}
 */
async function fetchDrivers() {
  const response = await fetch(USERS_ENDPOINT, { headers: { 'x-api-key': API_KEY } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const json = await response.json();
  return json.response || [];
}

/**
 * Obtiene teléfonos de destino desde v3/pods usando address_code[].
 * Se llama en background después del render inicial.
 * @param {string[]} addressCodes — array de códigos de dirección únicos
 * @returns {Promise<Object>} mapa { addressCode: { phone } }
 */
async function fetchPhonesBatch(addressCodes) {
  const BATCH = 50;
  const phonesMap = {};

  for (let i = 0; i < addressCodes.length; i += BATCH) {
    const batch = addressCodes.slice(i, i + BATCH);
    try {
      const qs  = batch.map(c => `address_code[]=${encodeURIComponent(c)}`).join('&');
      const res = await fetch(`${PODS_V3_ENDPOINT}?${qs}`, {
        headers: { 'x-api-key': API_KEY }
      });
      if (!res.ok) {
        console.warn(`[phones] lote ${i}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      (json.response || []).forEach(stop => {
        const phone = stop.contact_phone
          || stop.address?.contact_phone
          || stop.address_contact_phone
          || null;
        if (stop.address_name && phone) {
          phonesMap[stop.address_name] = { phone };
        }
      });
    } catch (e) {
      console.warn('[phones] error en lote:', e.message);
    }
  }

  return phonesMap;
}
