/* ============================================================================
 * CAPA 12 · ANTI DOBLE CLIC  (app ASISTENCIAS · escáner de kiosco)   ·   31/07/2026
 * ----------------------------------------------------------------------------
 * Misma capa que ya está publicada en la app pública. Aquí va ajustada a este
 * repo: el escaneo NO se ve afectado (sus llamadas van en silencio) y el sonido de la capa 3
 *          se sigue despertando con el primer toque.
 *
 * QUÉ HACE  (dos protecciones que trabajan juntas)
 *
 *   1) CANDADO DEL CONTROL
 *      El control que tocaste queda bloqueado mientras SU procedimiento corre
 *      y se suelta solo al terminar, bien o mal.
 *
 *   2) ESCUDO DE PANTALLA
 *      Mientras la app esté hablando con el servidor, NINGÚN toque de la
 *      pantalla ejecuta nada: ni el mismo botón, ni Atrás, ni una tarjeta de
 *      la lista. Se traga el toque completo (tampoco sale la onda del ripple).
 *      El scroll SÍ sigue vivo: la pantalla no se queda tiesa, solo sorda.
 *      Se suelta solo en cuanto el servidor contesta.
 *
 * ADEMÁS
 *   Arregla la sensación de "sí se puede tocar": los botones que están
 *   guardando pierden el hover, el encogido al pulsar y el cursor de mano, y
 *   pasan a cursor de espera.
 *
 * NO BLOQUEA LO QUE NO HACE FALTA
 *   · Las llamadas EN SILENCIO (opts.silencio / opts.silent) no cuentan como
 *     carga: nunca dejan la pantalla sorda por su cuenta.
 *   · Las acciones puramente visuales (chips, cerrar una hoja, mostrar la
 *     contraseña) no se bloquean ni se retrasan.
 *   · Mientras una hoja de confirmación espera tu respuesta NO hay escudo: el
 *     escudo solo existe mientras hay servidor en vuelo.
 *
 * INSTALACIÓN (una sola línea, ANTES de app.js)
 *   <script src="capa-12-antidoble.js"></script>
 *
 * SEGURO
 *   Si una llamada se colgara, el escudo se levanta solo a los 20 s y ningún
 *   control queda muerto más de ese tiempo. La app nunca queda trabada.
 * ========================================================================== */
