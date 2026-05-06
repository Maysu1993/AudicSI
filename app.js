/**
 * AuditSec — Aplicación de Auditoría de Seguridad de la Información
 * Almacenamiento 100% local (IndexedDB + LocalStorage fallback)
 * Versión: 1.0.0
 */

'use strict';

// =====================================================================
// CONFIGURACIÓN
// =====================================================================

const AREAS = [
  { id: 'claro',      nombre: 'Claro',               icon: '📡' },
  { id: 'latam5a',    nombre: 'Latam HVC Piso 5A',   icon: '🏢' },
  { id: 'latam5b',    nombre: 'Latam HVC Piso 5B',   icon: '🏢' },
  { id: 'latam6',     nombre: 'Latam HVC Piso 6',    icon: '🏢' },
  { id: 'proyectou',  nombre: 'Proyecto U',           icon: '🎓' },
  { id: 'admin',      nombre: 'Administrativos',      icon: '🗂️' },
];

const MAX_EQUIPOS = 10;

const CHECKLIST_ITEMS = [
  { id: 'senalizacion',    label: 'Señalización de seguridad',             icon: '⚠️' },
  { id: 'antivirus',       label: 'Antivirus activo',                      icon: '🛡️' },
  { id: 'actualizaciones', label: 'Actualizaciones del sistema operativo', icon: '🔄' },
  { id: 'restricciones',   label: 'Restricciones de usuario',              icon: '🔒' },
  { id: 'programas',       label: 'Programas no autorizados',              icon: '🚫' },
  { id: 'usb',             label: 'Restricción USB/CD/DVD',                icon: '💾' },
  { id: 'licencia',        label: 'Licenciamiento del sistema',            icon: '📋' },
  { id: 'bloqueo',         label: 'Bloqueo por inactividad',               icon: '⏱️' },
  { id: 'navegacion',      label: 'Restricción de navegación',             icon: '🌐' },
  { id: 'panel',           label: 'Bloqueo Panel de Control, CMD, regedit', icon: '🖥️' },
  { id: 'cableado',        label: 'Estado del cableado',                   icon: '🔌' },
  { id: 'usuario',         label: 'Usuario personalizado',                 icon: '👤' },
];

// =====================================================================
// ESTADO DE LA APLICACIÓN
// =====================================================================

let state = {
  currentScreen: 'screen-home',
  currentArea: null,          // { id, nombre }
  currentRevision: null,      // Revisión en progreso
  currentEquipoIdx: null,     // Índice del equipo editando (0–9)
  tempPhotos: [],             // Base64 fotos del equipo actual
  photoViewerIdx: null,       // Índice de foto en visor
  deleteRevisionId: null,     // ID para confirmar eliminación
};

// =====================================================================
// STORAGE (IndexedDB + LocalStorage fallback)
// =====================================================================

const DB_NAME = 'auditsec_db';
const DB_VERSION = 1;
const STORE_NAME = 'revisiones';
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB no disponible, usando LocalStorage');
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('fecha', 'fecha', { unique: false });
        store.createIndex('area', 'area', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => { console.warn('Error IndexedDB, fallback LS'); resolve(null); };
  });
}

// Guardar revisión
async function saveRevision(revision) {
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(revision);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } else {
    // Fallback LocalStorage
    const all = getLSRevisions();
    const idx = all.findIndex(r => r.id === revision.id);
    if (idx >= 0) all[idx] = revision; else all.push(revision);
    try {
      localStorage.setItem('auditsec_revisiones', JSON.stringify(all));
      return true;
    } catch(e) {
      showToast('Error: almacenamiento lleno', 'error');
      return false;
    }
  }
}

// Obtener todas las revisiones
async function getAllRevisions() {
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.fecha - a.fecha));
      req.onerror = () => reject(req.error);
    });
  } else {
    return getLSRevisions().sort((a, b) => b.fecha - a.fecha);
  }
}

// Eliminar revisión
async function removeRevision(id) {
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } else {
    const all = getLSRevisions().filter(r => r.id !== id);
    localStorage.setItem('auditsec_revisiones', JSON.stringify(all));
    return true;
  }
}

// Borrar todo
async function clearAllRevisions() {
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } else {
    localStorage.removeItem('auditsec_revisiones');
    return true;
  }
}

function getLSRevisions() {
  try {
    return JSON.parse(localStorage.getItem('auditsec_revisiones') || '[]');
  } catch { return []; }
}

