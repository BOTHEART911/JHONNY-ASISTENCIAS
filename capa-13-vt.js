/* ============================================================================
 * CAPA 13 · VIEW TRANSITIONS + CURVAS DE RESORTE — app ASISTENCIAS (escáner de kiosco)   ·   02/08/2026
 * ----------------------------------------------------------------------------
 * QUÉ HACE
 *   Le pide al navegador que anime él mismo el cambio de pantalla (View
 *   Transitions API). Lo que se gana con eso:
 *     · el ELEMENTO COMPARTIDO: la tarjeta que tocas se transforma en la hoja
 *       de detalle;
 *     · movimiento con CURVA DE RESORTE, como en las apps nativas.
 *
 * INSTALACIÓN (una sola línea, al final del <body>, DESPUÉS de capa-4-transicion.js)
 *   <script src="capa-13-vt.js"></script>
 *
 * PAREJA
 *   capa-13-vt.css  (obligatoria: sin ella esto no anima nada)
 *
 * CONVIVENCIA CON LA CAPA 4 (transición lateral)
 *   No se toca ni se borra la capa 4. Si el navegador soporta View
 *   Transitions, esta capa apaga EN CALIENTE su hoja de estilo
 *   (link[href*="capa-4-transicion"].disabled = true) y toma el mando. Su JS
 *   sigue corriendo sin efecto visible, y sigue marcando <html class="na-tx">,
 *   que es lo que mantiene callada a la capa 1.
 *   Si el navegador NO soporta View Transitions (iPhone con iOS 17 o menos),
 *   esta capa se retira en la primera línea y la capa 4 queda intacta.
 *
 * POR QUÉ NO SE ENVUELVE EL LISTENER DE hashchange
 *   app.js hizo window.addEventListener('hashchange', render) con la
 *   referencia ORIGINAL. Por eso se envuelve go() (que es quien cambia el
 *   hash) y se espera al repintado de #app dentro de la transición; y para el
 *   botón atrás del teléfono se usa popstate, que dispara ANTES que
 *   hashchange, o sea antes de que la vista nueva esté pintada.
 *
 * NOTAS HONESTAS
 *   · No toca index.html, app.js ni style.css. Se quita borrando dos líneas.
 *   · Los pocos sitios donde app.js escribe location.hash a pelo (arranque
 *     tras el splash) no llevan animación: no son navegación del usuario.
 *   · Con "reducir movimiento" activado no se anima nada.
 *   · Mientras la capa 12 tiene el escudo puesto (servidor en vuelo) ningún
 *     toque llega hasta aquí: es lo correcto, no se anima nada a medias.
 * ========================================================================== */
