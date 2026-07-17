import AVFoundation
import UIKit
import WebKit

final class FirefoxViewController: UIViewController {
    private static let webAppURL = URL(string: "https://axoled-student.github.io/firefox-wasm-ios/")!

    private lazy var webView: WKWebView = {
        let contentController = WKUserContentController()
        contentController.add(self, name: "firefoxStatus")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.translatesAutoresizingMaskIntoConstraints = false
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        view.backgroundColor = UIColor(red: 0.09, green: 0.07, blue: 0.17, alpha: 1)
        view.isOpaque = true
        if #available(iOS 16.4, *) {
            view.isInspectable = true
        }
        return view
    }()

    private lazy var toolbar: UIToolbar = {
        let toolbar = UIToolbar()
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        toolbar.isTranslucent = true
        toolbar.items = [
            item("chevron.backward", "上一頁", #selector(goBack)),
            item("chevron.forward", "下一頁", #selector(goForward)),
            flexibleSpace(),
            item("rectangle.and.pencil.and.ellipsis", "網址列", #selector(focusLocation)),
            item("plus.square", "新增分頁", #selector(newTab)),
            item("arrow.clockwise", "重新載入", #selector(reloadPage)),
            flexibleSpace(),
            item("keyboard", "繁體中文鍵盤", #selector(showKeyboard))
        ]
        return toolbar
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.09, green: 0.07, blue: 0.17, alpha: 1)
        view.addSubview(webView)
        view.addSubview(toolbar)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: toolbar.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        webView.load(URLRequest(url: Self.webAppURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var prefersStatusBarHidden: Bool { true }

    override var keyCommands: [UIKeyCommand]? {
        [
            command("l", .command, "網址列", #selector(focusLocation)),
            command("t", .command, "新增分頁", #selector(newTab)),
            command("r", .command, "重新載入", #selector(reloadPage)),
            command("f", .command, "尋找", #selector(findInPage)),
            command(UIKeyCommand.inputLeftArrow, .alternate, "上一頁", #selector(goBack)),
            command(UIKeyCommand.inputRightArrow, .alternate, "下一頁", #selector(goForward)),
            UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape), discoverabilityTitle: "關閉")
        ]
    }

    private func item(_ symbol: String, _ label: String, _ action: Selector) -> UIBarButtonItem {
        UIBarButtonItem(image: UIImage(systemName: symbol), style: .plain, target: self, action: action).withAccessibilityLabel(label)
    }

    private func flexibleSpace() -> UIBarButtonItem {
        UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
    }

    private func command(_ input: String, _ modifiers: UIKeyModifierFlags, _ title: String, _ action: Selector) -> UIKeyCommand {
        UIKeyCommand(input: input, modifierFlags: modifiers, action: action, discoverabilityTitle: title)
    }

    private func sendKey(
        _ key: String,
        code: String = "",
        keyCode: Int = 0,
        alt: Bool = false,
        command: Bool = false,
        shift: Bool = false
    ) {
        let options: [String: Any] = [
            "code": code,
            "keyCode": keyCode,
            "altKey": alt,
            "metaKey": command,
            "shiftKey": shift
        ]
        guard
            let keyData = try? JSONSerialization.data(withJSONObject: key, options: .fragmentsAllowed),
            let keyJSON = String(data: keyData, encoding: .utf8),
            let optionsData = try? JSONSerialization.data(withJSONObject: options),
            let optionsJSON = String(data: optionsData, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.FirefoxIOS?.dispatchKey(\(keyJSON), \(optionsJSON));")
    }

    @objc private func goBack() { sendKey("ArrowLeft", code: "ArrowLeft", keyCode: 37, alt: true) }
    @objc private func goForward() { sendKey("ArrowRight", code: "ArrowRight", keyCode: 39, alt: true) }
    @objc private func focusLocation() { sendKey("l", code: "KeyL", keyCode: 76, command: true) }
    @objc private func newTab() { sendKey("t", code: "KeyT", keyCode: 84, command: true) }
    @objc private func findInPage() { sendKey("f", code: "KeyF", keyCode: 70, command: true) }
    @objc private func escape() { sendKey("Escape", code: "Escape", keyCode: 27) }

    @objc private func reloadPage() {
        sendKey("r", code: "KeyR", keyCode: 82, command: true)
    }

    @objc private func showKeyboard() {
        webView.evaluateJavaScript("window.FirefoxIOS?.showKeyboard();")
    }

    deinit {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "firefoxStatus")
    }
}

extension FirefoxViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("window.FirefoxIOS?.focusCanvas();")
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if let scheme = url.scheme?.lowercased(), !["http", "https", "about", "blob", "data"].contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

extension FirefoxViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}

extension FirefoxViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "firefoxStatus" else { return }
        NSLog("[web] %@", String(describing: message.body))
    }
}

private extension UIBarButtonItem {
    func withAccessibilityLabel(_ label: String) -> UIBarButtonItem {
        accessibilityLabel = label
        return self
    }
}
