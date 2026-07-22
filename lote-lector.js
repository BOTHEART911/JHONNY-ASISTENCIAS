/* ============================================================
 * LOTE · MOTOR DE MULTI-LECTURA  (varios QR en el mismo fotograma)
 *
 * Lo usa el modo LOTE de app.js. No toca nada del modo uno a uno.
 *
 * Por qué existe este archivo aparte:
 *   - Android/Chrome: BarcodeDetector.detect() YA devuelve todos los
 *     códigos del fotograma. No hace falta nada más.
 *   - iPhone/Safari: no hay BarcodeDetector, y jsQR (el respaldo que
 *     usa el modo uno a uno) NO sirve aquí: probado, con 2 o más QR en
 *     la misma imagen devuelve CERO, no uno. Por eso en lote se usa
 *     zbar-wasm, que sí saca todos (6 de 6 apiñados en ~25 ms) y
 *     además entrega las 4 esquinas de cada código para el marco verde.
 *
 * zbar-wasm se carga del CDN en un solo archivo con el wasm incrustado
 * (no hay una segunda descarga que se pueda quedar a medias). El
 * service worker ya cachea jsdelivr, así que después del primer uso
 * funciona sin red.
 *
 * Si el CDN no responde, `preparar()` falla y app.js deja el modo lote
 * apagado en ese equipo: el uno a uno sigue igual que siempre.
 *
 * Instalación — en index.html, DESPUÉS de app.js:
 *   <script src="lote-lector.js"></script>
 * Pareja: lote.css
 * ============================================================ */
