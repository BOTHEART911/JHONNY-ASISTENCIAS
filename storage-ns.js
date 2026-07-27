/* ============================================================
   storage-ns.js — AISLAMIENTO DE ALMACENAMIENTO POR CAMPAÑA
   ------------------------------------------------------------
   Las 7 apps se sirven del MISMO origen (botheart911.github.io),
   así que comparten localStorage, sessionStorage y Cache Storage.
   Sin un prefijo propio, dos campañas se pisan sesiones, PIN,
   token de notificaciones y caché.

   AL REPLICAR LA CAMPAÑA: cambiar STORAGE_NS (una sola línea) por
   algo corto y único, p. ej. 'adri'. Nada más de este archivo.

   Migración silenciosa: la primera vez que arranca con un prefijo
   nuevo, copia el valor de la clave vieja a la nueva. Nadie se
   desloguea. La clave vieja NO se borra (permite volver atrás).
   ============================================================ */
(function (raiz) {
  'use strict';

  var STORAGE_NS = 'jp';          /* <<<<<< CAMBIAR AL REPLICAR */
  var CACHE_SLUG = 'asis';        /* identifica esta app dentro de la campaña */

  /* claves que ya existían en dispositivos de usuarios reales */
  var HEREDADAS_LOCAL  = ['jpAsisEvento'];
  var HEREDADAS_SESION = ['continuedWeb'];

  raiz.STORAGE_NS  = STORAGE_NS;
  raiz.CACHE_SLUG  = CACHE_SLUG;

  /* clave con prefijo de campaña */
  function nsKey(base) { return STORAGE_NS + ':' + base; }
  raiz.nsKey = nsKey;

  /* nombre de caché de ESTA app: <ns>-<slug>-<version> */
  raiz.nsCachePrefijo = function () { return STORAGE_NS + '-' + CACHE_SLUG + '-'; };
  raiz.nsCache = function (v) { return STORAGE_NS + '-' + CACHE_SLUG + '-' + (v || 'v1'); };

  /* ¿es una caché de esta app? (para no borrar la de las apps hermanas) */
  raiz.nsCacheMia = function (nombre) {
    return typeof nombre === 'string' && nombre.indexOf(raiz.nsCachePrefijo()) === 0;
  };

  function migrar(store, bases) {
    if (!store) return;
    for (var i = 0; i < bases.length; i++) {
      var b = bases[i];
      try {
        if (store.getItem(nsKey(b)) === null) {
          var v = store.getItem(b);
          if (v !== null) store.setItem(nsKey(b), v);
        }
      } catch (e) { /* storage lleno o bloqueado: se sigue */ }
    }
  }

  /* solo en la página; en el service worker no hay localStorage */
  if (typeof window !== 'undefined' && raiz === window) {
    try { migrar(window.localStorage,   HEREDADAS_LOCAL);  } catch (e) {}
    try { migrar(window.sessionStorage, HEREDADAS_SESION); } catch (e) {}
  }
})(typeof self !== 'undefined' ? self : this);