// =====================================================================
// UTILIDADES
// =====================================================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  state.currentScreen = id;
  window.scrollTo(0, 0);
  updateProgress();
}

function updateProgress() {
  const wrap = document.getElementById('progressWrap');
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  const pct  = document.getElementById('progressPct');
  const onForm = state.currentScreen === 'screen-form' && state.currentRevision;
  wrap.classList.toggle('visible', onForm);
  if (onForm) {
    const idx = state.currentEquipoIdx + 1;
    const total = MAX_EQUIPOS;
    const p = Math.round((idx / total) * 100);
    text.textContent = `Equipo ${idx} de ${total}`;
    pct.textContent = p + '%';
    fill.style.width = p + '%';
  }
}

// =====================================================================
// NAVEGACIÓN
// =====================================================================

function navTo(section) {
  const map = {
    home:    'screen-home',
    audit:   'screen-areas',
    history: 'screen-history',
    export:  'screen-export',
  };
  if (map[section]) {
    if (section === 'history') renderHistory();
    if (section === 'home') updateDashboard();
    showScreen(map[section]);
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-' + section)?.classList.add('active');
  }
}

// =====================================================================
// DASHBOARD
// =====================================================================

async function updateDashboard() {
  const revisions = await getAllRevisions();
  document.getElementById('dashTotal').textContent = revisions.length;
  if (revisions.length > 0) {
    document.getElementById('dashLast').textContent = formatDate(revisions[0].fecha);
    const equipos = revisions.reduce((sum, r) => sum + (r.equipos?.filter(e => e.guardado).length || 0), 0);
    const fotos = revisions.reduce((sum, r) => sum + (r.equipos?.reduce((s, e) => s + (e.fotos?.length || 0), 0) || 0), 0);
    document.getElementById('dashEquipos').textContent = equipos;
    document.getElementById('dashFotos').textContent = fotos;
  } else {
    document.getElementById('dashLast').textContent = '—';
    document.getElementById('dashEquipos').textContent = '0';
    document.getElementById('dashFotos').textContent = '0';
  }
}

// =====================================================================
// PANTALLA: ÁREAS
// =====================================================================

async function renderAreas() {
  const revisions = await getAllRevisions();
  const grid = document.getElementById('areaGrid');
  grid.innerHTML = '';
  AREAS.forEach(area => {
    const count = revisions.filter(r => r.areaId === area.id).length;
    const div = document.createElement('div');
    div.className = 'area-card';
    div.setAttribute('tabindex', '0');
    div.setAttribute('role', 'button');
    div.innerHTML = `
      <div>
        <div class="area-name">${area.icon} ${area.nombre}</div>
        <div class="area-meta">${count} revisión${count !== 1 ? 'es' : ''} guardada${count !== 1 ? 's' : ''}</div>
      </div>
      <div style="display:flex;align-items:center">
        ${count > 0 ? `<div class="area-count-badge">${count}</div>` : ''}
        <div class="area-arrow">›</div>
      </div>`;
    div.addEventListener('click', () => startRevision(area));
    div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') startRevision(area); });
    grid.appendChild(div);
  });
}

// =====================================================================
// REVISIÓN
// =====================================================================

function startRevision(area) {
  state.currentArea = area;
  // Crear nueva revisión
  state.currentRevision = {
    id: generateId(),
    areaId: area.id,
    areaNombre: area.nombre,
    fecha: Date.now(),
    equipos: Array.from({ length: MAX_EQUIPOS }, (_, i) => ({
      idx: i,
      guardado: false,
      usuario: '', ip: '', hostname: '', puesto: '', obs: '',
      checklist: {},
      fotos: [],
    })),
  };
  renderEquipos();
  showScreen('screen-equipos');
}