(function () {
  'use strict';

  var ZBAR_CDN = 'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/inlined/index.js';
  var MAX_LADO = 1920;          // tope del cuadro que se le pasa a zbar
  var _cargando = null;
  var _scanner = null;

  /* ---------- Normalizar esquinas ---------- */

  /* BarcodeDetector: cornerPoints si las trae; si no, la caja. */
  function ptsNativo(c) {
    if (!c) return null;
    if (c.cornerPoints && c.cornerPoints.length >= 4) {
      return c.cornerPoints.slice(0, 4).map(function (p) { return { x: p.x, y: p.y }; });
    }
    if (c.boundingBox) {
      var b = c.boundingBox;
      return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
              { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }];
    }
    return null;
  }

  /* zbar: points es el contorno del símbolo. Si trae más de 4 puntos se
     reduce a la caja que los envuelve (el marco tiene que ser un cuadro). */
  function ptsZbar(sym) {
    if (!sym || !sym.points || !sym.points.length) return null;
    var p = sym.points;
    if (p.length === 4) return p.map(function (q) { return { x: q.x, y: q.y }; });
    var xs = p.map(function (q) { return q.x; }), ys = p.map(function (q) { return q.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  /* ---------- Carga de zbar ---------- */
  function cargarZbar() {
    if (typeof window !== 'undefined' && window.zbarWasm) return Promise.resolve(window.zbarWasm);
    if (_cargando) return _cargando;
    _cargando = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = ZBAR_CDN;
      s.onload = function () { window.zbarWasm ? res(window.zbarWasm) : rej(new Error('zbar no expuso su API')); };
      s.onerror = function () { _cargando = null; rej(new Error('No se pudo descargar el lector múltiple')); };
      document.head.appendChild(s);
    });
    return _cargando;
  }

  /* Un solo escáner, limitado a QR y reutilizado en todos los fotogramas
     (crear uno por fotograma cuesta cuatro veces más). */
  function escaner(zb) {
    if (_scanner) return Promise.resolve(_scanner);
    return Promise.resolve(zb.getDefaultScanner()).then(function (sc) {
      try {
        sc.setConfig(zb.ZBarSymbolType.ZBAR_NONE, zb.ZBarConfigType.ZBAR_CFG_ENABLE, 0);
        sc.setConfig(zb.ZBarSymbolType.ZBAR_QRCODE, zb.ZBarConfigType.ZBAR_CFG_ENABLE, 1);
      } catch (e) {}
      _scanner = sc;
      return sc;
    });
  }

  /* ---------- Preparar el detector del modo lote ----------
     det: el detector que ya armó app.js para el uno a uno.
     Devuelve un detector de LOTE (puede ser el mismo, si es nativo). */
  function preparar(det) {
    if (det && det.tipo === 'nativo') return Promise.resolve({ tipo: 'nativo', d: det.d });
    return cargarZbar().then(function (zb) {
      return escaner(zb).then(function (sc) {
        return { tipo: 'zbar', zb: zb, sc: sc, canvas: document.createElement('canvas') };
      });
    });
  }

  /* ---------- Leer TODOS los códigos de un fotograma ----------
     Devuelve { lecturas: [{ raw, pts }], vw, vh } con las esquinas en
     píxeles del VIDEO (que es lo que espera la capa 8). */
  function leerVarios(video, det) {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!det || !vw || !vh) return Promise.resolve({ lecturas: [], vw: vw, vh: vh });

    if (det.tipo === 'nativo') {
      return det.d.detect(video).then(function (codes) {
        var out = [];
        (codes || []).forEach(function (c) {
          var raw = c && c.rawValue ? String(c.rawValue) : '';
          if (!raw) return;
          out.push({ raw: raw, pts: ptsNativo(c) });
        });
        return { lecturas: out, vw: vw, vh: vh };
      });
    }

    /* zbar: el fotograma va a resolución nativa (probado: reducido a 640
       una tarjeta de 4 cm no se lee). Solo se recorta si es enorme. */
    var esc = Math.min(1, MAX_LADO / Math.max(vw, vh));
    var c = det.canvas;
    var w = Math.round(vw * esc), h = Math.round(vh * esc);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h);

    return Promise.resolve(det.zb.scanImageData(img, det.sc)).then(function (syms) {
      var out = [];
      (syms || []).forEach(function (s) {
        var raw = '';
        try { raw = String(s.decode() || ''); } catch (e) {}
        if (!raw) return;
        var pts = ptsZbar(s);
        if (pts && esc !== 1) pts = pts.map(function (q) { return { x: q.x / esc, y: q.y / esc }; });
        out.push({ raw: raw, pts: pts });
      });
      return { lecturas: out, vw: vw, vh: vh };
    });
  }

  /* ---------- Cola de envío ----------
     Guarda lo leído hasta que toca mandarlo, y recuerda lo ya mandado
     para que la misma tarjeta delante de la cámara no viaje dos veces. */
  function Cola() {
    this.pend = [];
    this.enviados = {};
  }
  Cola.prototype.nuevo = function (id) {
    if (!id) return false;
    if (this.enviados[id]) return false;
    if (this.pend.indexOf(id) >= 0) return false;
    this.pend.push(id);
    return true;
  };
  Cola.prototype.tamano = function () { return this.pend.length; };
  Cola.prototype.tomar = function (max) {
    var t = this.pend.splice(0, max || 30);
    for (var i = 0; i < t.length; i++) this.enviados[t[i]] = 'enviando';
    return t;
  };
  Cola.prototype.marcar = function (id, estado) { this.enviados[id] = estado || 'ok'; };
  Cola.prototype.devolver = function (ids) {   // falló la red: vuelven a la cola
    for (var i = 0; i < ids.length; i++) { delete this.enviados[ids[i]]; this.pend.unshift(ids[i]); }
  };
  Cola.prototype.limpiar = function () { this.pend = []; this.enviados = {}; };

  var API = {
    CDN: ZBAR_CDN,
    ptsNativo: ptsNativo,
    ptsZbar: ptsZbar,
    cargarZbar: cargarZbar,
    preparar: preparar,
    leerVarios: leerVarios,
    Cola: Cola
  };

  if (typeof window !== 'undefined') window.JPLOTE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
