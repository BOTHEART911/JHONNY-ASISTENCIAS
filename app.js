/* ============================================================
   JHONNY ASISTENCIA — app.js
   Primero se CONFIGURA el equipo con un evento (esa configuración es el
   "login" de esta app y queda guardada en el dispositivo). Después es un
   escáner y nada más: se activa una vez y lee QR tras QR sin volver a tocar
   la pantalla. Cada lectura registra la asistencia en la hoja ASISTENCIAS
   (endpoint asis.registrar del JHONNY CORE) y la app privada se entera sola
   (Vivo.gs → canal 'eventos' → TOTAL ASISTENCIA del evento).
   Motor de lectura, gate de instalación y versión: los mismos de JHONNY
   VOTACIÓN, que ya está en producción.
   ============================================================ */

/* URL del Web App del backend JHONNY CORE (/exec) — la MISMA de la app de votación */
const API_URL = 'https://script.google.com/macros/s/AKfycbw9CZ9ra6q1KI88M3U9IsYP861JOCFD4-xrV1b0UFYhL1amBjAqTTmtNXi42vwLI_h6Hw/exec';

const APP_ICON   = 'https://res.cloudinary.com/dqqeavica/image/upload/v1753538807/JHONNY_PERDOMO_dn3dah.png';
const APP_BANNER = 'https://res.cloudinary.com/dqqeavica/image/upload/v1753538919/BANNER_JHONNY_e0yw7m.png';

/* Respaldo de lectura para navegadores sin BarcodeDetector (iOS/Safari) */
const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

/* Sonidos */
const SOUNDS = {
  ok:   'https://res.cloudinary.com/dqqeavica/video/upload/v1759011577/Pay_success_t5aawh.mp3',
  info: 'https://res.cloudinary.com/dqqeavica/video/upload/v1759011578/Default_notification_pkp4wr.mp3',
  err:  'https://res.cloudinary.com/dqqeavica/video/upload/v1759011578/Low_battery_d5qua1.mp3'
};

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const app = $('#app');
const layer = $('#layer');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const onlyDig = s => String(s || '').replace(/\D/g, '');
const val = id => (($('#' + id) || {}).value || '').trim();

function toast(msg, kind = '') { const t = h(`<div class="toast ${kind}">${esc(msg)}</div>`); layer.appendChild(t); setTimeout(() => t.remove(), 3200); }
function hideSplash() { const s = $('#splash'); if (s && !s.classList.contains('hide')) { s.classList.add('hide'); setTimeout(() => s.remove(), 520); } }

/* Un solo objeto Audio por tipo: en un evento esto suena cientos de veces y
   crear un Audio nuevo cada vez termina ahogando el navegador. */
const _audio = {};
function sonar(kind) {
  try {
    const url = SOUNDS[kind]; if (!url) return;
    let a = _audio[kind];
    if (!a) { a = new Audio(url); a.preload = 'auto'; _audio[kind] = a; }
    a.currentTime = 0; a.play().catch(() => {});
  } catch (e) {}
}
function vibrar(patron) { try { if (navigator.vibrate) navigator.vibrate(patron); } catch (e) {} }

