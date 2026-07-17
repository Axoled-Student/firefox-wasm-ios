(function () {
  'use strict';

  var canvas;
  var input;
  var composing = false;

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
    canvas.focus();
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
      } else if (event.inputType.indexOf('deleteContentBackward') === 0) {
        event.preventDefault();
        dispatchKey('Backspace', { code: 'Backspace', keyCode: 8 });
      }
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); hideKeyboard(); return; }
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
      ? '✓ 已偵測到 WebAssembly JSPI（iPadOS 27）。若使用側載版，請先在 StikDebug 啟用 JIT。'
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
      if (typeof window.geckoLoad === 'function') return window.geckoLoad(url);
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
