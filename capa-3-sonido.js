/* ============================================================
 * CAPA 3 · SONIDO SIN RETARDO  (JHONNY ASISTENCIA) — funcional
 *
 * QUÉ HACE
 *   Descarga y decodifica los tres sonidos (ok / info / err) al abrir la
 *   app y reemplaza la función global sonar() para que suenen al instante,
 *   desde memoria, en vez de pedirle al navegador que reproduzca un
 *   elemento <audio> compartido. Dos lecturas seguidas ya no se pisan: hoy
 *   la segunda corta a la primera (mismo objeto Audio, currentTime = 0).
 *
 * CÓMO SE INSTALA  (una sola línea, al final del <body>, DESPUÉS de app.js)
 *   <script src="capa-3-sonido.js"></script>
 *
 * PAREJA
 *   Ninguna. Junto con capa-2 el sonido y la vibración caen a la vez.
 *
 * NOTAS IMPORTANTES
 *   - Ningún navegador deja sonar antes de que la persona toque la
 *     pantalla. La capa desbloquea el audio en el primer toque (el mismo
 *     con el que se activa el escáner), así que en la práctica no se nota.
 *   - Si la descarga falla (CORS de Cloudinary, sin red, navegador viejo)
 *     NO pasa nada: se deja la función sonar() original de la app tal cual.
 *   - Mantiene un antirrebote de 60 ms por tipo de sonido para que un
 *     doble disparo no suene como eco.
 *   - No toca los sonidos ni la lógica del escaneo: solo cómo se reproduce.
 * ============================================================ */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || typeof window.fetch !== 'function') return;              // sin soporte: se queda el original
  if (typeof window.sonar !== 'function') return;                     // no está el gancho: no tocamos nada
  if (window.sonar.__naSnd) return;                                   // ya instalada

  var URLS = (typeof SOUNDS !== 'undefined' && SOUNDS) ? SOUNDS : null;
  if (!URLS) return;

  var ctx = null, buffers = {}, listo = {}, ultimo = {};
  var sonarOrig = window.sonar;

  function ctxOn() {
    if (!ctx) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function cargar(kind) {
    var c = ctxOn(); if (!c || listo[kind]) return;
    listo[kind] = true;
    fetch(URLS[kind], { mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        return new Promise(function (res, rej) {
          // Firma vieja (callbacks) + nueva (promesa): Safari solo tiene la vieja.
          var p = c.decodeAudioData(ab, res, rej);
          if (p && typeof p.then === 'function') p.then(res, rej);
        });
      })
      .then(function (buf) { buffers[kind] = buf; })
      .catch(function () { listo[kind] = false; });                    // se reintenta en el próximo toque
  }

  function cargarTodo() { for (var k in URLS) if (Object.prototype.hasOwnProperty.call(URLS, k)) cargar(k); }

  function desbloquear() {
    var c = ctxOn();
    cargarTodo();
    if (c && c.state === 'running') {
      document.removeEventListener('pointerdown', desbloquear, true);
      document.removeEventListener('touchend', desbloquear, true);
      document.removeEventListener('click', desbloquear, true);
    }
  }
  document.addEventListener('pointerdown', desbloquear, true);
  document.addEventListener('touchend', desbloquear, true);
  document.addEventListener('click', desbloquear, true);
  cargarTodo();                                                        // por si el contexto ya nace "running"

  var envuelto = function (kind) {
    try {
      if (!URLS[kind]) return;
      var ahora = Date.now();
      if (ahora - (ultimo[kind] || 0) < 60) return;                    // eco, no
      ultimo[kind] = ahora;

      var buf = buffers[kind], c = ctx;
      if (!buf || !c || c.state !== 'running') {                       // aún no está en memoria
        cargar(kind);
        return sonarOrig.call(this, kind);                             // respaldo: el <audio> de la app
      }
      var src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    } catch (e) {
      try { return sonarOrig.call(this, kind); } catch (e2) {}
    }
  };
  envuelto.__naSnd = true;
  window.sonar = envuelto;
})();