/* ---------- Cliente API ---------- */
let _apiActivas = 0;
function loaderOn() { _apiActivas++; const b = $('#ios-loader'); if (b) b.classList.add('active'); }
function loaderOff() { _apiActivas = Math.max(0, _apiActivas - 1); if (_apiActivas === 0) { const b = $('#ios-loader'); if (b) b.classList.remove('active'); } }
async function api(action, params = {}, opts = {}) {
  const qs = new URLSearchParams(Object.assign({ action }, params)).toString();
  if (!opts.silencio) loaderOn();
  try {
    const res = await fetch(`${API_URL}?${qs}`, { method: 'GET' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error del servidor');
    return json.data;
  } finally { if (!opts.silencio) loaderOff(); }
}

/* ============================================================
   CONFIGURACIÓN DEL EVENTO
   Queda guardada POR DISPOSITIVO. Es lo primero que se pide y se puede
   cambiar cuando toque (otro salón, otro día). Ojo: el evento puede
   cerrarse desde la app privada a mitad de la jornada, así que se
   revalida al entrar al escáner — y el backend la revalida además en
   CADA lectura, que es lo que de verdad manda.
   ============================================================ */
const CFG_KEY = 'jpAsisEvento';
let CFG = null;

function cfgLeer() {
  try { const raw = localStorage.getItem(CFG_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function cfgGuardar(ev) { try { localStorage.setItem(CFG_KEY, JSON.stringify(ev)); } catch (e) {} CFG = ev; }
function cfgBorrar() { try { localStorage.removeItem(CFG_KEY); } catch (e) {} CFG = null; }

/* ============================================================
   PWA: INSTALACIÓN  (mismo patrón de la app pública)
   ============================================================ */
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: installed)').matches || window.navigator.standalone === true;
const isIOS = () => /(iphone|ipad|ipod)/i.test(navigator.userAgent || '');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (location.hash === '#/instalar') updateInstallSection(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; toast('¡App instalada!', 'ok'); });

function updateInstallSection() {
  const and = $('#install-android'), ios = $('#install-ios'); if (!and || !ios) return;
  and.classList.add('hidden'); ios.classList.add('hidden');
  if (isIOS()) { ios.classList.remove('hidden'); return; }
  and.classList.remove('hidden');
  const b = $('#btn-install'), man = $('#install-manual');
  if (deferredPrompt) { if (b) b.style.display = ''; if (man) man.classList.add('hidden'); }
  else { if (b) b.style.display = 'none'; if (man) man.classList.remove('hidden'); }
}

/* ============================================================
   VERSIÓN + AUTO-UPDATE  (lee version.js por texto)
   ============================================================ */
let APP_VERSION_LOADED = '', __verInFlight = false;
function paintVersion(v) { $$('.app-version-line').forEach(el => el.textContent = 'Versión ' + v); }
async function checkVersion() {
  if (__verInFlight) return; __verInFlight = true;
  try {
    const r = await fetch('./version.js?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const raw = await r.text();
    const m = raw.match(/version['"]?\s*[:=]\s*['"]([^'"]+)['"]/i) || raw.match(/(\d{4}\.\d{2}\.\d{2}\.\d+|\d+\.\d+(?:\.\d+)?)/);
    const v = m ? String(m[1]).trim() : '';
    if (!v) return;
    if (!APP_VERSION_LOADED) { APP_VERSION_LOADED = v; paintVersion(v); return; }
    if (v !== APP_VERSION_LOADED) {
      /* OJO: si el escáner está corriendo NO se recarga a mitad de una fila de
         gente. Se espera a que lo apaguen. Tampoco con el registro abierto:
         se perderían los datos que están tecleando. */
      if (SCAN.on || location.hash.startsWith('#/registro')) return;
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
      location.reload();
    }
  } finally { __verInFlight = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

/* ---------- Constructores ---------- */
function footBrand() { return `<img class="brand-banner" src="${APP_BANNER}" alt="" onerror="this.style.display='none'" /><p class="app-version-line">Versión —</p>`; }
function saving(btn, on) { btn.disabled = on; btn.dataset.txt = btn.dataset.txt || btn.innerHTML; btn.innerHTML = on ? `<span class="spinner"></span>` : btn.dataset.txt; }

/* ---------- Modal ---------- */
function openSheet(html) {
  closeLayer();
  const ov = h(`<div class="scrim"></div>`);
  const sh = h(`<div class="sheet">${html}</div>`);
  layer.appendChild(ov); layer.appendChild(sh);
  document.body.classList.add('sheet-open');
  ov.onclick = closeLayer;
  return sh;
}
function closeLayer() {
  $$('.scrim, .sheet', layer).forEach(el => el.remove());
  document.body.classList.remove('sheet-open');
}

/* ============================================================
   RÚTER
   ============================================================ */
function go(route) { location.hash = '#/' + route; }
window.addEventListener('hashchange', render);
function render() {
  const full = location.hash.replace(/^#\//, '');
  const route = (full || '').split('?')[0];
  if (route !== 'escaner') scanStop(); // salir de la vista apaga la cámara
  if (route === 'instalar') return viewInstalar();
  if (route === 'config')   return viewConfig();
  if (route === 'registro') return viewRegistro(new URLSearchParams(full.split('?')[1] || '').get('doc') || '');
  if (!CFG) return viewConfig();       // sin evento configurado no se escanea
  return viewEscaner();
}

/* ============================================================
   VISTA INSTALAR  (gate)
   ============================================================ */
function viewInstalar() {
  app.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <img class="login-logo" src="${APP_ICON}" alt="Jhonny Perdomo" />
      <h1 class="login-title">Registro de Asistencia</h1>
      <p class="login-sub">Instala la aplicación: la cámara del escáner funciona mucho mejor como app instalada que dentro del navegador.</p>

      <div id="install-android" class="hidden" style="margin-top:16px;">
        <button id="btn-install" class="btn btn-primary btn-block" style="display:none;">📲 Instalar aplicación</button>
        <div id="install-manual" class="hidden ios-steps-wrap">
          <p class="small" style="text-align:left;color:var(--muted);">Para instalarla en tu equipo:</p>
          <ol class="ios-steps">
            <li>Abre el menú <b>⋮</b> del navegador (arriba a la derecha).</li>
            <li>Elige <b>“Instalar aplicación”</b> o <b>“Añadir a la pantalla de inicio”</b>.</li>
            <li>Confirma con <b>“Instalar”</b>.</li>
          </ol>
        </div>
        <button id="btn-cont-web" class="btn btn-ghost btn-block" style="margin-top:10px;">🌐 Continuar en el navegador</button>
      </div>
      <div id="install-ios" class="hidden" style="margin-top:16px;">
        <p class="small" style="text-align:left;color:var(--muted);">En tu iPhone o iPad:</p>
        <ol class="ios-steps"><li>Pulsa <b>Compartir</b> en Safari.</li><li>Elige <b>“Añadir a pantalla de inicio”</b>.</li><li>Pulsa <b>“Añadir”</b>.</li></ol>
        <button id="btn-cont-web-ios" class="btn btn-ghost btn-block" style="margin-top:8px;">🌐 Continuar en el navegador</button>
      </div>

      ${footBrand()}
    </div></div>`;
  app.hidden = false; hideSplash(); paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  updateInstallSection();
  const cont = () => { sessionStorage.setItem('continuedWeb', '1'); go(CFG ? 'escaner' : 'config'); };
  const bi = $('#btn-install');
  if (bi) bi.onclick = async () => {
    if (!deferredPrompt) { toast('La instalación aún no está disponible. Usa el menú del navegador.'); return; }
    const dp = deferredPrompt; dp.prompt(); try { await dp.userChoice; } catch (e) {} deferredPrompt = null; updateInstallSection();
  };
  const cw = $('#btn-cont-web'); if (cw) cw.onclick = cont;
  const cwi = $('#btn-cont-web-ios'); if (cwi) cwi.onclick = cont;
}

/* ============================================================
   VISTA CONFIGURACIÓN DE EVENTO
   Solo se enlistan los eventos en CORRIENDO (columna ESTADO de la hoja
   EVENTOS). El número, el lugar y el anfitrión NO se escriben: salen del
   evento elegido.
   ============================================================ */
let EVENTOS = [];

function viewConfig() {
  app.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <img class="login-logo" src="${APP_ICON}" alt="Jhonny Perdomo" />
      <h1 class="login-title">Configuración del evento</h1>
      <p class="login-sub">Elige el evento que se está realizando. Queda guardado en este equipo y se usa en cada registro.</p>

      <div class="stack" style="margin-top:14px;">
        <label class="field"><span>Nombre del Evento</span>
          <select class="select" id="cf-ev"><option value="">Cargando eventos…</option></select>
        </label>

        <div class="ev-card">
          <div class="ev-row"><b>Número del Evento</b><span id="cf-id">—</span></div>
          <div class="ev-row"><b>Lugar del Evento</b><span id="cf-lugar">—</span></div>
          <div class="ev-row"><b>Anfitrión</b><span id="cf-anf">—</span></div>
        </div>

        <button class="btn btn-primary btn-block" id="cf-ok" disabled>Guardar y escanear</button>
        <button class="btn btn-quiet btn-block hidden" id="cf-cancel">Cancelar</button>
      </div>

      ${footBrand()}
    </div></div>`;
  app.hidden = false; hideSplash();
  paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));

  if (CFG) { const c = $('#cf-cancel'); c.classList.remove('hidden'); c.onclick = () => go('escaner'); }

  const sel = $('#cf-ev'), bOk = $('#cf-ok');
  const pintar = () => {
    const ev = EVENTOS.find(x => String(x.id) === String(sel.value));
    $('#cf-id').textContent = ev ? String(ev.id) : '—';
    $('#cf-lugar').textContent = ev ? (ev.lugar || '—') : '—';
    $('#cf-anf').textContent = ev ? (ev.anfitrion || '—') : '—';
    bOk.disabled = !ev;
  };
  sel.onchange = pintar;

  bOk.onclick = () => {
    const ev = EVENTOS.find(x => String(x.id) === String(sel.value));
    if (!ev) { toast('Elige un evento', 'err'); return; }
    cfgGuardar({ id: ev.id, nombre: ev.nombre, lugar: ev.lugar, anfitrion: ev.anfitrion });
    precargarResidencias();   // para que el registro de una persona nueva abra al instante
    go('escaner');
  };

  cargarEventos(sel, pintar);
}

async function cargarEventos(sel, pintar) {
  try {
    const d = await api('asis.eventos');
    EVENTOS = (d && d.eventos) || [];
    if (!EVENTOS.length) {
      sel.innerHTML = `<option value="">No hay eventos abiertos</option>`;
      toast('Ningún evento está CORRIENDO. Ábrelo desde la app privada.', 'err');
      return;
    }
    sel.innerHTML = `<option value="">Elige el evento…</option>` +
      EVENTOS.map(e => `<option value="${esc(e.id)}">${esc(e.nombre)}${e.fecha ? ' · ' + esc(e.fecha) : ''}</option>`).join('');
    if (CFG && EVENTOS.some(e => String(e.id) === String(CFG.id))) sel.value = String(CFG.id);
    pintar();
  } catch (e) {
    sel.innerHTML = `<option value="">No se pudo cargar</option>`;
    toast('No se pudieron cargar los eventos. Revisa la conexión.', 'err');
  }
}

/* ============================================================
   VISTA ESCÁNER
   ============================================================ */
function viewEscaner() {
  const ev = CFG || {};
  app.innerHTML = `
    <div class="appbar">
      <img class="mark-img" src="${APP_ICON}" alt="" />
      <div class="who ev-chip" style="flex-direction:column;align-items:flex-start;">
        <div class="ev-name">${esc(ev.nombre || 'Sin evento')}</div>
        <div class="ev-sub">N° ${esc(ev.id)} · ${esc(ev.lugar || '')}</div>
      </div>
      <div class="cnt" id="sc-cnt" title="Asistencias registradas en este dispositivo">0</div>
    </div>

    <div class="pad stack">
      <div class="cam" id="sc-cam">
        <video id="sc-video" playsinline muted></video>
        <div class="cam-frame"></div>
        <div class="cam-off" id="sc-off">
          <div class="cam-off-ico">📷</div>
          <p class="muted small">El escáner está apagado.<br/>Actívalo y apunta al QR de la app.</p>
        </div>
      </div>

      <div id="sc-res" class="res res-idle">
        <div class="res-t" id="sc-res-t">Listo para escanear</div>
        <div class="res-s" id="sc-res-s">Cada lectura registra la asistencia al instante.</div>
      </div>

      <button id="sc-toggle" class="btn btn-primary btn-block">▶️ Activar escaneo</button>
      <button id="sc-doc" class="btn btn-ghost btn-block">🆘 Ayuda: registrar con DOCUMENTO</button>
      <button id="sc-cfg" class="btn btn-quiet btn-block">🔄 Cambiar de evento</button>

      ${footBrand()}
    </div>`;
  app.hidden = false; hideSplash();
  paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));
  $('#sc-cnt').textContent = String(SCAN.total);
  $('#sc-toggle').onclick = () => (SCAN.on ? scanStop() : scanStart());
  $('#sc-doc').onclick = sheetDocumento;
  $('#sc-cfg').onclick = () => go('config');
  pintarToggle();
  if (RES_PEND) { resultado(RES_PEND.kind, RES_PEND.titulo, RES_PEND.sub); RES_PEND = null; }
  revalidarEvento();
  precargarResidencias();
}

/* El evento pudo cerrarse desde la privada mientras el equipo estaba abierto.
   Esto es solo cortesía para avisar temprano: el que de verdad manda es el
   backend, que revalida el estado en cada registro. */
async function revalidarEvento() {
  if (!CFG) return;
  try {
    const d = await api('asis.evento', { idEvento: CFG.id }, { silencio: true });
    if (!d || !d.existe) { avisoEvento('Ese evento ya no existe', 'Vuelve a configurar el equipo.'); return; }
    const ev = d.evento;
    cfgGuardar({ id: ev.id, nombre: ev.nombre, lugar: ev.lugar, anfitrion: ev.anfitrion });
    if (ev.estado === 'PROGRAMADO') return avisoEvento('El evento no tiene apertura de asistencia', 'Ábrelo desde la app privada o elige otro.');
    if (ev.estado !== 'CORRIENDO')  return avisoEvento('El evento ya cerró asistencia', 'Elige otro evento para seguir registrando.');
  } catch (e) { /* sin red: el backend valida igual en cada lectura */ }
}

function avisoEvento(titulo, sub) {
  scanStop();
  sonar('err');
  resultado('err', titulo, sub);
}

function pintarToggle() {
  const b = $('#sc-toggle'); if (!b) return;
  b.innerHTML = SCAN.on ? '⏹️ Desactivar escaneo' : '▶️ Activar escaneo';
  b.classList.toggle('btn-primary', !SCAN.on);
  b.classList.toggle('btn-danger', SCAN.on);
  const off = $('#sc-off'); if (off) off.classList.toggle('hidden', SCAN.on);
  const cam = $('#sc-cam'); if (cam) cam.classList.toggle('live', SCAN.on);
}

/* Cuando venimos de otra vista (p. ej. de guardar a una persona nueva) el
   resultado se deja pendiente y lo pinta viewEscaner al montarse: pintar con
   un setTimeout a ojo se pierde si la vista tarda un pelo más en armarse. */
let RES_PEND = null;
function resultadoAlVolver(kind, titulo, sub) { RES_PEND = { kind, titulo, sub }; }

function resultado(kind, titulo, sub) {
  const box = $('#sc-res'); if (!box) return;
  box.className = 'res res-' + kind;
  $('#sc-res-t').textContent = titulo;
  $('#sc-res-s').textContent = sub || '';
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
}

/* ============================================================
   MOTOR DE ESCANEO
   Permanente: se activa UNA vez y sigue leyendo. Nadie vuelve a
   tocar la pantalla entre persona y persona.
   ============================================================ */
const SCAN = { on: false, stream: null, det: null, raf: null, busy: false, total: 0, vistos: new Map(), geo: null };
const COOLDOWN_MS = 5000;  // el mismo QR delante de la cámara no se relee en 5 s
const NO_HAY = 'NO_HAY';

async function scanStart() {
  if (SCAN.on) return;
  const video = $('#sc-video'); if (!video) return;
  try {
    SCAN.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    resultado('err', 'Sin cámara', 'El navegador no dio permiso o el equipo no tiene cámara.');
    sonar('err');
    return;
  }
  video.srcObject = SCAN.stream;
  try { await video.play(); } catch (e) {}
  try { await prepararDetector(); } catch (e) {
    scanStop();
    resultado('err', 'No se pudo iniciar el lector', 'Revisa la conexión y vuelve a intentarlo.');
    return;
  }
  SCAN.on = true;
  try { if ('wakeLock' in navigator) SCAN._wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  pintarToggle();
  resultado('idle', 'Escaneando…', 'Apunta al QR. No hay que oprimir nada entre persona y persona.');
  loopScan();
}

function scanStop() {
  if (!SCAN.on && !SCAN.stream) return;
  SCAN.on = false;
  if (SCAN.raf) { cancelAnimationFrame(SCAN.raf); SCAN.raf = null; }
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); SCAN.stream = null; }
  const v = $('#sc-video'); if (v) v.srcObject = null;
  SCAN.geo = null;                    // apaga el marco/punto verde de la capa 8
  try { if (SCAN._wake) { SCAN._wake.release(); SCAN._wake = null; } } catch (e) {}
  pintarToggle();
  const box = $('#sc-res'); if (box && box.classList.contains('res-idle')) resultado('idle', 'Escáner apagado', 'Actívalo para seguir registrando.');
}

/* BarcodeDetector nativo si el equipo lo tiene (Android/Chrome: es el más
   rápido, va en el sistema). Si no, jsQR desde CDN (Safari/iOS). */
async function prepararDetector() {
  if (SCAN.det) return;
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      if (fmts.indexOf('qr_code') >= 0) {
        const d = new window.BarcodeDetector({ formats: ['qr_code'] });
        SCAN.det = { tipo: 'nativo', d: d };
        return;
      }
    } catch (e) {}
  }
  await cargarJsQR();
  SCAN.det = { tipo: 'jsqr', canvas: document.createElement('canvas') };
}

function cargarJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSQR_CDN; s.onload = () => res(); s.onerror = () => rej(new Error('jsQR'));
    document.head.appendChild(s);
  });
}

