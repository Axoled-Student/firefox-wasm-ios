(function () {
  'use strict';

  var canvas;
  var input;
  var composing = false;
  var touchScroll = null;
  var momentumFrame = 0;
  var ignoreNextDeleteBeforeInput = false;
  var deleteGuardTimer = 0;

  function notifyNative(type, payload) {
    try {
      window.webkit.messageHandlers.firefoxStatus.postMessage({ type: type, payload: payload || null });
    } catch {}
  }

  function dispatchKey(key, options) {
    if (!canvas) canvas = document.getElementById('screen');
    if (!canvas) return;
    options = options || {};
    var fallbackCode = key.length === 1 ? key.codePointAt(0) : 0;
    var init = {
      key: key,
      code: options.code || '',
      keyCode: options.keyCode || fallbackCode,
      which: options.keyCode || fallbackCode,
      altKey: !!options.altKey,
      ctrlKey: !!options.ctrlKey,
      metaKey: !!options.metaKey,
      shiftKey: !!options.shiftKey,
      bubbles: true,
      cancelable: true
    };
    // Dispatch directly to the canvas without focusing it. Focusing the canvas
    // blurs the hidden textarea on iPadOS, which dismisses the software
    // keyboard after every character.
    canvas.dispatchEvent(new KeyboardEvent('keydown', init));
    canvas.dispatchEvent(new KeyboardEvent('keyup', init));
  }

  function insertText(text) {
    Array.from(text || '').forEach(function (char) { dispatchKey(char); });
  }

  function showKeyboard() {
    if (!input) return;
    input.hidden = false;
    input.value = '';
    input.focus({ preventScroll: true });
    notifyNative('keyboard', 'shown');
  }

  function hideKeyboard() {
    if (!input) return;
    input.blur();
    input.hidden = true;
    if (canvas) canvas.focus();
    notifyNative('keyboard', 'hidden');
  }

  function installKeyboardBridge() {
    canvas = document.getElementById('screen');
    if (!canvas) return;

    input = document.createElement('textarea');
    input.id = 'ios-keyboard-input';
    input.hidden = true;
    input.rows = 1;
    input.autocapitalize = 'none';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'go');
    input.setAttribute('aria-label', '繁體中文鍵盤輸入');
    input.placeholder = '輸入文字後會送到 Firefox…';
    document.body.appendChild(input);

    var button = document.createElement('button');
    button.id = 'ios-keyboard-hint';
    button.type = 'button';
    button.textContent = '⌨ 中文輸入';
    button.setAttribute('aria-label', '顯示繁體中文鍵盤');
    button.addEventListener('click', showKeyboard);
    document.body.appendChild(button);

    input.addEventListener('compositionstart', function () { composing = true; });
    input.addEventListener('compositionend', function (event) {
      composing = false;
      insertText(event.data || '');
      input.value = '';
    });
    input.addEventListener('beforeinput', function (event) {
      if (composing || event.isComposing) return;
      if (event.inputType === 'insertText' && event.data) {
        event.preventDefault();
        insertText(event.data);
        input.value = '';
      } else if (event.inputType === 'insertLineBreak') {
        // keydown already forwards Enter. Prevent the textarea from keeping a
        // newline so it stays ready for the next search or address.
        event.preventDefault();
        input.value = '';
      } else if (
        event.inputType.indexOf('deleteContentBackward') === 0 ||
        event.inputType.indexOf('deleteContentForward') === 0
      ) {
        event.preventDefault();
        if (ignoreNextDeleteBeforeInput) {
          ignoreNextDeleteBeforeInput = false;
          window.clearTimeout(deleteGuardTimer);
          return;
        }
        var forward = event.inputType.indexOf('Forward') !== -1;
        dispatchKey(forward ? 'Delete' : 'Backspace', {
          code: forward ? 'Delete' : 'Backspace',
          keyCode: forward ? 46 : 8
        });
      }
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); hideKeyboard(); return; }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        // iPadOS may omit beforeinput when this forwarding textarea is empty.
        // Send the delete from keydown, then suppress the matching beforeinput
        // if WebKit does provide one.
        event.preventDefault();
        dispatchKey(event.key, {
          code: event.code || event.key,
          keyCode: event.key === 'Delete' ? 46 : 8
        });
        ignoreNextDeleteBeforeInput = true;
        window.clearTimeout(deleteGuardTimer);
        deleteGuardTimer = window.setTimeout(function () {
          ignoreNextDeleteBeforeInput = false;
        }, 120);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab' || event.key.indexOf('Arrow') === 0) {
        event.preventDefault();
        dispatchKey(event.key, {
          code: event.code,
          keyCode: event.keyCode,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey
        });
      }
    });
    canvas.addEventListener('dblclick', showKeyboard);
    installTouchScrolling();
  }

  function installTouchScrolling() {
    if (!canvas) return;
    canvas.style.touchAction = 'none';

    function dispatchWheel(x, y, deltaX, deltaY) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        deltaX: deltaX,
        deltaY: deltaY,
        deltaMode: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true
      }));
    }

    function stopMomentum() {
      if (momentumFrame) window.cancelAnimationFrame(momentumFrame);
      momentumFrame = 0;
    }

    function startMomentum(state) {
      var velocityX = state.velocityX;
      var velocityY = state.velocityY;
      var lastTime = performance.now();
      function step(now) {
        var elapsed = Math.min(32, now - lastTime);
        if (elapsed < 28) {
          momentumFrame = window.requestAnimationFrame(step);
          return;
        }
        lastTime = now;
        var decay = Math.pow(0.88, elapsed / 16.67);
        velocityX *= decay;
        velocityY *= decay;
        if (Math.hypot(velocityX, velocityY) < 0.05) {
          momentumFrame = 0;
          return;
        }
        dispatchWheel(state.x, state.y, velocityX * elapsed, velocityY * elapsed);
        momentumFrame = window.requestAnimationFrame(step);
      }
      momentumFrame = window.requestAnimationFrame(step);
    }

    canvas.addEventListener('touchstart', function (event) {
      stopMomentum();
      if (event.touches.length !== 1) {
        touchScroll = null;
        return;
      }
      var touch = event.touches[0];
      touchScroll = {
        identifier: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        time: performance.now(),
        velocityX: 0,
        velocityY: 0,
        moved: false
      };
    }, { passive: true });

    canvas.addEventListener('touchmove', function (event) {
      if (!touchScroll) return;
      var touch = Array.from(event.touches).find(function (item) {
        return item.identifier === touchScroll.identifier;
      });
      if (!touch) return;

      var deltaX = touchScroll.x - touch.clientX;
      var deltaY = touchScroll.y - touch.clientY;
      var now = performance.now();
      var elapsed = Math.max(8, Math.min(40, now - touchScroll.time));
      var distanceX = touch.clientX - touchScroll.startX;
      var distanceY = touch.clientY - touchScroll.startY;
      if (!touchScroll.moved && Math.hypot(distanceX, distanceY) < 5) return;

      touchScroll.moved = true;
      touchScroll.x = touch.clientX;
      touchScroll.y = touch.clientY;
      touchScroll.time = now;
      touchScroll.velocityX = Math.max(-2.5, Math.min(2.5,
        touchScroll.velocityX * 0.65 + (deltaX / elapsed) * 0.35
      ));
      touchScroll.velocityY = Math.max(-2.5, Math.min(2.5,
        touchScroll.velocityY * 0.65 + (deltaY / elapsed) * 0.35
      ));
      event.preventDefault();
      dispatchWheel(touch.clientX, touch.clientY, deltaX, deltaY);
    }, { passive: false });

    function finishTouch(event) {
      var finished = touchScroll;
      if (finished && finished.moved) {
        event.preventDefault();
        startMomentum(finished);
      }
      touchScroll = null;
    }
    canvas.addEventListener('touchend', finishTouch, { passive: false });
    canvas.addEventListener('touchcancel', finishTouch, { passive: false });
  }

  function translateRuntimeStatus() {
    var nodes = [
      document.getElementById('progress-phase'),
      document.getElementById('splash-status'),
      document.getElementById('start-btn')
    ];
    var translations = {
      'Preparing': '準備中',
      'Downloading': '下載中',
      'Decompressing': '解壓縮中',
      'Ready': '準備完成',
      'Launch Firefox': '啟動 Firefox',
      'Starting…': '正在啟動…',
      'Preparing Firefox…': '正在準備 Firefox…',
      'Loading browser chrome': '正在載入 Firefox 介面',
      'Starting Gecko': '正在啟動 Gecko'
    };
    nodes.forEach(function (node) {
      if (!node) return;
      var text = (node.textContent || '').trim();
      if (translations[text]) node.textContent = translations[text];
    });
  }

  function installCompatibilityMessage() {
    var panel = document.getElementById('stage-card');
    if (!panel) return;
    var note = document.createElement('p');
    note.id = 'ios-compatibility';
    var jspi = typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function';
    note.textContent = jspi
      ? '✓ 已偵測到 WebAssembly JSPI（iPadOS 27）。StikDebug 的程序 JIT 可保持啟用；為避免搜尋崩潰，請將實驗性 Gecko JIT 保持關閉。'
      : '需要 iPadOS 27 或更新版本的 WebAssembly JSPI。此裝置目前未提供 JSPI。';
    panel.appendChild(note);
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    var audioWorklet = !!(AudioContextClass && window.AudioWorkletNode);
    notifyNative('compatibility', {
      jspi: jspi,
      isolated: window.crossOriginIsolated,
      audioContext: !!AudioContextClass,
      audioWorklet: audioWorklet
    });
  }

  function configureGeckoLocale() {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (typeof window.geckoEvalChrome !== 'function') {
        if (attempts > 600) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      window.geckoEvalChrome("(() => {" +
        "Services.prefs.setCharPref('intl.accept_languages','zh-TW,zh,en-US,en');" +
        "Services.prefs.setCharPref('intl.locale.requested','zh-TW');" +
        "Services.prefs.setCharPref('font.name.sans-serif.zh-TW','Noto Sans CJK TC');" +
        "Services.prefs.setCharPref('font.name-list.sans-serif.zh-TW','Noto Sans CJK TC, Noto Sans TC, Liberation Sans');" +
        "Services.prefs.setCharPref('font.name.serif.zh-TW','Noto Sans CJK TC');" +
        "Services.prefs.setCharPref('font.name-list.serif.zh-TW','Noto Sans CJK TC, Noto Sans TC, Liberation Serif');" +
        "if (!window.__firefoxIOSPopupWorkaroundV2) {" +
          "window.__firefoxIOSPopupWorkaroundV2 = true;" +
          "let lastExtensionOpen = 0;" +
          "const redirectExtensionPopup = event => {" +
            "const target = event.target?.closest?.('toolbarbutton.webextension-browser-action');" +
            "if (!target) return;" +
            "const extensionId = target.getAttribute('data-extensionid');" +
            "const policy = extensionId && WebExtensionPolicy.getByID(extensionId);" +
            "const popup = policy?.extension?.manifest?.browser_action?.default_popup;" +
            "if (!popup) return;" +
            "event.preventDefault();" +
            "event.stopPropagation();" +
            "event.stopImmediatePropagation();" +
            "const now = Date.now();" +
            "if (now - lastExtensionOpen < 2000) return;" +
            "lastExtensionOpen = now;" +
            "setTimeout(() => openTrustedLinkIn(popup, 'tab', { inBackground: false }), 0);" +
          "};" +
          "window.addEventListener('mousedown', redirectExtensionPopup, true);" +
          "window.addEventListener('click', redirectExtensionPopup, true);" +
          "window.addEventListener('command', redirectExtensionPopup, true);" +
        "}" +
        "return 'zh-TW-ready';" +
      "})()").then(function (result) {
        notifyNative('gecko', result);
      }).catch(function (error) {
        console.warn('[zh-TW] Gecko preference setup failed:', error);
      });
    }, 250);
  }

  window.FirefoxIOS = {
    dispatchKey: dispatchKey,
    insertText: insertText,
    showKeyboard: showKeyboard,
    hideKeyboard: hideKeyboard,
    focusCanvas: function () { if (canvas) canvas.focus(); },
    openURL: function (url) {
      if (typeof window.geckoEvalChrome === 'function') {
        return window.geckoEvalChrome(
          "openTrustedLinkIn(" + JSON.stringify(String(url)) + ", 'current'); 'ok'"
        );
      }
      return false;
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    installKeyboardBridge();
    installCompatibilityMessage();
    translateRuntimeStatus();
    new MutationObserver(translateRuntimeStatus).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
    configureGeckoLocale();
  });
})();
