import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const firefoxRoot = new URL("../public/firefox/", import.meta.url);

test("ships the zh-TW iPad browser shell", async () => {
  const [html, bridge, style] = await Promise.all([
    readFile(new URL("index.html", firefoxRoot), "utf8"),
    readFile(new URL("ios-bridge.js", firefoxRoot), "utf8"),
    readFile(new URL("ios-bridge.css", firefoxRoot), "utf8"),
  ]);

  assert.match(html, /lang="zh-Hant-TW"/);
  assert.match(html, /支援繁體中文/);
  assert.match(html, /coi-loader\.js/);
  assert.match(html, /ios-bridge\.js/);
  assert.match(bridge, /compositionend/);
  assert.match(bridge, /Noto Sans CJK TC/);
  assert.match(bridge, /WebAssembly\.Suspending/);
  assert.match(style, /PingFang TC/);
});

test("ships matching Gecko and CJK asset payloads", async () => {
  const [wasm, archive, manifest, engineStat, engine] = await Promise.all([
    stat(new URL("gecko.wasm.zst", firefoxRoot)),
    stat(new URL("chrome-assets.tar.zst", firefoxRoot)),
    readFile(new URL("chrome-assets.json", firefoxRoot), "utf8"),
    stat(new URL("assets/index-BhJFTJAn.js", firefoxRoot)),
    readFile(new URL("assets/index-BhJFTJAn.js", firefoxRoot), "utf8"),
  ]);

  assert.equal(wasm.size, 37_892_603);
  assert.ok(archive.size > 40_000_000, "CJK font should be embedded in the archive");
  assert.ok(JSON.parse(manifest).uncompressedSize > 100_000_000);
  assert.ok(engineStat.size > 4_000_000);
  assert.match(engine, /var pthreadPoolSize = isIPadOS \? 4 : 20/);
});

test("cross-origin isolation and persistent runtime caching are included", async () => {
  const [html, loader, worker] = await Promise.all([
    readFile(new URL("index.html", firefoxRoot), "utf8"),
    readFile(new URL("coi-loader.js", firefoxRoot), "utf8"),
    readFile(new URL("coi-serviceworker.js", firefoxRoot), "utf8"),
  ]);
  assert.match(worker, /Cross-Origin-Embedder-Policy/);
  assert.match(worker, /Cross-Origin-Opener-Policy/);
  assert.match(worker, /clients\.claim/);
  assert.match(worker, /firefox-wasm-runtime-v1/);
  assert.match(worker, /gecko\.wasm\.zst/);
  assert.match(worker, /chrome-assets\.tar\.zst/);
  assert.match(worker, /cache\.match/);
  assert.match(worker, /cache\.put/);
  assert.match(loader, /loadFirefoxRuntime/);
  assert.doesNotMatch(html, /<script type="module"[^>]+index-BhJFTJAn\.js/);
});

test("the IPA bundles and loopback-serves Firefox without redownloading", async () => {
  const iosRoot = new URL("../ios/", import.meta.url);
  const [project, controller, server] = await Promise.all([
    readFile(new URL("project.yml", iosRoot), "utf8"),
    readFile(new URL("FirefoxWASMiOS/FirefoxViewController.swift", iosRoot), "utf8"),
    readFile(new URL("FirefoxWASMiOS/LoopbackHTTPServer.swift", iosRoot), "utf8"),
  ]);

  assert.match(project, /\.\.\/public\/firefox/);
  assert.match(project, /buildPhase: resources/);
  assert.match(project, /NSAllowsLocalNetworking: true/);
  assert.match(controller, /loadBundledFirefox/);
  assert.match(controller, /returnCacheDataElseLoad/);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /Cross-Origin-Embedder-Policy: require-corp/);
  assert.match(server, /Cross-Origin-Opener-Policy: same-origin/);
});