function renderEquipos() {
  const rev = state.currentRevision;
  document.getElementById('equipAreaTitle').textContent = rev.areaNombre;
  document.getElementById('equipAreaDate').textContent = formatDate(rev.fecha);

  const completos = rev.equipos.filter(e => e.guardado).length;
  document.getElementById('equipCountChip').textContent = `${completos}/${MAX_EQUIPOS}`;

  const list = document.getElementById('equipList');
  list.innerHTML = '';
  rev.equipos.forEach((eq, i) => {
    const card = document.createElement('div');
    const status = eq.guardado ? (eq.checklist && Object.keys(eq.checklist).length > 0 ? 'complete' : 'partial') : 'empty';
    card.className = `equip-card ${status}`;
    const statusLabel = eq.guardado ? 'Completo' : 'Pendiente';
    const statusClass = eq.guardado ? 'ok' : 'new';
    card.innerHTML = `
      <div class="equip-num">${String(i+1).padStart(2,'0')}</div>
      <div class="equip-info">
        <div class="equip-name">${eq.usuario || 'Sin registrar'}</div>
        <div class="equip-ip">${eq.hostname ? `${eq.hostname} ${eq.ip ? '· ' + eq.ip : ''}` : 'Toca para registrar'}</div>
      </div>
      <div class="equip-status ${statusClass}">${statusLabel}</div>`;
    card.addEventListener('click', () => editEquipo(i));
    list.appendChild(card);
  });
}

function editEquipo(idx) {
  state.currentEquipoIdx = idx;
  const eq = state.currentRevision.equipos[idx];
  state.tempPhotos = [...(eq.fotos || [])];

  document.getElementById('formEquipoTitle').textContent = `Equipo #${idx+1}`;
  document.getElementById('fUsuario').value  = eq.usuario  || '';
  document.getElementById('fIP').value       = eq.ip       || '';
  document.getElementById('fHostname').value = eq.hostname || '';
  document.getElementById('fPuesto').value   = eq.puesto   || '';
  document.getElementById('fObs').value      = eq.obs      || '';

  renderChecklist(eq.checklist || {});
  renderPhotoGrid();
  showScreen('screen-form');
}

function cancelEquipo() {
  showScreen('screen-equipos');
}

// =====================================================================
// CHECKLIST
// =====================================================================

function renderChecklist(values) {
  const grid = document.getElementById('checklistGrid');
  grid.innerHTML = '';
  CHECKLIST_ITEMS.forEach(item => {
    const checked = values[item.id] === true;
    const div = document.createElement('div');
    div.className = 'check-item';
    div.innerHTML = `
      <label class="check-label" for="chk_${item.id}">
        <span class="check-icon">${item.icon}</span>${item.label}
      </label>
      <div class="toggle-wrap">
        <span class="toggle-label-text" id="lbl_${item.id}">${checked ? 'SÍ' : 'NO'}</span>
        <label class="toggle">
          <input type="checkbox" id="chk_${item.id}" ${checked ? 'checked' : ''}
            onchange="updateCheckLabel('${item.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>`;
    grid.appendChild(div);
  });
}

function updateCheckLabel(id, checked) {
  const lbl = document.getElementById('lbl_' + id);
  if (lbl) lbl.textContent = checked ? 'SÍ' : 'NO';
}

function getChecklistValues() {
  const vals = {};
  CHECKLIST_ITEMS.forEach(item => {
    const el = document.getElementById('chk_' + item.id);
    if (el) vals[item.id] = el.checked;
  });
  return vals;
}

// =====================================================================
// FOTOS
// =====================================================================

function triggerCamera() {
  document.getElementById('cameraInput').click();
}

function handlePhotoCapture(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.tempPhotos.push(e.target.result);
    renderPhotoGrid();
    showToast('✓ Foto añadida', 'success');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = '';
  state.tempPhotos.forEach((src, i) => {
    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.src = src;
    img.alt = `Evidencia ${i+1}`;
    img.addEventListener('click', () => openPhotoViewer(i));
    grid.appendChild(img);
  });
  // Botón agregar (solo si hay espacio)
  if (state.tempPhotos.length < 15) {
    const btn = document.createElement('div');
    btn.className = 'photo-add-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span>Cámara</span>`;
    btn.addEventListener('click', triggerCamera);
    grid.appendChild(btn);
  }
}

function openPhotoViewer(idx) {
  state.photoViewerIdx = idx;
  document.getElementById('photoViewerImg').src = state.tempPhotos[idx];
  document.getElementById('photoViewer').classList.add('open');
}

function closePhotoViewer() {
  document.getElementById('photoViewer').classList.remove('open');
  state.photoViewerIdx = null;
}

function deleteViewedPhoto() {
  if (state.photoViewerIdx === null) return;
  state.tempPhotos.splice(state.photoViewerIdx, 1);
  closePhotoViewer();
  renderPhotoGrid();
  showToast('Foto eliminada');
}

