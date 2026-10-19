/* Service worker do app do tablet (PWA):
   - guarda o programa no aparelho, para abrir SEM internet;
   - entrega os arquivos das matérias (PDFs, fotos) que estão no IndexedDB,
     nos endereços ../materias/<id>/<caminho> que as telas já usam.
   __VERSAO__ e __ARQUIVOS__ são preenchidos por scripts/montar-web.js. */
'use strict';
const VERSAO = "1.0.8-mvfce1ch";
const ARQUIVOS = ["./icones/icone-192.png","./icones/icone-512.png","./index.html","./manifest.webmanifest","./node_modules/@fontsource/archivo/files/archivo-latin-500-normal.woff2","./node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2","./node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff2","./node_modules/@fontsource/archivo/files/archivo-latin-800-normal.woff2","./node_modules/@fontsource/archivo/latin-500.css","./node_modules/@fontsource/archivo/latin-600.css","./node_modules/@fontsource/archivo/latin-700.css","./node_modules/@fontsource/archivo/latin-800.css","./node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2","./node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2","./node_modules/@fontsource/jetbrains-mono/latin-400.css","./node_modules/@fontsource/jetbrains-mono/latin-600.css","./node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-italic.woff2","./node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2","./node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff2","./node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-700-normal.woff2","./node_modules/@fontsource/source-sans-3/latin-400-italic.css","./node_modules/@fontsource/source-sans-3/latin-400.css","./node_modules/@fontsource/source-sans-3/latin-600.css","./node_modules/@fontsource/source-sans-3/latin-700.css","./node_modules/pdfjs-dist/build/pdf.min.js","./node_modules/pdfjs-dist/build/pdf.worker.min.js","./src/app.js","./src/assistente.js","./src/boasvindas.js","./src/compartilhar.js","./src/estilo.css","./src/foco.js","./src/fontes.css","./src/impressao.js","./src/imprimir-pdf.html","./src/imprimir-pdf.js","./src/index.html","./src/mapa-svg.js","./src/mascote.js","./src/materia.js","./src/notas.js","./src/perfis.js","./src/relogio.js","./src/render-pdf.html","./src/resumo.js","./src/util.js","./vendor/jszip.min.js","./web/api-web.js","./web/assercao-razao.js","./web/gerado.js","./web/gerador-web.js","./web/nucleo-geracao.js"];
const CACHE = 'plataforma-estudo-' + VERSAO;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('plataforma-estudo-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function abrirDb() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open('plataforma-estudo', 1);
    r.onupgradeneeded = () => ['kv', 'materias', 'progresso', 'arquivos'].forEach((l) => { if (!r.result.objectStoreNames.contains(l)) r.result.createObjectStore(l); });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
function arquivoDaMateria(chave) {
  return abrirDb().then((db) => new Promise((ok, falha) => {
    const g = db.transaction('arquivos', 'readonly').objectStore('arquivos').get(chave);
    /* guardado como bytes ({tipo, dados}) ou, nos antigos, como Blob */
    g.onsuccess = () => { const v = g.result; ok(!v ? null : v.dados instanceof ArrayBuffer ? new Blob([v.dados], { type: v.tipo || '' }) : v); };
    g.onerror = () => falha(g.error);
  }));
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin || ev.request.method !== 'GET') return;
  const escopo = new URL(self.registration.scope).pathname;
  const rel = url.pathname.startsWith(escopo) ? url.pathname.slice(escopo.length) : '';
  /* materias/<id>/<caminho>: arquivo guardado no aparelho */
  if (rel.startsWith('materias/')) {
    const chave = decodeURIComponent(rel.slice('materias/'.length));
    ev.respondWith(arquivoDaMateria(chave).then((b) => b ? new Response(b, { headers: { 'content-type': b.type || 'application/octet-stream' } }) : new Response('não encontrado', { status: 404 })));
    return;
  }
  /* o programa: do aparelho primeiro (abre sem internet); a versão nova chega pela troca do service worker */
  ev.respondWith(caches.match(ev.request, { ignoreSearch: true }).then((r) => r || fetch(ev.request)));
});
