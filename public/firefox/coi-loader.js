(function () {
  'use strict';

  function loadFirefoxRuntime() {
    if (document.querySelector('script[data-firefox-runtime]')) return;
    var script = document.createElement('script');
    script.type = 'module';
    script.src = './assets/index-BhJFTJAn.js';
    script.dataset.firefoxRuntime = 'true';
    document.head.appendChild(script);
  }

  // The packaged iPad app serves the bundle from its loopback server with real
  // COOP/COEP headers, so it can start immediately without a service worker.
  if (window.crossOriginIsolated) {
    loadFirefoxRuntime();
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.error('[coi] Service workers are unavailable; Wasm threads cannot start.');
    loadFirefoxRuntime();
    return;
  }

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./coi-serviceworker.js', { scope: './' })
    .then(function (registration) {
      if (!navigator.serviceWorker.controller) return registration.update();
      if (window.crossOriginIsolated) loadFirefoxRuntime();
    })
    .catch(function (error) {
      console.warn('[coi] Service Worker registration failed:', error);
      loadFirefoxRuntime();
    });
})();