// =====================================================================
// GUARDAR EQUIPO
// =====================================================================

async function guardarEquipo() {
  const usuario  = document.getElementById('fUsuario').value.trim();
  const ip       = document.getElementById('fIP').value.trim();
  const hostname = document.getElementById('fHostname').value.trim();

  // Validación básica
  if (!usuario) {
    showToast('⚠️ El nombre de usuario es requerido', 'error');
    document.getElementById('fUsuario').focus();
    return;
  }
  if (!ip) {
    showToast('⚠️ La dirección IP es requerida', 'error');
    document.getElementById('fIP').focus();
    return;
  }
  if (!hostname) {
    showToast('⚠️ El hostname es requerido', 'error');
    document.getElementById('fHostname').focus();
    return;
  }

  const idx = state.currentEquipoIdx;
  const eq = state.currentRevision.equipos[idx];
  eq.usuario   = usuario;
  eq.ip        = ip;
  eq.hostname  = hostname;
  eq.puesto    = document.getElementById('fPuesto').value.trim();
  eq.obs       = document.getElementById('fObs').value.trim();
  eq.checklist = getChecklistValues();
  eq.fotos     = [...state.tempPhotos];
  eq.guardado  = true;
  eq.timestamp = Date.now();

  // Auto-guardar revisión completa
  await saveRevision(state.currentRevision);
  showToast('✓ Equipo guardado', 'success');
  renderEquipos();
  showScreen('screen-equipos');
}

// =====================================================================
// FINALIZAR REVISIÓN
// =====================================================================

async function finalizarRevision() {
  const completos = state.currentRevision.equipos.filter(e => e.guardado).length;
  if (completos === 0) {
    showToast('⚠️ Registra al menos un equipo', 'error');
    return;
  }
  const revGuardada = state.currentRevision;
  await saveRevision(revGuardada);
  showToast(`✓ Revisión guardada — ${completos} equipos`, 'success');
  await updateDashboard();
  state.currentRevision = null;
  state.currentArea = null;

  // Mostrar modal de compartir antes de ir a home
  mostrarModalCompartir(revGuardada);
}

// =====================================================================
// HISTORIAL
// =====================================================================

async function renderHistory() {
  const revisions = await getAllRevisions();
  const list = document.getElementById('historyList');
  if (revisions.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <p>No hay revisiones guardadas</p>
      </div>`;
    return;
  }
  list.innerHTML = '';
  revisions.forEach(rev => {
    const completos = rev.equipos?.filter(e => e.guardado).length || 0;
    const fotos = rev.equipos?.reduce((s, e) => s + (e.fotos?.length || 0), 0) || 0;
    const area = AREAS.find(a => a.id === rev.areaId);
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-header">
        <div class="history-area">${area?.icon || '📋'} ${rev.areaNombre}</div>
        <div class="history-date">${formatDate(rev.fecha)}</div>
      </div>
      <div class="history-stats">
        <div class="history-stat blue">${completos}/${MAX_EQUIPOS} equipos</div>
        <div class="history-stat green">${fotos} fotos</div>
        <div class="history-stat">${rev.id.slice(-6).toUpperCase()}</div>
      </div>`;
    card.addEventListener('click', () => showDetail(rev.id));
    list.appendChild(card);
  });
}

// =====================================================================
// DETALLE DE REVISIÓN
// =====================================================================

