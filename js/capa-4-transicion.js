/* ============================================================
 * CAPA 4 · TRANSICIÓN LATERAL ENTRE PANTALLAS  (JHONNY ASISTENCIA)
 * JS de la pareja — funcional/decorativa
 *
 * QUÉ HACE
 *   Estilo iOS: la pantalla nueva entra desde la derecha; cuando vas
 *   "atrás" (↩️ Atrás del registro, Cancelar de la configuración o el
 *   botón atrás del equipo) entra desde la izquierda.
 *
 * CÓMO SE INSTALA  (una sola línea, al final del <body>, DESPUÉS de app.js)
 *   <script src="capa-4-transicion.js"></script>
 *
 * PAREJA
 *   capa-4-transicion.css
 *
 * NOTAS IMPORTANTES
 *   - No se puede envolver render(): app.js registra la referencia
 *     ORIGINAL en 'hashchange', así que envolver window.render no
 *     intercepta nada. Detectamos el repintado observando los hijos
 *     directos de #app (todas las vistas se pintan con app.innerHTML).
 *   - La dirección "atrás" se detecta de dos formas: por el toque en los
 *     controles de retroceso reales de esta app (#rg-back, #cf-cancel) y
 *     por una pila propia de hashes (así el botón atrás del EQUIPO también
 *     entra por la izquierda).
 *   - OJO: NO se usa 'popstate'. El navegador lo dispara también cuando la
 *     app cambia el hash con go(), así que TODO parecería "atrás".
 *   - #sc-cfg ("Cambiar de evento") NO es atrás: avanza a la
 *     configuración, y de ahí Cancelar sí devuelve.
 *   - No toca la cámara: al cambiar de vista, app.js ya llama scanStop().
 *   - Si el sistema tiene "reducir movimiento", no anima nada.
 * ============================================================ */
(function () {
  'use strict';
  var app = document.getElementById('app');
  if (!app || !window.MutationObserver) return;

  var reduce = false;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduce = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; });
  } catch (e) {}

  document.documentElement.classList.add('na-tx');   // la capa 1 lee esto

  var ATRAS = '#rg-back, #cf-cancel';
  var VENTANA_MS = 1500;      // un toque en "atrás" manda durante este rato
  var atrasHasta = 0;

  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest(ATRAS)) atrasHasta = Date.now() + VENTANA_MS;
  }, true);

  /* Pila propia de hashes. No sirve escuchar 'hashchange' para decidir la
     dirección: app.js registró el suyo ANTES, así que la vista ya está
     pintada cuando nos tocaría el turno. Se mira aquí mismo, al animar. */
  var pila = [location.hash || ''];
  var hashPrevio = location.hash || '';

  function volviendo() {
    var h = location.hash || '';
    if (h === hashPrevio) return false;              // repintado sin navegar
    hashPrevio = h;
    var atras = pila.length > 1 && pila[pila.length - 2] === h;
    if (atras) pila.pop();
    else { pila.push(h); if (pila.length > 30) pila.shift(); }
    return atras;
  }

  var ultimo = 0, timer = null;

  function animar() {
    if (reduce) return;
    if (app.hidden) return;                          // aún con el splash: no hay nada que deslizar
    var ahora = Date.now();
    if (ahora - ultimo < 90) return;                 // antirrebote: un repintado = una animación
    ultimo = ahora;

    var porToque = ahora < atrasHasta;
    atrasHasta = 0;
    var back = volviendo() || porToque;

    var raiz = document.documentElement;
    app.classList.remove('na-in', 'na-back');
    raiz.classList.add('na-tx-anim');
    void app.offsetWidth;                            // reinicia la animación
    app.classList.add(back ? 'na-back' : 'na-in');

    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {                 // red de seguridad por si no llega animationend
      app.classList.remove('na-in', 'na-back');
      raiz.classList.remove('na-tx-anim');
      timer = null;
    }, 420);
  }

  app.addEventListener('animationend', function (e) {
    if (e.target !== app) return;
    app.classList.remove('na-in', 'na-back');
    document.documentElement.classList.remove('na-tx-anim');
    if (timer) { clearTimeout(timer); timer = null; }
  });

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.target === app && m.addedNodes && m.addedNodes.length) { animar(); return; }
    }
  }).observe(app, { childList: true });               // solo hijos DIRECTOS de #app
})();
