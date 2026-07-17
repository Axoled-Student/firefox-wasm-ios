var RUNTIME_CACHE = 'firefox-wasm-runtime-v1';
var RUNTIME_ASSETS = [
  '/gecko.wasm.zst',
  '/chrome-assets.tar.zst',
  '/chrome-assets.json',
  '/assets/index-BhJFTJAn.js',
  '/assets/index-CJZf4zMx.css',
  '/ios-bridge.js',
  '/ios-bridge.css',
  '/logo.webp'
];

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;

  event.respondWith(handleRequest(event));
});

function isRuntimeAsset(request) {
  if (request.method !== 'GET') return false;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  var scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
  var relativePath = url.pathname.slice(scopePath.length) || '/';
  return RUNTIME_ASSETS.indexOf(relativePath) !== -1;
}

async function handleRequest(event) {
  var request = event.request;
  var cacheState = 'BYPASS';
  var response;

  if (isRuntimeAsset(request)) {
    var cache = await caches.open(RUNTIME_CACHE);
    response = await cache.match(request, { ignoreSearch: true });
    if (response) {
      cacheState = 'HIT';
    } else {
      response = await fetch(request);
      cacheState = 'MISS';
      if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()));
      }
    }
  } else {
    response = await fetch(request);
  }

  return withIsolationHeaders(response, cacheState);
}

function withIsolationHeaders(response, cacheState) {
  if (response.status === 0) return response;
  var headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Firefox-WASM-Cache', cacheState);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}