async function showDetail(revId) {
  const revisions = await getAllRevisions();
  const rev = revisions.find(r => r.id === revId);
  if (!rev) return;
  state.deleteRevisionId = revId;

  const area = AREAS.find(a => a.id === rev.areaId);
  document.getElementById('detailTitle').textContent = `${area?.icon || ''} ${rev.areaNombre}`;
  document.getElementById('detailDate').textContent = formatDate(rev.fecha);

  const content = document.getElementById('detailContent');
  content.innerHTML = '';

  const equiposConData = rev.equipos?.filter(e => e.guardado) || [];
  if (equiposConData.length === 0) {
    content.innerHTML = '<p class="text-muted">Sin equipos registrados</p>';
  } else {
    equiposConData.forEach((eq, i) => {
      const card = document.createElement('div');
      card.className = 'info-card';
      const checkPassed = CHECKLIST_ITEMS.filter(c => eq.checklist?.[c.id] === true).length;
      const totalCheck = CHECKLIST_ITEMS.length;

      let checklistHTML = CHECKLIST_ITEMS.map(c => {
        const ok = eq.checklist?.[c.id] === true;
        return `<div class="info-row">
          <span class="info-key">${c.icon} ${c.label}</span>
          <span class="info-val" style="color:${ok ? 'var(--success)' : 'var(--danger)'}">${ok ? 'SÍ ✓' : 'NO ✗'}</span>
        </div>`;
      }).join('');

      let fotosHTML = '';
      if (eq.fotos?.length > 0) {
        fotosHTML = `<div style="margin-top:10px">
          <div class="form-label">FOTOS (${eq.fotos.length})</div>
          <div class="photo-grid" style="margin-top:6px">
            ${eq.fotos.map(src => `<img class="photo-thumb" src="${src}" onclick="previewPhoto('${src}')">`).join('')}
          </div>
        </div>`;
      }

      card.innerHTML = `
        <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:var(--font-display);font-size:16px;font-weight:700">Equipo #${eq.idx+1}</div>
          <div class="chip ${checkPassed === totalCheck ? 'chip-success' : 'chip-orange'}">${checkPassed}/${totalCheck} checks</div>
        </div>
        <div class="info-row"><span class="info-key">Usuario</span><span class="info-val">${eq.usuario}</span></div>
        <div class="info-row"><span class="info-key">IP</span><span class="info-val">${eq.ip}</span></div>
        <div class="info-row"><span class="info-key">Hostname</span><span class="info-val">${eq.hostname}</span></div>
        ${eq.puesto ? `<div class="info-row"><span class="info-key">Puesto</span><span class="info-val">${eq.puesto}</span></div>` : ''}
        ${eq.obs ? `<div class="info-row"><span class="info-key">Obs.</span><span class="info-val">${eq.obs}</span></div>` : ''}
        <div style="margin-top:10px">${checklistHTML}</div>
        ${fotosHTML}
      `;
      content.appendChild(card);
    });
  }
  showScreen('screen-detail');
}

function previewPhoto(src) {
  document.getElementById('photoViewerImg').src = src;
  document.getElementById('photoViewer').classList.add('open');
  // Solo cerrar, no eliminar en detalle
  document.querySelector('.photo-viewer-actions').innerHTML = `
    <button class="btn btn-ghost btn-small" onclick="closePhotoViewer()">Cerrar</button>`;
}

// Restaurar acciones normales al abrir viewer desde formulario
function openPhotoViewer(idx) {
  state.photoViewerIdx = idx;
  document.getElementById('photoViewerImg').src = state.tempPhotos[idx];
  document.querySelector('.photo-viewer-actions').innerHTML = `
    <button class="btn btn-danger btn-small" onclick="deleteViewedPhoto()">Eliminar foto</button>
    <button class="btn btn-ghost btn-small" onclick="closePhotoViewer()">Cerrar</button>`;
  document.getElementById('photoViewer').classList.add('open');
}

// =====================================================================
// ELIMINAR REVISIÓN
// =====================================================================

function deleteRevision() {
  openConfirmModal(
    '¿Eliminar revisión?',
    'Esta acción no se puede deshacer. Se perderán todos los datos y fotos.',
    async () => {
      if (state.deleteRevisionId) {
        await removeRevision(state.deleteRevisionId);
        showToast('Revisión eliminada');
        closeModal();
        await renderHistory();
        showScreen('screen-history');
      }
    }
  );
}

// =====================================================================
// EXPORTAR
// =====================================================================

async function exportJSON() {
  const revisions = await getAllRevisions();
  if (revisions.length === 0) { showToast('No hay datos para exportar', 'error'); return; }
  const json = JSON.stringify(revisions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `auditsec_${getDateStamp()}.json`);
  showToast('✓ JSON exportado', 'success');
}

