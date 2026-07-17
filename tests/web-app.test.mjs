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
  const [wasm, archive, manifest, engine] = await Promise.all([
    stat(new URL("gecko.wasm.zst", firefoxRoot)),
    stat(new URL("chrome-assets.tar.zst", firefoxRoot)),
    readFile(new URL("chrome-assets.json", firefoxRoot), "utf8"),
    stat(new URL("assets/index-BhJFTJAn.js", firefoxRoot)),
  ]);

  assert.equal(wasm.size, 37_892_603);
  assert.ok(archive.size > 40_000_000, "CJK font should be embedded in the archive");
  assert.ok(JSON.parse(manifest).uncompressedSize > 100_000_000);
  assert.ok(engine.size > 4_000_000);
});

test("cross-origin isolation service worker is included", async () => {
  const worker = await readFile(new URL("coi-serviceworker.js", firefoxRoot), "utf8");
  assert.match(worker, /Cross-Origin-Embedder-Policy/);
  assert.match(worker, /Cross-Origin-Opener-Policy/);
  assert.match(worker, /clients\.claim/);
});
