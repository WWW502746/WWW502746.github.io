const STATE = 'beijian-preload-state';
const STATE_URL = new URL('/__beijian_ready__', self.location.origin).href;
let activeCache;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function currentCache() {
  if (activeCache) return activeCache;
  const state = await (await caches.open(STATE)).match(STATE_URL);
  return state ? activeCache = await state.text() : null;
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'beijian-use-cache' || !/^beijian-ready-[a-f\d]+$/.test(event.data.name)) return;
  event.waitUntil((async () => {
    activeCache = event.data.name;
    await (await caches.open(STATE)).put(STATE_URL, new Response(activeCache));
    event.ports[0]?.postMessage({ready: true});
  })());
});
async function cachedResponse(request) {
  const name = await currentCache();
  if (!name) return null;
  const cache = await caches.open(name), url = new URL(request.url);
  let response = await cache.match(request.url);
  if (!response && request.mode === 'navigate' && url.pathname.endsWith('/')) response = await cache.match(url.origin + url.pathname + 'index.html');
  if (!response && !['script', 'style', 'worker'].includes(request.destination)) response = await cache.match(url.origin + url.pathname);
  if (!response) return null;
  const range = request.headers.get('Range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  const blob = await response.blob(), length = blob.size;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), length - 1) : length - 1) : length - 1;
  if (start >= length || start > end) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${length}`}});
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(blob.slice(start, end + 1), {status: 206, headers});
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('X-Beijian-Preload') || /\/(?:preload-manifest\.json|preload-worker\.js)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    if (request.mode === 'navigate' && request.destination !== 'iframe') {
      try { return await fetch(request); }
      catch (error) { const cached = await cachedResponse(request); if (cached) return cached; throw error; }
    }
    return await cachedResponse(request) || fetch(request);
  })());
});