/* Dónde quedó el QR dentro del fotograma. Se guarda SIEMPRE en pixeles del
   VIDEO (no de la pantalla): la capa 8 lo traduce a la caja de la camara.
   Si no hay lectura, se limpia y el marco verde se apaga solo. */
function marcarGeo(pts, vw, vh) {
  SCAN.geo = (pts && pts.length === 4 && vw && vh)
    ? { pts: pts, vw: vw, vh: vh, t: Date.now() }
    : null;
}

async function leerFrame(video) {
  if (!SCAN.det) return '';
  if (SCAN.det.tipo === 'nativo') {
    const codes = await SCAN.det.d.detect(video);
    const c0 = codes && codes[0];
    if (!c0 || !c0.rawValue) { marcarGeo(null); return ''; }
    let pts = null;
    if (c0.cornerPoints && c0.cornerPoints.length === 4) {
      pts = c0.cornerPoints.map(p => ({ x: p.x, y: p.y }));
    } else if (c0.boundingBox) {
      const b = c0.boundingBox;
      pts = [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
             { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }];
    }
    marcarGeo(pts, video.videoWidth, video.videoHeight);
    return String(c0.rawValue);
  }
  const c = SCAN.det.canvas;
  const w = video.videoWidth, hh = video.videoHeight;
  if (!w || !hh) { marcarGeo(null); return ''; }
  const escala = Math.min(1, 640 / Math.max(w, hh));
  c.width = Math.round(w * escala); c.height = Math.round(hh * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (!r || !r.data) { marcarGeo(null); return ''; }
  const L = r.location;
  let pts = null;
  if (L && L.topLeftCorner && L.bottomRightCorner) {
    pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner]
      .map(p => ({ x: p.x / escala, y: p.y / escala }));   // vuelta a pixeles del video
  }
  marcarGeo(pts, w, hh);
  return String(r.data);
}

