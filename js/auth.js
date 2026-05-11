/* ============================================================
   auth.js — Autenticación, sesión y gestión de usuarios
   ============================================================ */

const SESSION_KEY = 'andesmar_session';

// ============================================================
// SESIÓN
// ============================================================
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}

function setSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function isLoggedIn() {
  return !!getSession();
}

// ============================================================
// PANTALLAS
// ============================================================
function showLoginScreen() {
  const ls = document.getElementById('loginScreen');
  const ac = document.getElementById('appContent');
  if (ls) ls.style.display = 'flex';
  if (ac) ac.style.display = 'none';
}

function hideLoginScreen() {
  const ls = document.getElementById('loginScreen');
  const ac = document.getElementById('appContent');
  if (ls) ls.style.display = 'none';
  if (ac) ac.style.display = 'block';
}

// ============================================================
// LOGIN
// ============================================================
async function doLogin() {
  const usuarioEl = document.getElementById('loginUsuario');
  const claveEl   = document.getElementById('loginClave');
  const errEl     = document.getElementById('loginError');
  const btn       = document.getElementById('loginBtn');

  const usuario = (usuarioEl?.value || '').trim();
  const clave   = (claveEl?.value   || '').trim();

  errEl.textContent = '';

  if (!usuario || !clave) {
    errEl.textContent = 'Ingresá usuario y contraseña.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Verificando...';

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${USERS_SHEET_ID}/values/${encodeURIComponent('UsuariosMonitoreo')}?key=${SHEETS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error de conexión (${res.status})`);

    const data = await res.json();
    const rows = (data.values || []).slice(1); // skip header

    // Columnas: [Nombre Completo, usuario, clave, perfil, depositos]
    const user = rows.find(r =>
      (r[1] || '').trim().toLowerCase() === usuario.toLowerCase() &&
      (r[2] || '').trim() === clave
    );

    if (!user) {
      errEl.textContent = 'Usuario o contraseña incorrectos.';
      return;
    }

    const session = {
      nombre_completo: (user[0] || '').trim(),
      usuario:         (user[1] || '').trim(),
      perfil:          (user[3] || 'monitoreo').trim(),
      depositos:       (user[4] || '').trim(),
    };

    setSession(session);
    hideLoginScreen();
    applyProfileRestrictions(session);

    // Arrancar la app
    if (typeof initApp === 'function') initApp();

  } catch (err) {
    errEl.textContent = 'Error al conectar: ' + err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Ingresar';
  }
}

function onLoginKeydown(e) {
  if (e.key === 'Enter') doLogin();
}

// ============================================================
// LOGOUT
// ============================================================
function doLogout() {
  clearSession();
  APP_STATE.userDepositos = null;
  showLoginScreen();
}

// ============================================================
// RESTRICCIONES POR PERFIL
// ============================================================
function applyProfileRestrictions(session) {
  session = session || getSession();
  if (!session) return;

  const { perfil, nombre_completo, usuario, depositos } = session;

  // Info de usuario en el header
  const nameEl = document.getElementById('headerUserInfo');
  const roleEl = document.getElementById('headerUserRole');
  if (nameEl) nameEl.textContent = nombre_completo || usuario;
  if (roleEl) {
    const labels = { admin: 'Admin', monitoreo: 'Monitoreo', monitoreosuc: 'Sucursal' };
    roleEl.textContent = labels[perfil] || perfil;
  }

  // Cerrar día: solo admin y monitoreo
  const btnClose = document.getElementById('btnCloseDay');
  if (btnClose) btnClose.style.display = (perfil === 'admin' || perfil === 'monitoreo') ? '' : 'none';

  // Gestión de usuarios: solo admin
  const btnMgmt = document.getElementById('btnUserMgmt');
  if (btnMgmt) btnMgmt.style.display = perfil === 'admin' ? '' : 'none';

  // Restricción de depósito para monitoreosuc
  if (perfil === 'monitoreosuc' && depositos) {
    APP_STATE.userDepositos = depositos.split(',').map(d => d.trim()).filter(Boolean);
  } else {
    APP_STATE.userDepositos = null;
  }
}

// Restringe el select filterDeposito para monitoreosuc (llamar después de populateFilters)
function lockDepositoFilter() {
  const session = getSession();
  if (!session || session.perfil !== 'monitoreosuc') return;

  const depositos = (session.depositos || '').split(',').map(d => d.trim()).filter(Boolean);
  if (!depositos.length) return;

  const sel = document.getElementById('filterDeposito');
  if (!sel) return;

  // Eliminar opciones que no pertenecen al usuario (de atrás para adelante para no romper índices)
  for (let i = sel.options.length - 1; i >= 0; i--) {
    const val = sel.options[i].value;
    if (val && !depositos.includes(val)) sel.remove(i);
  }

  // Auto-seleccionar si solo tiene uno
  if (depositos.length === 1 && sel.options.length > 0) sel.value = depositos[0];
  sel.disabled = depositos.length <= 1;
}

// ============================================================
// CHECK DE AUTH AL CARGAR
// ============================================================
function checkAuth() {
  if (!isLoggedIn()) {
    showLoginScreen();
  } else {
    hideLoginScreen();
  }
}

// ============================================================
// GESTIÓN DE USUARIOS (solo admin)
// ============================================================
let _userMgmtRows = [];

async function openUserMgmt() {
  const session = getSession();
  if (!session || session.perfil !== 'admin') return;

  document.getElementById('userMgmtModal').style.display = 'flex';
  await _loadUserMgmtRows();
}

async function _loadUserMgmtRows() {
  const listEl = document.getElementById('userMgmtList');
  listEl.innerHTML = '<div style="color:#a0b4c8;padding:12px;">Cargando...</div>';

  try {
    const url  = `https://sheets.googleapis.com/v4/spreadsheets/${USERS_SHEET_ID}/values/${encodeURIComponent('UsuariosMonitoreo')}?key=${SHEETS_API_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    _userMgmtRows = (data.values || []).slice(1);
    _renderUserList();
  } catch (err) {
    listEl.innerHTML = `<div style="color:var(--color-danger);padding:12px;">Error: ${err.message}</div>`;
  }
}

function _renderUserList() {
  const listEl = document.getElementById('userMgmtList');
  if (_userMgmtRows.length === 0) {
    listEl.innerHTML = '<div style="color:#a0b4c8;padding:12px;">Sin usuarios registrados.</div>';
    return;
  }

  listEl.innerHTML = _userMgmtRows.map((r, i) => {
    const nombre  = r[0] || '—';
    const usuario = r[1] || '—';
    const perfil  = r[3] || '—';
    const deps    = r[4] ? ` · ${r[4]}` : '';
    return `
      <div class="user-row">
        <div class="user-row-info">
          <strong>${esc(nombre)}</strong>
          <span class="text-muted">(${esc(usuario)})</span>
          <span class="badge badge--other" style="font-size:10px;">${esc(perfil)}</span>
          <span class="text-muted" style="font-size:11px;">${esc(deps)}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="padding:3px 10px;font-size:12px;"
            onclick="editUserForm(${i})">Editar</button>
          <button class="btn-secondary" style="padding:3px 10px;font-size:12px;color:var(--color-danger);"
            onclick="confirmDeleteUser('${esc(usuario)}')">Eliminar</button>
        </div>
      </div>`;
  }).join('');
}

function editUserForm(index) {
  const row = _userMgmtRows[index];
  if (!row) return;
  document.getElementById('userFormNombre').value    = row[0] || '';
  document.getElementById('userFormUsuario').value   = row[1] || '';
  document.getElementById('userFormClave').value     = row[2] || '';
  document.getElementById('userFormPerfil').value    = row[3] || 'monitoreo';
  document.getElementById('userFormDepositos').value = row[4] || '';
  document.getElementById('userFormUsuario').dataset.editing = row[1] || '';
  _toggleDepositosField();
}

function newUserForm() {
  ['userFormNombre','userFormUsuario','userFormClave','userFormDepositos'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; delete el.dataset.editing; }
  });
  const perfilEl = document.getElementById('userFormPerfil');
  if (perfilEl) perfilEl.value = 'monitoreo';
  _toggleDepositosField();
}