async function exportCSV() {
  const revisions = await getAllRevisions();
  if (revisions.length === 0) { showToast('No hay datos para exportar', 'error'); return; }

  const headers = [
    'ID_Revision','Area','Fecha',
    'Equipo_Num','Usuario','IP','Hostname','Puesto','Observaciones',
    ...CHECKLIST_ITEMS.map(c => c.label.replace(/,/g, '').replace(/\//g, '_')),
    'Fotos_Cantidad','Timestamp_Equipo'
  ];

  const rows = [headers.join(',')];
  revisions.forEach(rev => {
    const equipos = rev.equipos?.filter(e => e.guardado) || [];
    if (equipos.length === 0) {
      rows.push([rev.id, `"${rev.areaNombre}"`, formatDate(rev.fecha), '', '', '', '', '', '', ...CHECKLIST_ITEMS.map(() => ''), '', ''].join(','));
    } else {
      equipos.forEach(eq => {
        const chks = CHECKLIST_ITEMS.map(c => eq.checklist?.[c.id] ? 'SI' : 'NO');
        rows.push([
          rev.id,
          `"${rev.areaNombre}"`,
          formatDate(rev.fecha),
          eq.idx + 1,
          `"${eq.usuario}"`,
          eq.ip,
          eq.hostname,
          `"${eq.puesto || ''}"`,
          `"${(eq.obs || '').replace(/"/g, "'")}"`,
          ...chks,
          eq.fotos?.length || 0,
          eq.timestamp ? formatDate(eq.timestamp) : ''
        ].join(','));
      });
    }
  });

  const csv = '\uFEFF' + rows.join('\n'); // BOM para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `auditsec_${getDateStamp()}.csv`);
  showToast('✓ CSV exportado', 'success');
}

// =====================================================================
// COMPARTIR POR WHATSAPP
// =====================================================================

/**
 * Genera el texto formateado de una revisión para WhatsApp.
 * Usa emojis y estructura clara para lectura fácil en móvil.
 */
function generarTextoWhatsApp(rev) {
  const equipos = rev.equipos?.filter(e => e.guardado) || [];
  const totalFotos = equipos.reduce((s, e) => s + (e.fotos?.length || 0), 0);
  const area = AREAS.find(a => a.id === rev.areaId);

  let txt = '';
  txt += `🔒 *AUDITORÍA DE SEGURIDAD*\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `📍 *Área:* ${rev.areaNombre}\n`;
  txt += `📅 *Fecha:* ${formatDate(rev.fecha)}\n`;
  txt += `💻 *Equipos revisados:* ${equipos.length}/${MAX_EQUIPOS}\n`;
  txt += `📸 *Fotos tomadas:* ${totalFotos}\n`;
  txt += `🆔 *ID:* ${rev.id.slice(-8).toUpperCase()}\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  equipos.forEach((eq, i) => {
    const checkPassed = CHECKLIST_ITEMS.filter(c => eq.checklist?.[c.id] === true).length;
    const totalChk = CHECKLIST_ITEMS.length;
    const pct = Math.round((checkPassed / totalChk) * 100);
    const emoji = pct === 100 ? '✅' : pct >= 70 ? '⚠️' : '❌';

    txt += `${emoji} *EQUIPO #${eq.idx + 1}* — ${pct}% cumplimiento\n`;
    txt += `👤 Usuario: ${eq.usuario}\n`;
    txt += `🌐 IP: ${eq.ip}\n`;
    txt += `🖥️ Hostname: ${eq.hostname}\n`;
    if (eq.puesto) txt += `💺 Puesto: ${eq.puesto}\n`;

    // Solo mostrar los que fallaron (NO)
    const fallidos = CHECKLIST_ITEMS.filter(c => eq.checklist?.[c.id] !== true);
    if (fallidos.length > 0) {
      txt += `⛔ *Incumplimientos (${fallidos.length}):*\n`;
      fallidos.forEach(c => { txt += `  • ${c.label}\n`; });
    } else {
      txt += `✅ Todos los controles OK\n`;
    }
    if (eq.obs) txt += `📝 Obs: ${eq.obs}\n`;
    if (eq.fotos?.length > 0) txt += `📸 ${eq.fotos.length} foto(s) de evidencia\n`;
    txt += `\n`;
  });

  txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `_Generado por AuditSec_`;
  return txt;
}

/**
 * Abre WhatsApp con el texto de la revisión.
 * En móvil abre la app directamente; en desktop abre WhatsApp Web.
 */
function compartirWhatsApp(rev) {
  const texto = generarTextoWhatsApp(rev);
  const encoded = encodeURIComponent(texto);
  // wa.me sin número abre "nuevo chat" / selector de contacto
  const url = `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

/**
 * Modal de compartir que aparece al finalizar una revisión
 * y también disponible desde el detalle del historial.
 */
function mostrarModalCompartir(rev) {
  const equipos = rev.equipos?.filter(e => e.guardado) || [];
  const fallidos = equipos.reduce((sum, eq) => {
    return sum + CHECKLIST_ITEMS.filter(c => eq.checklist?.[c.id] !== true).length;
  }, 0);

  document.getElementById('shareRevId').dataset.revId = rev.id;

  // Llenar resumen en el modal
  document.getElementById('shareAreaName').textContent = rev.areaNombre;
  document.getElementById('shareEquiposCount').textContent = `${equipos.length} equipos`;
  document.getElementById('shareFallidosCount').textContent =
    fallidos === 0 ? '✅ Sin incumplimientos' : `⚠️ ${fallidos} incumplimiento(s)`;

  document.getElementById('shareModal').classList.add('open');

  // Guardar referencia para usar en los botones del modal
  window._shareRevTemp = rev;
}

function cerrarShareModal() {
  document.getElementById('shareModal').classList.remove('open');
  window._shareRevTemp = null;
  showScreen('screen-home');
  navTo('home');
}

function onShareWhatsApp() {
  if (window._shareRevTemp) {
    compartirWhatsApp(window._shareRevTemp);
  }
}

function onShareSkip() {
  cerrarShareModal();
}

/**
 * Compartir desde el detalle del historial (botón en screen-detail)
 */
async function compartirRevisionDetalle() {
  if (!state.deleteRevisionId) return;
  const revisions = await getAllRevisions();
  const rev = revisions.find(r => r.id === state.deleteRevisionId);
  if (rev) {
    window._shareRevTemp = rev;
    compartirWhatsApp(rev);
  }
}


/**
 * Compartir la revisión más reciente desde la pantalla de exportar
 */
async function compartirTodasWhatsApp() {
  const revisions = await getAllRevisions();
  if (revisions.length === 0) {
    showToast('No hay revisiones para compartir', 'error');
    return;
  }
  compartirWhatsApp(revisions[0]);
}

// =====================================================================
// DESCARGA DE ARCHIVOS
// =====================================================================

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function getDateStamp() {
  const d = new Date();
  const p = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// =====================================================================
// MODAL
// =====================================================================

let modalConfirmCb = null;

function openConfirmModal(title, msg, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  modalConfirmCb = callback;
  document.getElementById('confirmModal').classList.add('open');
}

function closeModal() {
  document.getElementById('confirmModal').classList.remove('open');
  modalConfirmCb = null;
}

document.getElementById('confirmBtn').addEventListener('click', () => {
  if (modalConfirmCb) modalConfirmCb();
});

function confirmClearData() {
  openConfirmModal(
    '¿Borrar TODOS los datos?',
    'Se eliminarán permanentemente TODAS las revisiones y fotos almacenadas en este dispositivo. Esta acción no se puede deshacer.',
    async () => {
      await clearAllRevisions();
      showToast('✓ Datos eliminados', 'success');
      closeModal();
      await updateDashboard();
    }
  );
}

// Cerrar modal al tocar overlay
document.getElementById('confirmModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// =====================================================================
// AUTOGUARDADO
// =====================================================================

// Autoguardado cada 30s si hay revisión en progreso
setInterval(async () => {
  if (state.currentRevision) {
    const hayDatos = state.currentRevision.equipos.some(e => e.guardado);
    if (hayDatos) {
      await saveRevision(state.currentRevision);
    }
  }
}, 30000);

// Guardar al salir
window.addEventListener('beforeunload', async () => {
  if (state.currentRevision) {
    await saveRevision(state.currentRevision);
  }
});

// =====================================================================
// SERVICE WORKER (offline)
// =====================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('SW registrado — app disponible offline'))
      .catch(e => console.warn('SW no disponible:', e));
  });
}

// =====================================================================
// INIT
// =====================================================================

async function init() {
  await initDB();
  await updateDashboard();
  await renderAreas();

  // Indicador online/offline
  function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    if (navigator.onLine) {
      badge.textContent = 'ONLINE';
      badge.style.background = 'var(--success)';
    } else {
      badge.textContent = 'OFFLINE';
      badge.style.background = 'var(--accent)';
    }
  }
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Interceptar botón nativo atrás en formulario
  window.addEventListener('popstate', () => {
    if (state.currentScreen === 'screen-form') {
      cancelEquipo();
    }
  });

  console.log('AuditSec iniciado');
}

document.addEventListener('DOMContentLoaded', init);