(function () {
  'use strict';

  if (window.__nt12AntiDoble) return;
  window.__nt12AntiDoble = true;

  var DIM_MS  = 260;    // a partir de aquí se NOTA ocupado (antes ni se ve)
  var MAX_MS  = 20000;  // seguro: nada queda bloqueado más de esto
  var POLL_MS = 40;     // cada cuánto se mira si el backend ya contestó
  var TICK_MS = 120;    // latido del escudo

  /* ---------------------------------------------------------------------
     ESTILOS (los mete la propia capa; no toca style.css)
     --------------------------------------------------------------------- */
  try {
    var ESPERA = ['.btn', 'button', '.res', '.cam-off', '.combo-btn', '.combo-item', '.combo-fil', '.chk', '.ev-row', '.ev-chip'];
    var reglas = '';
    for (var s = 0; s < ESPERA.length; s++) {
      reglas += 'body.nt12-esperando ' + ESPERA[s] + '{cursor:progress!important;}';
    }
    var st = document.createElement('style');
    st.textContent =
      '[data-busy="1"]{opacity:.62;}' +
      '[data-busy="1"],.btn:disabled,.btn[disabled],button:disabled{cursor:progress!important;}' +
      '.btn:disabled:hover,.btn[disabled]:hover,[data-busy="1"]:hover{filter:none;}' +
      '.btn:disabled:active,.btn[disabled]:active,[data-busy="1"]:active{transform:none!important;}' +
      reglas +
      'body.nt12-esperando .btn:active,body.nt12-esperando button:active{transform:none!important;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  /* ---------------------------------------------------------------------
     ¿Hay servidor en vuelo?
     `_apiActivas` lo lleva app.js (lo suben/bajan loaderOn y loaderOff).
     Se lee con red porque esta capa carga ANTES que app.js.
     --------------------------------------------------------------------- */
  function enVuelo() {
    try { return (typeof _apiActivas === 'number') ? _apiActivas : 0; } catch (e) { return 0; }
  }

  /* =====================================================================
     1) ESCUDO DE PANTALLA
     ===================================================================== */
  var t0 = 0;              // cuándo empezó la espera actual
  var esperando = false;   // ¿ya se está avisando por cursor?

  function escudoActivo() {
    if (enVuelo() <= 0) return false;
    if (t0 && (Date.now() - t0) > MAX_MS) return false;   // seguro anti-cuelgue
    return true;
  }

  function latido() {
    var hay = enVuelo() > 0;
    if (hay && !t0) t0 = Date.now();
    if (!hay) t0 = 0;

    var debe = escudoActivo() && (Date.now() - t0) > DIM_MS;
    if (debe !== esperando) {
      esperando = debe;
      try { document.body.classList[debe ? 'add' : 'remove']('nt12-esperando'); } catch (e) {}
    }
  }
  setInterval(latido, TICK_MS);

  /* Traga el toque mientras hay servidor en vuelo.
     · click / mousedown / mouseup / pointerup: se cancela del todo.
     · pointerdown / touchstart: SOLO se corta la propagación (no se llama a
       preventDefault) para no matar el scroll con el dedo. */
  function sordo(ev) {
    if (!escudoActivo()) return;
    /* El toque se traga, pero el desbloqueo del audio (capa 3) tiene que pasar
       igual: es el único gesto que despierta el sonido del escáner. */
    try { if (window.__na3Desbloquear) window.__na3Desbloquear(); } catch (e) {}
    try {
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (ev.type === 'click' || ev.type === 'mousedown' || ev.type === 'mouseup' || ev.type === 'pointerup') {
        ev.preventDefault();
      }
    } catch (e) {}
  }

  var EVENTOS = ['pointerdown', 'touchstart', 'mousedown', 'mouseup', 'pointerup', 'click'];
  for (var k = 0; k < EVENTOS.length; k++) {
    try { window.addEventListener(EVENTOS[k], sordo, { capture: true, passive: false }); }
    catch (e) { window.addEventListener(EVENTOS[k], sordo, true); }
  }

  /* =====================================================================
     2) CANDADO DEL CONTROL
     ===================================================================== */
  function marcar(el) {
    el.__nt12tDim = setTimeout(function () {
      if (el.__nt12busy) el.setAttribute('data-busy', '1');
    }, DIM_MS);
    el.__nt12tMax = setTimeout(function () { soltar(el); }, MAX_MS);
    try { el.setAttribute('aria-busy', 'true'); } catch (e) {}
  }

  function soltar(el) {
    if (!el.__nt12busy) return;
    el.__nt12busy = false;
    if (el.__nt12tDim)  { clearTimeout(el.__nt12tDim);   el.__nt12tDim  = null; }
    if (el.__nt12tMax)  { clearTimeout(el.__nt12tMax);   el.__nt12tMax  = null; }
    if (el.__nt12tPoll) { clearInterval(el.__nt12tPoll); el.__nt12tPoll = null; }
    try { el.removeAttribute('data-busy'); el.removeAttribute('aria-busy'); } catch (e) {}
  }

  /* Acción sin promesa que sí llamó al backend: se suelta cuando la red baja
     al nivel que había antes del toque. */
  function esperarRed(el, antes) {
    el.__nt12tPoll = setInterval(function () {
      if (enVuelo() <= antes) soltar(el);
    }, POLL_MS);
  }

  function envolver(fn) {
    if (typeof fn !== 'function') return fn;
    if (fn.__nt12wrap) return fn;

    function guardado(ev) {
      var el = this;

      /* Llamada por código (sin evento): comportamiento original, sin candado */
      if (!ev || typeof ev.preventDefault !== 'function') return fn.apply(el, arguments);

      /* Segundo toque mientras el primero corre: se traga */
      if (el.__nt12busy) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        return false;
      }

      el.__nt12busy = true;
      var antes = enVuelo();
      var r;
      try {
        r = fn.apply(el, arguments);
      } catch (err) {
        soltar(el);
        throw err;
      }

      /* Handler async: se suelta cuando su promesa termina, bien o mal */
      if (r && typeof r.then === 'function') {
        marcar(el);
        r.then(function () { soltar(el); }, function () { soltar(el); });
        return r;
      }

      /* Handler normal que disparó backend: se suelta cuando el backend contesta */
      if (enVuelo() > antes) {
        marcar(el);
        esperarRed(el, antes);
        return r;
      }

      /* Acción puramente visual: sin candado ni retardo */
      el.__nt12busy = false;
      return r;
    }

    guardado.__nt12wrap = true;
    guardado.__nt12raw  = fn;
    return guardado;
  }

  /* --- parche del asignador `onclick` -------------------------------------
     La app engancha sus acciones con `elemento.onclick = ...`
     (13 en app.js): quedan cubiertas de una. El combo de residencias usa
     addEventListener: ese lo cubre el escudo de pantalla. */
  var objetivos = [];
  if (window.HTMLElement) objetivos.push(HTMLElement.prototype);
  if (window.SVGElement)  objetivos.push(SVGElement.prototype);
  if (window.Element)     objetivos.push(Element.prototype);

  var puesto = 0;
  for (var i = 0; i < objetivos.length; i++) {
    var d = Object.getOwnPropertyDescriptor(objetivos[i], 'onclick');
    if (!d || typeof d.set !== 'function' || typeof d.get !== 'function') continue;
    (function (proto, nativo) {
      Object.defineProperty(proto, 'onclick', {
        configurable: true,
        enumerable: nativo.enumerable,
        get: function () { return nativo.get.call(this); },
        set: function (fn) { nativo.set.call(this, envolver(fn)); }
      });
    })(objetivos[i], d);
    puesto++;
    break; /* con el primero de la cadena basta: es el que ven los elementos */
  }

  /* Si el navegador no expone el descriptor, el candado no se pone y la app
     queda igual que hoy; el escudo de pantalla funciona de todos modos. */
  window.__nt12Puesto = !!puesto;
  window.__nt12 = { envolver: envolver, soltar: soltar, enVuelo: enVuelo, escudoActivo: escudoActivo, latido: latido };
})();
