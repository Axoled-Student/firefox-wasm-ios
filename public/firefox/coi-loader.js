(function () {
  if (!('serviceWorker' in navigator) || window.crossOriginIsolated) return;

  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./coi-serviceworker.js', { scope: './' })
    .then(function (registration) {
      if (!navigator.serviceWorker.controller) return registration.update();
    })
    .catch(function (error) {
      console.warn('[coi] Service Worker registration failed:', error);
    });
})();
