/* ============================================================
 * CAPA 2 · VIBRACIÓN / HÁPTICA  (JHONNY ASISTENCIA) — funcional
 *
 * QUÉ HACE
 *   Un toque corto de vibración al pulsar botones, el combo de zona, sus
 *   opciones y el check del líder. Y una vibración según el resultado de
 *   los avisos flotantes (toast): éxito, error o aviso normal.
 *
 * CÓMO SE INSTALA  (una sola línea, al final del <body>, DESPUÉS de app.js)
 *   <script src="capa-2-haptica.js"></script>
 *
 * PAREJA
 *   Ninguna. Se lleva bien con capa-3 (sonido): el sonido y la vibración
 *   del escaneo salen a la vez.
 *
 * NOTAS IMPORTANTES
 *   - iOS (iPhone/iPad) NO permite vibrar desde la web: allí esta capa
 *     simplemente no hace nada. No es un fallo, es del sistema.
 *   - La app YA vibra en cada lectura del QR (procesarLectura). Esta capa
 *     NO toca eso para no vibrar dos veces: solo añade el toque de los
 *     botones y el de los toast, que hoy no vibran.
 *   - Se engancha por captura en pointerdown: no cancela ningún clic ni
 *     interfiere con los manejadores de la app.
 * ============================================================ */
(function () {
  'use strict';
  if (!('vibrate' in navigator)) return;              // iOS y escritorio: fuera

  var reduce = false;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduce = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; });
  } catch (e) {}

  var TOCABLES = '.btn, .combo-btn, .combo-item, .chk, .select, .scrim';
  var ultimo = 0;

  function pulso(patron, forzar) {
    if (reduce) return;
    var ahora = Date.now();
    // Dos toques pegados = una sola vibración. Los avisos (toast) no pasan
    // por aquí: un toque puede desembocar en un toast a los pocos ms y el
    // aviso es lo que de verdad importa que se sienta.
    if (!forzar && ahora - ultimo < 40) return;
    ultimo = ahora;
    try { navigator.vibrate(patron); } catch (e) {}
  }

  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest(TOCABLES);
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    pulso(10);
  }, true);

  /* Los toast de la app no vibran hoy. Envolvemos la función global. */
  if (typeof window.toast === 'function' && !window.toast.__naHap) {
    var origToast = window.toast;
    var envuelto = function (msg, kind) {
      try {
        if (kind === 'err') pulso([90, 50, 90], true);
        else if (kind === 'ok') pulso(45, true);
        else pulso(25, true);
      } catch (e) {}
      return origToast.apply(this, arguments);
    };
    envuelto.__naHap = true;
    window.toast = envuelto;
  }
})();