async function loopScan() {
  if (!SCAN.on) return;
  const video = $('#sc-video');
  if (video && video.readyState >= 2 && !SCAN.busy) {
    try {
      const raw = await leerFrame(video);
      if (raw) await procesarLectura(raw);
    } catch (e) { /* un frame malo no puede tumbar el escáner */ }
  }
  SCAN.raf = requestAnimationFrame(loopScan);
}

/* El QR de la app pública lleva SOLO el ID_USUARIO (JP + 8). Se acepta
   igual si viniera envuelto en una URL, y se acepta un documento suelto
   por si alguien pega otro tipo de código. */
function interpretar(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/JP[A-Z0-9]{8}/i);
  if (m) return { id: m[0].toUpperCase() };
  const d = onlyDig(s);
  if (/^\d{6,10}$/.test(d)) return { documento: d };
  return null;
}

async function procesarLectura(raw) {
  const p = interpretar(raw);
  const clave = p ? (p.id || p.documento) : NO_HAY + raw;
  const ahora = Date.now();
  const ult = SCAN.vistos.get(clave) || 0;
  if (ahora - ult < COOLDOWN_MS) return;   // el mismo código sigue delante de la cámara
  SCAN.vistos.set(clave, ahora);
  if (SCAN.vistos.size > 400) SCAN.vistos.clear();

  if (!p) { sonar('err'); vibrar(200); resultado('err', 'QR no reconocido', 'Ese código no es de la app de Jhonny Perdomo.'); return; }
  await registrar(p);
}

