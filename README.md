# Firefox WASM for iPadOS 27

Firefox's Gecko engine running inside a `WKWebView`, packaged as an unsigned iPadOS IPA. The web app adds Traditional Chinese font fallback, zh-TW preferences, hardware/software keyboard support, iPad multitasking layout, audio-session support, and a StikDebug-ready sideload configuration.

## Requirements

- iPadOS 27 or newer. This Gecko build requires WebAssembly JavaScript Promise Integration (JSPI), first provided by WebKit in Safari 27.
- Network access is only required for websites opened inside Firefox. Version 1.0.1 bundles the full Gecko runtime and browser assets inside the IPA, so launching Firefox never downloads them again.
- For the experimental Gecko JS → WASM JIT: a sideloaded build that retains `get-task-allow`, plus StikDebug or another compatible JIT enabler.

## Install the IPA

1. Open the repository's **Actions** tab and choose **Build unsigned iPadOS IPA**.
2. Download the `FirefoxWASM-iPadOS27-unsigned` artifact.
3. Sideload the included `.ipa` with SideStore, AltStore, Sideloadly, or an equivalent signer.
4. Confirm the development signer applied `get-task-allow` (the artifact includes `requested-entitlements.plist` as a reference).
5. In StikDebug, select **Firefox WASM** and enable JIT, then return to Firefox WASM.

The JIT checkbox in the web launch screen is enabled by default. StikDebug controls iPadOS process JIT permission; the checkbox controls Gecko's experimental internal JS → WASM JIT.

The replacement IPA is roughly 80 MB because it now includes Gecko, the Firefox chrome archive, and the Traditional Chinese font. The native wrapper serves those files from a private loopback address with the COOP/COEP headers required by WebAssembly threads. The hosted web version additionally stores the large archives in persistent Cache Storage after the first download.

## Keyboard and zh-TW

- The bundled Gecko font archive contains `NotoSansCJKtc-Regular.otf` in both GRE font locations, preventing missing Traditional Chinese glyphs.
- Gecko is configured with `intl.accept_languages=zh-TW,zh,en-US,en` and Noto Sans CJK TC as the zh-TW serif/sans-serif fallback.
- Hardware shortcuts include `⌘L`, `⌘T`, `⌘R`, `⌘F`, `⌥←`, and `⌥→`.
- Tap **中文輸入** or the native keyboard button to use the iPad Traditional Chinese IME. Composition text is forwarded to Gecko after candidate selection.

## Audio

The native app configures `AVAudioSession` for playback with mixing, Bluetooth A2DP, and AirPlay. `WKWebView` allows inline playback and initializes audio from the user-initiated Firefox launch gesture so AudioContext/AudioWorklet can start on iPadOS.

## Development

```sh
npm ci
npm run test:web
npm run build
```

The web app is in `public/firefox`. The native project source is in `ios`; GitHub Actions uses XcodeGen to create the `.xcodeproj` before compiling.

## Upstream and licenses

This repository packages the [HeyPuter/firefox-wasm](https://github.com/HeyPuter/firefox-wasm) demo and supplied Gecko WASM build under MPL-2.0. Traditional Chinese glyph coverage comes from [Noto CJK](https://github.com/notofonts/noto-cjk) under the SIL Open Font License. License copies are included in `public/firefox/licenses`.
