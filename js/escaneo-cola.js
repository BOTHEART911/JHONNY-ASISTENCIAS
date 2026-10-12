/* ============================================================================
 * escaneo-cola.js — COLA DEL ESCÁNER (12/10/2026 · Fase 3)
 * ----------------------------------------------------------------------------
 * Pieza IDÉNTICA en JHONNY-VOTACION y JHONNY-ASISTENCIAS. Se carga después de
 * red.js y antes de app.js. No toca el DOM: la app pinta con los avisos.
 *
 *  · Cada lectura entra a una cola GUARDADA en el teléfono (localStorage): si
 *    se cierra la app, se apaga el teléfono o se va la señal, nada se pierde.
 *  · Cada envío nace con su rid y lo conserva para siempre: un reintento manda
 *    EXACTAMENTE lo mismo con el mismo rid y el CORE responde lo de la primera
 *    vez sin volver a escribir (nunca un doble registro ni un falso "ya estaba").
 *  · Uno a uno: cada lectura viaja sola y al instante; la cámara NO espera la
 *    respuesta (se lee a la siguiente persona mientras tanto).
 *  · En bloque: las lecturas se juntan (12 o 600 ms) y viajan en UN viaje.
 *    Mientras una tanda está en vuelo, lo nuevo se sigue juntando y sale en
 *    la siguiente (hasta 40): con el servidor lento viajan menos y más llenas.
 *  · Uno a uno con fila acumulada (la red tardó): las lecturas que NUNCA se
 *    enviaron se agrupan en un solo viaje. Las que ya salieron una vez
 *    conservan su rid y viajan solas (así el reintento nunca da "ya estaba").
 *  · Sin señal: no se insiste a ciegas. Se espera el evento "online" y, como
 *    respaldo, reintentos espaciados (1, 2, 4, 8, 15 s) — solo de escrituras
 *    pendientes, nunca un reloj que pida datos.
 *  · Lo ya registrado en la jornada queda anotado por ID: volver a pasar la
 *    misma tarjeta en este equipo se responde al instante, sin viajar.
 *  · Medición de pantalla: ms y KB de cada envío, lectura→confirmación por
 *    persona, y tiempos de lectura de cámara (ESC.medidas()).
 * ============================================================================ */