function _toggleDepositosField() {
  const perfil  = document.getElementById('userFormPerfil')?.value;
  const depsRow = document.getElementById('userFormDepositosGroup');
  if (depsRow) depsRow.style.display = (perfil === 'monitoreosuc') ? '' : 'none';
}

async function saveUserForm() {
  const nombre    = document.getElementById('userFormNombre').value.trim();
  const usuario   = document.getElementById('userFormUsuario').value.trim();
  const clave     = document.getElementById('userFormClave').value.trim();
  const perfil    = document.getElementById('userFormPerfil').value;
  const depositos = document.getElementById('userFormDepositos').value.trim();

  if (!nombre || !usuario || !clave) {
    alert('Nombre, usuario y contraseña son obligatorios.');
    return;
  }

  try {
    await gasPost({ action: 'save_user', data: { nombre, usuario, clave, perfil, depositos } });
    await _loadUserMgmtRows();
    newUserForm();
    alert('✅ Usuario guardado.');
  } catch (err) {
    alert('❌ Error al guardar: ' + err.message);
  }
}

async function confirmDeleteUser(usuario) {
  if (!confirm(`¿Eliminar el usuario "${usuario}"? Esta acción no se puede deshacer.`)) return;
  try {
    await gasPost({ action: 'delete_user', usuario });
    await _loadUserMgmtRows();
  } catch (err) {
    alert('❌ Error al eliminar: ' + err.message);
  }
}