/* ---------- El registro (lo mismo para QR y para documento) ---------- */
async function registrar(p) {
  if (SCAN.busy) return null;
  if (!CFG) { go('config'); return null; }
  SCAN.busy = true;
  try {
    const d = await api('asis.registrar', Object.assign({ idEvento: CFG.id }, p), { silencio: true });

    /* El evento se cerró (o nunca abrió) mientras el equipo estaba encendido */
    if (d.cerrado) {
      sonar('err'); vibrar([200, 80, 200]);
      avisoEvento(d.msg || 'El evento no está abierto', 'Cambia de evento para seguir registrando.');
      return d;
    }

    if (d.noEncontrado) {
      if (d.porQr) {
        sonar('err'); vibrar([120, 60, 120]);
        resultado('err', 'QR NO RECONOCIDO', 'Ese código no corresponde a nadie de la base de datos.');
        return d;
      }
      /* Persona nueva: se va derecho al registro con el documento puesto */
      sonar('info'); vibrar(80);
      scanStop();
      go('registro?doc=' + encodeURIComponent(d.documento || ''));
      return d;
    }

    if (d.yaRegistrada) {
      sonar('info'); vibrar(80);
      resultado('warn', 'ASISTENCIA YA REGISTRADA', nombreYZona(d.persona));
      return d;
    }

    SCAN.total++;
    const c = $('#sc-cnt'); if (c) c.textContent = String(SCAN.total);
    sonar('ok'); vibrar(60);
    resultado('ok', 'ASISTENCIA REGISTRADA', nombreYZona(d.persona));
    return d;
  } catch (e) {
    sonar('err'); vibrar(200);
    resultado('err', 'No se pudo registrar', String(e.message || e) + ' · Revisa la conexión.');
    return null;
  } finally { SCAN.busy = false; }
}