(function (raiz) {
  'use strict';
  if (raiz.ESC) return;

  var LOTE_N = 12, LOTE_MS = 600, LOTE_MAX = 40, EN_VUELO_MAX = 2, T_ENVIO = 25000;
  var ESPERAS = [1000, 2000, 4000, 8000, 15000];
  var HECHOS_MAX = 4000;

  var C = null;                 // configuración de la app
  var cola = [];                // [{rid, tipo, ids[], doc, extra, t, n, prox, lect:{id:t}}]
  var bolsa = { ids: [], t: 0, lect: {} };   // lote en formación
  var hechos = {};              // id → {e, nom, sub, t}
  var enVuelo = {};             // rid → true
  var timerBolsa = null, timerReintento = null;
  var med = { envios: [], decod: [], confirm: [] };
  var sinSenal = false;

  function ns(k) { return (typeof raiz.nsKey === 'function') ? raiz.nsKey(k) : 'jp:' + k; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function kCola() { return ns('esc_cola_' + C.app); }
  function kHechos() { return ns('esc_hechos_' + C.app + '_' + (C.jornada ? C.jornada() : '') + '_' + hoy()); }
  function rid() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function leerLS(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function ponerLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function guardar() { ponerLS(kCola(), { cola: cola, bolsa: bolsa }); }
  function avisar(tipo, d) { try { C.alEstado && C.alEstado(tipo, d || {}); } catch (e) {} }

  function cargar() {
    var g = leerLS(kCola(), null) || {};
    cola = Array.isArray(g.cola) ? g.cola : [];
    bolsa = g.bolsa && Array.isArray(g.bolsa.ids) ? g.bolsa : { ids: [], t: 0, lect: {} };
    if (!bolsa.lect) bolsa.lect = {};
    cola.forEach(function (it) { it.prox = 0; });   // lo que quedó de antes sale ya
    hechos = leerLS(kHechos(), {}) || {};
    /* Limpia jornadas viejas de este app (otro día u otro evento) */
    try {
      var pre = ns('esc_hechos_' + C.app + '_');
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(pre) === 0 && k !== kHechos()) localStorage.removeItem(k); });
    } catch (e) {}
  }

  function anotarHecho(id, e, nom, sub) {
    hechos[id] = { e: e, nom: nom || '', sub: sub || '', t: Date.now() };
    var ks = Object.keys(hechos);
    if (ks.length > HECHOS_MAX) { ks.sort(function (a, b) { return hechos[a].t - hechos[b].t; }).slice(0, ks.length - HECHOS_MAX).forEach(function (k) { delete hechos[k]; }); }
    ponerLS(kHechos(), hechos);
  }

  function enCola(id) {
    if (bolsa.ids.indexOf(id) >= 0) return true;
    for (var i = 0; i < cola.length; i++) if (cola[i].ids.indexOf(id) >= 0) return true;
    return false;
  }

  function pendientes() {
    var n = bolsa.ids.length;
    cola.forEach(function (it) { n += it.ids.length || 1; });
    return n;
  }

  /* ---------------- entrada de lecturas ---------------- */

  /* Uno a uno: devuelve {estado:'nuevo'|'enCola'|'hecho', hecho} */
  function leer(id) {
    if (hechos[id] && hechos[id].e !== 'malo') return { estado: 'hecho', hecho: hechos[id] };
    if (enCola(id)) return { estado: 'enCola' };
    var lect = {}; lect[id] = Date.now();
    cola.push({ rid: rid(), tipo: 'uno', ids: [id], extra: C.extra ? C.extra() : {}, t: Date.now(), n: 0, prox: 0, lect: lect });
    guardar(); avisar('cola', { pendientes: pendientes() });
    bombear();
    return { estado: 'nuevo' };
  }

  /* Registro por documento (botón de ayuda): siempre viaja solo */
  function documento(doc) {
    cola.push({ rid: rid(), tipo: 'uno', ids: [], doc: String(doc), extra: C.extra ? C.extra() : {}, t: Date.now(), n: 0, prox: 0, lect: {} });
    guardar(); avisar('cola', { pendientes: pendientes() });
    bombear();
  }

  /* En bloque: se junta y sale en tanda */
  function leerLote(id) {
    if (hechos[id] && hechos[id].e !== 'malo') return { estado: 'hecho', hecho: hechos[id] };
    if (enCola(id)) return { estado: 'enCola' };
    if (!bolsa.ids.length) bolsa.t = Date.now();
    bolsa.ids.push(id); bolsa.lect[id] = Date.now();
    guardar(); avisar('cola', { pendientes: pendientes() });
    if (bolsa.ids.length >= LOTE_N && !loteOcupado()) sellar();
    else if (!timerBolsa) timerBolsa = setTimeout(function () { timerBolsa = null; sellar(); }, LOTE_MS);
    return { estado: 'nuevo' };
  }

  function loteOcupado() {
    for (var i = 0; i < cola.length; i++) if (cola[i].tipo === 'lote' && (enVuelo[cola[i].rid] || cola[i].n === 0)) return true;
    return false;
  }

  function sellar(forzar) {
    if (timerBolsa) { clearTimeout(timerBolsa); timerBolsa = null; }
    if (!forzar && loteOcupado() && bolsa.ids.length < LOTE_MAX) return;   // se sigue juntando
    while (bolsa.ids.length) {
      var ids = bolsa.ids.splice(0, LOTE_MAX), lect = {};
      ids.forEach(function (id) { lect[id] = bolsa.lect[id]; delete bolsa.lect[id]; });
      cola.push({ rid: rid(), tipo: 'lote', ids: ids, extra: C.extra ? C.extra() : {}, t: Date.now(), n: 0, prox: 0, lect: lect });
    }
    guardar();
    bombear();
  }

  /* ---------------- envío ---------------- */

  function online() { return !('onLine' in navigator) || navigator.onLine; }

  /* Uno a uno con fila acumulada: las lecturas por QR que NUNCA salieron se
     juntan en un solo viaje (rid nuevo; ninguna llegó nunca al servidor). */
  function agrupar() {
    var libres = cola.filter(function (it) { return it.tipo === 'uno' && !it.doc && it.n === 0 && !enVuelo[it.rid]; });
    if (libres.length < 2) return;
    var ids = [], lect = {};
    libres.slice(0, LOTE_MAX).forEach(function (it) { ids.push(it.ids[0]); lect[it.ids[0]] = it.lect[it.ids[0]]; cola.splice(cola.indexOf(it), 1); });
    cola.push({ rid: rid(), tipo: 'lote', deUno: true, ids: ids, extra: libres[0].extra, t: Date.now(), n: 0, prox: 0, lect: lect });
    guardar();
  }

  function bombear() {
    if (!C) return;
    if (!online()) { marcarSenal(true); programar(); return; }
    if (bolsa.ids.length && !loteOcupado()) sellar(true);
    var ahora = Date.now(), n = Object.keys(enVuelo).length;
    if (n >= 1) agrupar();
    for (var i = 0; i < cola.length && n < EN_VUELO_MAX; i++) {
      var it = cola[i];
      if (enVuelo[it.rid] || it.prox > ahora) continue;
      enVuelo[it.rid] = true; n++;
      enviar(it);
    }
    programar();
  }

  /* Un solo temporizador: el próximo reintento pendiente (si hay) */
  function programar() {
    if (timerReintento) { clearTimeout(timerReintento); timerReintento = null; }
    var prox = Infinity, ahora = Date.now();
    cola.forEach(function (it) { if (!enVuelo[it.rid] && it.prox > ahora) prox = Math.min(prox, it.prox); });
    if (!online()) prox = Math.min(prox, ahora + 15000);
    if (prox !== Infinity) timerReintento = setTimeout(bombear, Math.max(50, prox - ahora));
  }

  function marcarSenal(sin) {
    if (sinSenal === sin) return;
    sinSenal = sin;
    avisar('senal', { sinSenal: sin, pendientes: pendientes() });
  }

  function quitar(it) {
    var i = cola.indexOf(it);
    if (i >= 0) cola.splice(i, 1);
    delete enVuelo[it.rid];
    guardar();
  }

  function esReintentable(e, json) {
    if (e) return !!(e.red || e.eco || e.tiempo);
    var msg = String((json && (json.error || json.msg)) || '');
    return /EN_CURSO|ocupado|Service invoked too many|Límite|exceeded/i.test(msg);
  }

  function enviar(it) {
    var t0 = performance.now();
    var params, accion;
    if (it.tipo === 'lote') { accion = C.accionLote; params = Object.assign({ ids: it.ids.join(',') }, it.extra); }
    else { accion = C.accionUno; params = Object.assign(it.doc ? { documento: it.doc } : { id: it.ids[0] }, it.extra); }
    it.n++;
    RED.pedir(C.api, accion, params, { rid: it.rid, reintentos: 0, tiempo: T_ENVIO })
      .then(function (json) {
        var ms = Math.round(performance.now() - t0);
        med.envios.push({ a: accion, ms: ms, kb: json.__kb ? Math.round(json.__kb * 10) / 10 : null, ids: it.ids.length || 1, intento: it.n, t: Date.now() });
        if (med.envios.length > 300) med.envios.shift();
        if (!json.ok) {
          if (esReintentable(null, json)) return fallo(it);
          quitar(it);
          avisar('resultado', { item: it, error: json.error || json.msg || 'Error del servidor' });
          return;
        }
        marcarSenal(false);
        quitar(it);
        var d = json.data || {};
        var res = C.interpretar(it, d);      // [{id, e, nom, sub, extra}]
        var ahora = Date.now();
        (res || []).forEach(function (r) {
          if (r.reencolar) return;
          if (r.id && r.e && r.e !== 'cerrado') anotarHecho(r.id, r.e, r.nom, r.sub);
          if (r.id && it.lect && it.lect[r.id]) { med.confirm.push(ahora - it.lect[r.id]); if (med.confirm.length > 500) med.confirm.shift(); }
        });
        /* Lo que el CORE no alcanzó a procesar (sobra) vuelve a la cola con un rid NUEVO:
           esos IDs nunca se procesaron, así que no hay nada que repetir. */
        var otra = (res || []).filter(function (r) { return r.reencolar; }).map(function (r) { return r.id; });
        if (otra.length) {
          var lect = {}; otra.forEach(function (id) { lect[id] = (it.lect || {})[id] || ahora; });
          cola.push({ rid: rid(), tipo: 'lote', ids: otra, extra: it.extra, t: ahora, n: 0, prox: 0, lect: lect });
          guardar();
        }
        avisar('resultado', { item: it, data: d, res: res, total: d.total });
        avisar('cola', { pendientes: pendientes() });
      }, function (e) {
        if (e && e.cortado) { delete enVuelo[it.rid]; return; }
        if (esReintentable(e)) return fallo(it, e);
        /* Error que no es de red (respuesta rota sin eco): se reintenta igual con el
           mismo rid — el CORE devuelve lo de la primera vez si ya escribió. */
        return fallo(it, e);
      })
      .then(function () { bombear(); });
  }

  function fallo(it, e) {
    delete enVuelo[it.rid];
    it.prox = Date.now() + ESPERAS[Math.min(it.n - 1, ESPERAS.length - 1)];
    guardar();
    if (e && (e.red || e.tiempo || !online())) marcarSenal(true);
    avisar('reintento', { item: it, pendientes: pendientes(), sinSenal: sinSenal });
  }

  /* ---------------- arranque ---------------- */
  function iniciar(cfg) {
    C = cfg;
    cargar();
    raiz.addEventListener('online', function () { marcarSenal(false); cola.forEach(function (it) { it.prox = 0; }); bombear(); });
    raiz.addEventListener('offline', function () { marcarSenal(true); });
    if (bolsa.ids.length) sellar();
    if (cola.length) { avisar('cola', { pendientes: pendientes(), recuperadas: pendientes() }); bombear(); }
  }

  /* Cambio de jornada (otro evento en ASISTENCIAS): lo hecho se lee del nuevo */
  function recargarJornada() { hechos = leerLS(kHechos(), {}) || {}; }

  function q(arr, p) { if (!arr.length) return null; var s = arr.slice().sort(function (a, b) { return a - b; }); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]); }

  raiz.ESC = {
    iniciar: iniciar,
    leer: leer,
    leerLote: leerLote,
    documento: documento,
    sellar: sellar,
    pendientes: pendientes,
    hecho: function (id) { return hechos[id] || null; },
    anotar: anotarHecho,
    totalHechos: function (e) { var n = 0; Object.keys(hechos).forEach(function (k) { if (!e || hechos[k].e === e) n++; }); return n; },
    sinSenal: function () { return sinSenal; },
    recargarJornada: recargarJornada,
    decodMs: function (ms) { med.decod.push(ms); if (med.decod.length > 600) med.decod.shift(); },
    medidas: function () {
      var env = med.envios.map(function (x) { return x.ms; });
      return {
        envios: med.envios.length, envioP50: q(env, .5), envioP95: q(env, .95),
        kbMax: med.envios.reduce(function (m, x) { return Math.max(m, x.kb || 0); }, 0),
        reintentos: med.envios.filter(function (x) { return x.intento > 1; }).length,
        leerAConfirmarP50: q(med.confirm, .5), leerAConfirmarP95: q(med.confirm, .95),
        decodP50: q(med.decod, .5), decodP95: q(med.decod, .95),
        detalle: med.envios.slice(-30)
      };
    }
  };
})(typeof self !== 'undefined' ? self : this);
