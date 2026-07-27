/* Service Worker — Jhonny Perdomo · Registro de Asistencia
   Estrategia network-first (última versión con red) + shell de respaldo.
   Las actualizaciones las dispara version.js (limpia caches y recarga). */
/* FASE 0 · el nombre de la caché lleva el prefijo de campaña (storage-ns.js).
   Si storage-ns.js no carga, cae al prefijo 'jp' de la campaña original. */
try { importScripts('./storage-ns.js'); } catch (e) {}
const NS_SW = (self.STORAGE_NS || 'jp');
const CACHE_PREFIJO = NS_SW + '-asis-';
const JP_CACHE = CACHE_PREFIJO + 'v1';

const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(JP_CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf(CACHE_PREFIJO) === 0 && k !== JP_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // El backend y los recursos externos van SIEMPRE a la red. jsdelivr (jsQR) sí
  // se cachea: es lo que permite que el escáner arranque aunque el puesto de
  // votación tenga la red flojita.
  if (/script\.google\.com|qrserver\.com|googleapis\.com|cloudinary\.com|gstatic\.com|firebaseio\.com/.test(req.url)) return;
  e.respondWith(fetch(req).then((resp) => { const copy = resp.clone(); caches.open(JP_CACHE).then((c) => c.put(req, copy)).catch(() => {}); return resp; }).catch(() => caches.open(JP_CACHE).then((c) => c.match(req).then((r) => r || c.match('./index.html')))));
});
