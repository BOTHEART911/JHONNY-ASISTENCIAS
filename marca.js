/* ============================================================
   marca.js — JHONNY ASISTENCIA
   ------------------------------------------------------------
   ESTE ES EL ARCHIVO QUE SE EDITA AL REPLICAR LA CAMPAÑA.
   Todo lo que cambia de un candidato a otro vive aquí; el resto
   del código no se toca.

   Se carga ANTES que storage-ns.js y que la app (y el service
   worker lo trae con importScripts), así que no puede depender
   de nada: solo datos.
   ============================================================ */
(function (raiz) {
  'use strict';

  raiz.MARCA = {

    /* Prefijo de almacenamiento de ESTA campaña. Las apps de todas
       las campañas viven en el mismo origen (botheart911.github.io)
       y comparten localStorage y caché: sin un prefijo propio se
       pisan sesiones, PIN, token de notificaciones y caché.
       Corto, en minúsculas y único por campaña. Ej.: 'adri'. */
    STORAGE_NS: 'jp',

    /* URL del Web App del backend (JHONNY CORE, /exec). La MISMA
       para todas las apps de una campaña. */
    API_URL: 'https://script.google.com/macros/s/AKfycbw9CZ9ra6q1KI88M3U9IsYP861JOCFD4-xrV1b0UFYhL1amBjAqTTmtNXi42vwLI_h6Hw/exec',

    /* Ícono cuadrado (logo) y banner horizontal. Los usa la app en
       login, credencial, marca de agua y pie de página.
       OJO: el ícono TAMBIÉN está escrito a mano en index.html
       (favicon, apple-touch-icon y splash) y en manifest.json —
       eso hay que cambiarlo aparte, ver el checklist. */
    APP_ICON:   'https://res.cloudinary.com/dqqeavica/image/upload/v1753538807/JHONNY_PERDOMO_dn3dah.png',
    APP_BANNER: 'https://res.cloudinary.com/dqqeavica/image/upload/v1753538919/BANNER_JHONNY_e0yw7m.png'
  };

})(typeof self !== 'undefined' ? self : this);
