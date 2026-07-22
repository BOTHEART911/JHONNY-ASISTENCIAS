/* ============================================================
 * CAPA 8 · CHECK Y MARCO VERDE SOBRE LA CÁMARA  (JHONNY ASISTENCIA)
 *
 * Qué hace: mientras el escáner está encendido, dibuja el marco y
 * el punto verde encima del QR que la cámara está viendo (sigue al
 * código, no es un adorno fijo), y cuando la lectura se procesa
 * lanza un CHECK grande en el centro del código:
 *    verde  ✓  registrado
 *    ámbar  ✓  ya estaba registrado
 *    rojo   ✕  no reconocido / no está en la base / sin conexión
 * El color sale del mismo resultado() que ya pinta el recuadro de
 * abajo, así que nunca se contradicen.
 *
 * Instalación — pegar en index.html, al final del <body>, DESPUÉS
 * de <script src="app.js"></script>:
 *   <script src="capa-8-checkqr.js"></script>
 *
 * Pareja: capa-8-checkqr.css  (los dos o ninguno).
 * Necesita de app.js: SCAN.geo (lo llena leerFrame). Si el app.js
 * no lo trae, la capa no dibuja marco y solo hace el check central.
 * Notas:
 *  - No toca la cámara ni el registro: solo pinta encima.
 *  - Si el código deja de verse, el marco se apaga solo a los
 *    260 ms (no se queda un marco fantasma en pantalla).
 *  - Respeta "reducir movimiento": el check aparece sin rebote.
 * ============================================================ */
(function () {
  'use strict';

  var EDAD_MAX  = 260;   // ms sin volver a ver el código → se apaga el marco
  var CHECK_MS  = 950;   // lo que dura el check en pantalla
  var COLOR = { ok: '#22C55E', warn: '#F59E0B', err: '#EF4444' };

  var chkHasta = 0;

  /* app.js declara el estado con  const SCAN = {...}  ⇒ NO queda colgado de
     window (un const de nivel global es un enlace léxico, no una propiedad del
     objeto global). Se busca por el enlace y, de respaldo, por window. */
  function estado() {
    try { if (typeof SCAN !== 'undefined' && SCAN) return SCAN; } catch (e) {}
    try { return window.SCAN || null; } catch (e) { return null; }
  }


  /* ---------- Geometría (expuesta para las pruebas) ---------- */

  /* El <video> va con object-fit: cover ⇒ se amplía hasta tapar la
     caja y se recorta lo que sobra. Esto traduce un punto del video
     al mismo punto de la caja en pantalla. */
  function mapear(pt, vw, vh, cw, ch) {
    var s = Math.max(cw / vw, ch / vh);
    return { x: pt.x * s + (cw - vw * s) / 2, y: pt.y * s + (ch - vh * s) / 2 };
  }

  function centroide(pts) {
    var x = 0, y = 0;
    for (var i = 0; i < pts.length; i++) { x += pts[i].x; y += pts[i].y; }
    return { x: x / pts.length, y: y / pts.length };
  }

  function fresca(geo, ahora) {
    return !!(geo && geo.pts && geo.pts.length === 4 && (ahora - geo.t) <= EDAD_MAX);
  }

  function limitar(v, min, max) { return v < min ? min : (v > max ? max : v); }

  window.QRCHK = { mapear: mapear, centroide: centroide, fresca: fresca, limitar: limitar, EDAD_MAX: EDAD_MAX };

  if (typeof document === 'undefined') return;

  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  /* ---------- Piezas dentro de la caja de la cámara ---------- */
  function piezas() {
    var cam = document.getElementById('sc-cam');
    if (!cam) return null;
    var ov = cam.querySelector('.cam-ov');
    if (!ov) {
      ov = document.createElement('canvas');
      ov.className = 'cam-ov';
      var off = cam.querySelector('.cam-off');
      if (off) cam.insertBefore(ov, off); else cam.appendChild(ov);
    }
    var chk = cam.querySelector('.cam-chk');
    if (!chk) {
      chk = document.createElement('div');
      chk.className = 'cam-chk';
      chk.setAttribute('aria-hidden', 'true');
      var off2 = cam.querySelector('.cam-off');
      if (off2) cam.insertBefore(chk, off2); else cam.appendChild(chk);
    }
    return { cam: cam, ov: ov, chk: chk };
  }

  /* ---------- El check grande ---------- */
  function flash(kind) {
    var p = piezas(); if (!p) return;
    var S = estado(); var geo = S && S.geo;
    var cw = p.cam.clientWidth, ch = p.cam.clientHeight;
    var cx = cw / 2, cy = ch / 2;
    if (fresca(geo, Date.now()) && cw && ch) {
      var c = centroide(geo.pts.map(function (q) { return mapear(q, geo.vw, geo.vh, cw, ch); }));
      cx = limitar(c.x, 62, cw - 62);
      cy = limitar(c.y, 62, ch - 62);
    }
    p.chk.style.left = cx + 'px';
    p.chk.style.top  = cy + 'px';
    p.chk.textContent = (kind === 'err') ? '✕' : '✓';
    p.chk.className = 'cam-chk ' + kind + (reduce ? ' plano' : '');
    void p.chk.offsetWidth;                       // reinicia la animación
    p.chk.classList.add('show');
    chkHasta = Date.now() + CHECK_MS;
  }

  /* resultado() es el embudo por donde pasa TODA lectura procesada
     (QR y documento). Se envuelve, no se reemplaza: lo de app.js
     sigue corriendo igual. */
  var _resultado = window.resultado;
  window.resultado = function (kind, titulo, sub) {
    var r;
    try { if (typeof _resultado === 'function') r = _resultado.apply(this, arguments); }
    finally {
      try {
        var S = estado();
        if (S && S.on && COLOR[kind]) flash(kind);
      } catch (e) {}
    }
    return r;
  };

  /* ---------- Marco + punto verde, fotograma a fotograma ---------- */
  function pintar() {
    var p = piezas();
    if (!p) { requestAnimationFrame(pintar); return; }
    var vivo = p.cam.classList.contains('live');
    var cw = p.cam.clientWidth, ch = p.cam.clientHeight;
    if (cw && ch) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      if (p.ov.width !== w || p.ov.height !== h) { p.ov.width = w; p.ov.height = h; }
      var ctx = p.ov.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      var S = estado(); var geo = S && S.geo;
      if (vivo && fresca(geo, Date.now())) {
        var pts = geo.pts.map(function (q) { return mapear(q, geo.vw, geo.vh, cw, ch); });
        var color = (Date.now() < chkHasta && p.chk.classList.contains('warn')) ? COLOR.warn
                  : (Date.now() < chkHasta && p.chk.classList.contains('err'))  ? COLOR.err
                  : COLOR.ok;
        dibujar(ctx, pts, color);
      }
    }
    requestAnimationFrame(pintar);
  }

  function dibujar(ctx, pts, color) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(34,197,94,.16)';
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 6;
    for (var j = 0; j < 4; j++) {
      var a = pts[j], b = pts[(j + 1) % 4], c = pts[(j + 3) % 4];
      esquina(ctx, a, b);
      esquina(ctx, a, c);
    }

    var g = centroide(pts);
    ctx.beginPath();
    ctx.arc(g.x, g.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.stroke();
    ctx.restore();
  }

  /* Corchete: un tramo corto desde la esquina hacia el lado vecino */
  function esquina(ctx, a, b) {
    var t = 0.26;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    ctx.stroke();
  }

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pintar);
})();