function nombreYZona(per) {
  if (!per) return '';
  const n = String(per.nombre || '').trim();
  const r = String(per.residencia || '').trim();
  return [n, r].filter(Boolean).join(' — ');
}

/* ============================================================
   AYUDA: REGISTRAR CON DOCUMENTO
   Por si el QR no está a mano.
   ============================================================ */
function sheetDocumento() {
  const escaneando = SCAN.on;
  if (escaneando) SCAN.busy = true; // la cámara sigue viva pero no dispara mientras se teclea

  const sh = openSheet(`
    <div class="grip"></div>
    <h2 class="h2" style="margin-bottom:4px;">Registrar con documento</h2>
    <p class="small muted" style="margin-bottom:14px;">Número del documento, sin puntos ni espacios (6 a 10 dígitos).</p>
    <label class="field"><span>Documento</span>
      <input class="input" id="dc-doc" type="tel" inputmode="numeric" autocomplete="off" placeholder="Ej: 1110234567" />
    </label>
    <div class="stack" style="margin-top:16px;">
      <button class="btn btn-primary btn-block" id="dc-ok">Registrar asistencia</button>
      <button class="btn btn-quiet btn-block" id="dc-no">Cancelar</button>
    </div>`);

  const inp = $('#dc-doc', sh);
  inp.addEventListener('input', () => { inp.value = onlyDig(inp.value); });
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);

  const salir = () => { closeLayer(); if (escaneando && SCAN.on) SCAN.busy = false; };
  $('#dc-no', sh).onclick = salir;

  const enviar = async () => {
    const doc = onlyDig(val('dc-doc'));
    if (!/^\d{6,10}$/.test(doc)) { toast('El documento debe tener de 6 a 10 dígitos', 'err'); return; }
    const b = $('#dc-ok', sh); saving(b, true);
    SCAN.busy = false;              // registrar() necesita el paso libre
    const d = await registrar({ documento: doc });
    SCAN.busy = (escaneando && SCAN.on) ? true : false;
    saving(b, false);
    /* Si la persona no está en la base, registrar() ya se llevó la pantalla al
       formulario: cerrar la hoja igual. */
    if (d) salir();
  };
  $('#dc-ok', sh).onclick = enviar;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
}

/* ============================================================
   VISTA REGISTRO — la persona NO está en la base
   Se guarda de una vez (no hay resumen) y con eso queda registrada la
   asistencia. Las zonas se precargan al entrar al escáner para que esto
   abra al instante.
   ============================================================ */