(function () {
  'use strict';

  /* ---- Lo único que cambia de una app a otra ---------------------------- */
  var CFG = {
    ORIGENES: ".ev-row, .ev-card",
    ATRAS:    "#rg-back, #cf-cancel",
    TX:       "na-tx",
    ZOOM:     false
  };

  if (window.__jvt13) return;               // no instalar dos veces
  window.__jvt13 = true;

  var raiz = document.documentElement;
  var app  = document.getElementById('app');
  if (!app) return;
  if (typeof document.startViewTransition !== 'function') return;   // manda la capa 4

  /* ---- 1 · La capa 4 cede el mando (solo se apaga su CSS) --------------- */
  try {
    var css4 = document.querySelector('link[href*="capa-4-transicion"]');
    if (css4) css4.disabled = true;
  } catch (e) {}
  if (CFG.TX) raiz.classList.add(CFG.TX);   // la capa 1 no anima la entrada de vista
  raiz.classList.add('jvt');

  var HEROE   = 'jvt-heroe';
  var FOTO    = 'jvt-foto';
  var VENTANA = 3000;                        // vida del "origen" tocado, en ms
  var enCurso = false;

  function reduce() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function libre() { return !enCurso && !reduce(); }

  function marca(el, n)  { try { if (el && el.style) el.style.viewTransitionName = n; } catch (e) {} }
  function limpia(el)    { try { if (el && el.style) el.style.viewTransitionName = ''; } catch (e) {} }
  function hoja()        { return document.querySelector('#layer .sheet'); }

  /* ---- 2 · Lo último que tocó el dedo ----------------------------------- */
  var origen = null, origenHasta = 0, fotoTocada = null, atrasHasta = 0;

  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (CFG.ATRAS && t.closest(CFG.ATRAS)) atrasHasta = Date.now() + 1500;
    var o = CFG.ORIGENES ? t.closest(CFG.ORIGENES) : null;
    if (o) { origen = o; origenHasta = Date.now() + VENTANA; }
    if (CFG.ZOOM) {
      var av = t.closest('[data-act="foto"], .rc-av, .det-foto');
      fotoTocada = av ? av.querySelector('img') : null;
    }
  }, true);

  function origenVivo() {
    if (!origen || Date.now() > origenHasta) return null;
    if (!origen.isConnected || !app.contains(origen)) return null;
    return origen;
  }

  /* ---- 3 · Arranque genérico de una transición -------------------------- */
  function transicion(clase, cambio, alTerminar) {
    if (!libre()) { cambio(); if (alTerminar) alTerminar(); return null; }
    enCurso = true;
    raiz.classList.add('jvt-anim', clase);
    var cerrar = function () {
      enCurso = false;
      raiz.classList.remove('jvt-anim', clase);
      if (alTerminar) alTerminar();
    };
    var vt;
    try { vt = document.startViewTransition(cambio); }
    catch (e) { cambio(); cerrar(); return null; }   // si falla, el cambio se hace igual
    try { vt.updateCallbackDone.then(null, function () {}); } catch (e) {}
    vt.finished.then(cerrar, cerrar);
    return vt;
  }

  /* ---- 4 · Navegación entre pantallas ----------------------------------- */
  var pila = [location.hash || ''];

  window.addEventListener('hashchange', function () {
    var h = location.hash || '';
    if (pila.length >= 2 && pila[pila.length - 2] === h) pila.pop();
    else { pila.push(h); if (pila.length > 30) pila.shift(); }
  });

  function esAtras() { var r = Date.now() <= atrasHasta; atrasHasta = 0; return r; }

  /* Espera a que #app repinte (el hashchange de app.js corre como tarea
     aparte). Red de seguridad a los 400 ms para no congelar nunca la pantalla. */
  function esperaRepintado() {
    return new Promise(function (res) {
      var fin = false, mo = null, t = 0;
      function ok() {
        if (fin) return; fin = true;
        clearTimeout(t);
        if (mo) try { mo.disconnect(); } catch (e) {}
        if (window.requestAnimationFrame) requestAnimationFrame(function () { res(); });
        else res();
      }
      t = setTimeout(ok, 400);
      try {
        mo = new MutationObserver(function () { if (!app.hidden) ok(); });
        mo.observe(app, { childList: true, subtree: false });
      } catch (e) { ok(); }
    });
  }

  var goOrig = window.go;
  if (typeof goOrig === 'function') {
    window.go = function (route) {
      var self = this, args = arguments;
      if (!libre() || ('#/' + route) === location.hash) return goOrig.apply(self, args);
      transicion(esAtras() ? 'jvt-back' : 'jvt-fwd', function () {
        goOrig.apply(self, args);
        return esperaRepintado();
      });
    };
  }

  /* Llamadas directas a render() (las hay en el arranque y en algún botón).
     El listener de hashchange guarda la referencia ORIGINAL, así que esto NO
     duplica la transición de go(). */
  var renderOrig = window.render;
  if (typeof renderOrig === 'function') {
    window.render = function () {
      var self = this, args = arguments;
      if (!libre()) return renderOrig.apply(self, args);
      transicion(esAtras() ? 'jvt-back' : 'jvt-fwd', function () { renderOrig.apply(self, args); });
    };
  }

  /* Atrás del teléfono / del navegador: popstate dispara ANTES que hashchange */
  window.addEventListener('popstate', function () {
    if (!libre()) return;
    var h = location.hash || '';
    var atras = (pila.length >= 2 && pila[pila.length - 2] === h);
    transicion(atras ? 'jvt-back' : 'jvt-fwd', function () { return esperaRepintado(); });
  });

  /* ---- 5 · ELEMENTO COMPARTIDO: tarjeta -> hoja de detalle --------------
     OJO: openSheet DEVUELVE la hoja y hay código de app.js que usa ese
     valor (const sh = openSheet(...)). Por eso NO se puede llamar dentro
     del callback de la transición, que corre después. Se llama de una,
     se guarda su valor, y la hoja recién creada se saca del DOM en el
     MISMO turno (nadie llega a verlo: no se pinta un solo cuadro) para
     que la foto de "lo viejo" sea la pantalla sin hoja. La transición
     vuelve a meterla, y eso es lo que el navegador anima.
     Quitar y volver a poner un nodo NO borra sus manejadores. */
  var openOrig = window.openSheet;
  if (typeof openOrig === 'function') {
    window.openSheet = function () {
      var self = this, args = arguments;
      var o = libre() ? origenVivo() : null;
      var ret = openOrig.apply(self, args);
      if (!o) return ret;                    // sin tarjeta tocada: como siempre
      var sh = hoja();
      if (!sh || !sh.parentNode) return ret;

      var scrim  = sh.previousElementSibling;          // .backdrop / .scrim
      var padre  = sh.parentNode, ref = sh.nextSibling;
      var sPadre = scrim ? scrim.parentNode : null, sRef = scrim ? scrim.nextSibling : null;
      var tapa   = document.body.classList.contains('sheet-open');
      try {
        padre.removeChild(sh);
        if (scrim && sPadre) sPadre.removeChild(scrim);
        if (tapa) document.body.classList.remove('sheet-open');
      } catch (e) { return ret; }

      sh.classList.add('jvt-sin-subida');    // la sube la transición, no la capa 1
      marca(o, HEROE);
      transicion('jvt-heroe', function () {
        /* Se repone primero la hoja y luego el velo DELANTE de ella: si se
           hiciera al revés, la referencia del velo apuntaría a una hoja que
           todavía no está puesta y el navegador se queja. */
        padre.insertBefore(sh, (ref && ref.parentNode === padre) ? ref : null);
        if (scrim && sPadre) sPadre.insertBefore(scrim, (sh.parentNode === sPadre) ? sh : null);
        if (tapa) document.body.classList.add('sheet-open');
        limpia(o);                           // el nombre no puede estar dos veces
        marca(sh, HEROE);
      }, function () { limpia(sh); limpia(o); });
      return ret;
    };
  }

  /* Cerrar: solo vuela de vuelta si la hoja vino de una tarjeta y esa
     tarjeta sigue en pantalla. closeLayer no devuelve nada, así que aquí
     sí vale envolverlo del modo normal. */
  var closeOrig = window.closeLayer;
  if (typeof closeOrig === 'function') {
    window.closeLayer = function () {
      var self = this, args = arguments;
      var sh = hoja();
      var destino = (libre() && sh && sh.classList.contains('jvt-sin-subida')) ? origenVivo() : null;
      if (!destino) return closeOrig.apply(self, args);
      marca(sh, HEROE);
      transicion('jvt-heroe', function () {
        closeOrig.apply(self, args);
        marca(destino, HEROE);
      }, function () { limpia(destino); });
    };
  }

})();
