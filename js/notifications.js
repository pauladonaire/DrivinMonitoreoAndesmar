/* ============================================================
   notifications.js — Sistema de notificaciones no intrusivas
   Mejora 7: alerta de "Domicilio No Visitado"
   ============================================================ */

/**
 * Verifica si hay nuevas órdenes con motivo "Domicilio No Visitado"
 * que aún no hayan sido notificadas. Llamado al final de applyFilters().
 */
function checkNewDomicilioNoVisitado() {
  const nuevos = APP_STATE.filteredOrders.filter(o =>
    o.status === 'rejected' &&
    o.reason &&
    o.reason.toLowerCase().includes('domicilio no visitado') &&
    !APP_STATE.knownDomicilioNoVisitado.has(o.code)
  );
  if (nuevos.length === 0) return;

  nuevos.forEach(o => APP_STATE.knownDomicilioNoVisitado.add(o.code));
  showDomicilioNoVisitadoToast(nuevos);
}

/**
 * Muestra el toast de alerta en esquina inferior derecha.
 * Se auto-descarta a los 15 segundos.
 * @param {Object[]} ordenes — array de órdenes con "Domicilio No Visitado"
 */
function showDomicilioNoVisitadoToast(ordenes) {
  const existing = document.getElementById('dnvToast');
  if (existing) existing.remove();

  const count    = ordenes.length;
  const ejemplos = ordenes.slice(0, 3).map(o =>
    `<li>${esc(o.driver_name || '(sin conductor)')} — <strong>${esc(o.code)}</strong></li>`
  ).join('');

  const toast = document.createElement('div');
  toast.id        = 'dnvToast';
  toast.className = 'dnv-toast';
  toast.innerHTML = `
    <div class="dnv-toast-header">
      ⚠️ ${count} nuevo${count > 1 ? 's' : ''} "Domicilio No Visitado"
      <button onclick="this.closest('.dnv-toast').remove()" title="Cerrar">✕</button>
    </div>
    <ul class="dnv-toast-list">${ejemplos}</ul>
    ${count > 3 ? `<div class="dnv-toast-more">+${count - 3} más</div>` : ''}
  `;
  document.body.appendChild(toast);

  // Auto-dismiss en 15 segundos
  setTimeout(() => { if (toast.isConnected) toast.remove(); }, 15000);
}