let ZONAS = null, _zonasInFlight = null;
function precargarResidencias() {
  if (ZONAS || _zonasInFlight) return _zonasInFlight;
  _zonasInFlight = api('pub.residencias', {}, { silencio: true })
    .then(d => { ZONAS = (d || []).filter(Boolean); return ZONAS; })
    .catch(() => null)
    .finally(() => { _zonasInFlight = null; });
  return _zonasInFlight;
}

function viewRegistro(doc) {
  app.innerHTML = `
    <div class="appbar">
      <img class="mark-img" src="${APP_ICON}" alt="" />
      <div class="who"><b>Registrar persona</b><span>${esc((CFG && CFG.nombre) || '')}</span></div>
    </div>

    <div class="pad stack">
      <div class="res res-warn"><div class="res-t">NO ESTÁ EN LA BASE DE DATOS</div>
        <div class="res-s">Regístrala aquí y su asistencia queda guardada de una vez.</div></div>

      <label class="field"><span>Documento</span>
        <input class="input" id="rg-doc" type="tel" inputmode="numeric" value="${esc(doc)}" />
      </label>
      <label class="field"><span>Nombre completo</span>
        <input class="input" id="rg-nom" type="text" autocomplete="off" placeholder="Nombre y apellido" />
      </label>
      <label class="field"><span>WhatsApp (10 dígitos)</span>
        <input class="input" id="rg-tel" type="tel" inputmode="numeric" placeholder="3001234567" />
      </label>

      <div class="field"><span>Residencia</span>
        <div class="combo" id="rg-combo">
          <button type="button" class="combo-btn" id="rg-cbtn" aria-haspopup="listbox" aria-expanded="false">
            <span class="combo-val ph" id="rg-clbl">Elige la zona…</span>
            <span class="combo-caret">▾</span>
          </button>
          <div class="combo-pop hidden" id="rg-pop">
            <input class="input combo-fil" id="rg-fil" type="text" autocomplete="off" placeholder="Filtra la zona…" />
            <div class="combo-list" id="rg-list" role="listbox"></div>
          </div>
          <input type="hidden" id="rg-res" value="" />
        </div>
      </div>

      <label class="chk"><input type="checkbox" id="rg-chk" /> Refiere un líder</label>
      <label class="field hidden" id="rg-ref-wrap"><span>Número del líder</span>
        <input class="input" id="rg-ref" type="tel" inputmode="numeric" autocomplete="off" placeholder="N° de referido del líder" />
      </label>

      <button class="btn btn-primary btn-block" id="rg-ok">Guardar y registrar asistencia</button>
      <button class="btn btn-quiet btn-block" id="rg-back">↩️ Atrás (volver al escaneo)</button>

      ${footBrand()}
    </div>`;
  app.hidden = false; hideSplash();
  paintVersion(APP_VERSION_LOADED || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''));

  $('#rg-doc').addEventListener('input', e => { e.target.value = onlyDig(e.target.value); });
  $('#rg-tel').addEventListener('input', e => { e.target.value = onlyDig(e.target.value).slice(0, 10); });
  $('#rg-ref').addEventListener('input', e => { e.target.value = onlyDig(e.target.value); });

  const chk = $('#rg-chk'), wrap = $('#rg-ref-wrap');
  chk.onchange = () => { wrap.classList.toggle('hidden', !chk.checked); if (chk.checked) setTimeout(() => { try { $('#rg-ref').focus(); } catch (e) {} }, 40); };

  $('#rg-back').onclick = () => go('escaner');

  comboInit();
  if (!ZONAS) precargarResidencias().then(pintarZonas);

  $('#rg-ok').onclick = guardarPersona;
  setTimeout(() => { try { $('#rg-nom').focus(); } catch (e) {} }, 80);
}

/* ---- Combo de zona: el filtro va DENTRO del desplegable ----
   Es un desplegable propio (no <select> nativo) porque el nativo no admite
   nada adentro. El valor elegido vive en el input oculto #rg-res, así que
   guardarPersona() lo lee igual que antes. */
let _comboFuera = null;

function comboInit() {
  const btn = $('#rg-cbtn'), pop = $('#rg-pop'), fil = $('#rg-fil'), list = $('#rg-list');
  if (!btn || !pop || !fil || !list) return;

  btn.addEventListener('click', () => comboAbrir(pop.classList.contains('hidden')));
  fil.addEventListener('input', pintarZonas);
  fil.addEventListener('keydown', comboTeclado);
  list.addEventListener('click', (e) => {
    const it = e.target.closest ? e.target.closest('.combo-item') : null;
    if (it) comboElegir(it.getAttribute('data-v'));
  });

  // Cerrar al tocar fuera. El handler se autolimpia cuando la vista cambia.
  if (_comboFuera) document.removeEventListener('click', _comboFuera);
  _comboFuera = (e) => {
    const c = $('#rg-combo');
    if (!c) { document.removeEventListener('click', _comboFuera); _comboFuera = null; return; }
    if (!c.contains(e.target)) comboAbrir(false);
  };
  document.addEventListener('click', _comboFuera);

  pintarZonas();
}

