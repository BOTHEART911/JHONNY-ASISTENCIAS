/* ============================================================
 * CAPA 7 · ONDA AL TOCAR / RIPPLE  (JHONNY ASISTENCIA) — decorativa ligera
 *
 * QUÉ HACE
 *   Onda de tinta estilo Android, desde el punto exacto donde tocas, en
 *   botones, el combo de zona y sus opciones.
 *
 * CÓMO SE INSTALA  (una sola línea, al final del <body>, DESPUÉS de app.js)
 *   <script src="capa-7-ripple.js"></script>
 *
 * PAREJA
 *   capa-7-ripple.css
 *
 * NOTAS
 *   - Escucha pointerdown en captura y NO llama a preventDefault: ningún
 *     clic de la app cambia de comportamiento.
 *   - Salta los deshabilitados (p. ej. "Guardar y escanear" antes de
 *     elegir evento).
 *   - Solo pone position:relative si el elemento estaba en static, y solo
 *     añade overflow:hidden por CSS (clase .na-rip-host).
 *   - Red de seguridad: la onda se borra a los 700 ms aunque el navegador
 *     no dispare animationend.
 * ============================================================ */
(function () {
  'use strict';
  var SEL = '.btn, .combo-btn, .combo-item';

  var reduce = false;
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduce = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; });
  } catch (e) {}

  document.addEventListener('pointerdown', function (e) {
    if (reduce) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest(SEL);
    if (!el) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;

    var r;
    try { r = el.getBoundingClientRect(); } catch (err) { return; }
    if (!r || !r.width) return;

    try {
      var cs = window.getComputedStyle(el);
      if (cs && cs.position === 'static') el.style.position = 'relative';
    } catch (err) {}
    el.classList.add('na-rip-host');

    var x = (e.clientX == null ? r.left + r.width / 2 : e.clientX) - r.left;
    var y = (e.clientY == null ? r.top + r.height / 2 : e.clientY) - r.top;
    var d = Math.max(
      Math.hypot(x, y),
      Math.hypot(r.width - x, y),
      Math.hypot(x, r.height - y),
      Math.hypot(r.width - x, r.height - y)
    ) * 2;

    var o = document.createElement('span');
    o.className = 'na-rip';
    o.style.width = o.style.height = d + 'px';
    o.style.left = (x - d / 2) + 'px';
    o.style.top = (y - d / 2) + 'px';
    el.appendChild(o);

    var quitar = function () { if (o && o.parentNode) o.parentNode.removeChild(o); };
    o.addEventListener('animationend', quitar);
    setTimeout(quitar, 700);
  }, true);
})();