function comboAbrir(abrir) {
  const pop = $('#rg-pop'), btn = $('#rg-cbtn'); if (!pop || !btn) return;
  pop.classList.toggle('hidden', !abrir);
  btn.classList.toggle('open', !!abrir);
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  if (abrir) { pintarZonas(); setTimeout(() => { try { $('#rg-fil').focus(); } catch (e) {} }, 20); }
}

function comboElegir(v) {
  const hid = $('#rg-res'), lbl = $('#rg-clbl'), fil = $('#rg-fil');
  if (!hid || !lbl) return;
  hid.value = v || '';
  lbl.textContent = v || 'Elige la zona…';
  lbl.classList.toggle('ph', !v);
  if (fil) fil.value = '';
  comboAbrir(false);
}

function comboTeclado(e) {
  if (e.key === 'Escape') { comboAbrir(false); try { $('#rg-cbtn').focus(); } catch (_) {} return; }
  const items = $$('.combo-item', $('#rg-list') || document);
  if (!items.length) return;
  let i = items.findIndex(x => x.classList.contains('act'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    i = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    items.forEach(x => x.classList.remove('act'));
    items[i].classList.add('act');
    try { items[i].scrollIntoView({ block: 'nearest' }); } catch (_) {}
  } else if (e.key === 'Enter') {
    e.preventDefault();
    comboElegir(items[i >= 0 ? i : 0].getAttribute('data-v'));
  }
}

function pintarZonas() {
  const list = $('#rg-list'); if (!list) return;
  if (!ZONAS) { list.innerHTML = `<div class="combo-vacio">Cargando zonas…</div>`; return; }
  const f = (($('#rg-fil') || {}).value || '').trim().toUpperCase();
  const sel = (($('#rg-res') || {}).value || '');
  const lista = ZONAS.filter(z => !f || String(z).toUpperCase().includes(f));
  if (!lista.length) { list.innerHTML = `<div class="combo-vacio">Ninguna zona coincide</div>`; return; }
  list.innerHTML = lista.map(z => `<div class="combo-item${String(z) === sel ? ' sel' : ''}" role="option" data-v="${esc(z)}">${esc(z)}</div>`).join('');
}

async function guardarPersona() {
  if (!CFG) { go('config'); return; }
  const doc = onlyDig(val('rg-doc'));
  const nom = val('rg-nom');
  const tel = onlyDig(val('rg-tel'));
  const res = val('rg-res');
  const refOn = !!($('#rg-chk') || {}).checked;
  const ref = refOn ? onlyDig(val('rg-ref')) : '';

  if (!/^\d{6,10}$/.test(doc)) { toast('El documento debe tener de 6 a 10 dígitos', 'err'); return; }
  if (nom.split(/\s+/).filter(Boolean).length < 2) { toast('Escribe el nombre y el apellido', 'err'); return; }
  if (!/^\d{10}$/.test(tel)) { toast('El WhatsApp debe tener exactamente 10 dígitos', 'err'); return; }
  if (!res) { toast('Elige la residencia', 'err'); return; }
  if (refOn && !ref) { toast('Escribe el número del líder o desmarca la casilla', 'err'); return; }

  const b = $('#rg-ok'); saving(b, true);
  try {
    const d = await api('asis.nuevo', { idEvento: CFG.id, documento: doc, nombre: nom, telefono: tel, residencia: res, referencia: ref });
    if (d.cerrado) { sonar('err'); toast(d.msg || 'El evento no está abierto', 'err'); go('escaner'); return; }
    if (d.success === false) { sonar('err'); toast(d.message || 'No se pudo registrar', 'err'); return; }

    SCAN.total++;
    sonar('ok'); vibrar(60);
    resultadoAlVolver('ok', d.yaRegistrada ? 'ASISTENCIA YA REGISTRADA' : 'PERSONA REGISTRADA · ASISTENCIA GUARDADA', nombreYZona(d.persona));
    go('escaner');
  } catch (e) {
    sonar('err');
    toast('No se pudo guardar: ' + String(e.message || e), 'err');
  } finally { saving(b, false); }
}

/* ============================================================
   ARRANQUE  (gate de instalación → configuración → escáner)
   ============================================================ */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
async function initApp() {
  if (typeof APP_VERSION !== 'undefined' && APP_VERSION) { APP_VERSION_LOADED = String(APP_VERSION); paintVersion(APP_VERSION_LOADED); }
  checkVersion(); setInterval(checkVersion, 60000);
  CFG = cfgLeer();
  const hash = location.hash || '';
  const arranqueLimpio = (hash === '' || hash === '#/' || hash.startsWith('#/escaner'));
  const yaContinuoWeb = sessionStorage.getItem('continuedWeb') === '1';
  if (!isStandalone() && !yaContinuoWeb && arranqueLimpio) { location.hash = '#/instalar'; }
  render();
}
initApp();
