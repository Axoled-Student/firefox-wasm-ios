import Foundation
import Network

/// Serves the bundled Firefox web runtime from loopback with the HTTP headers
/// WebKit requires for SharedArrayBuffer and Wasm pthreads.
final class LoopbackHTTPServer {
    private let rootURL: URL
    private let queue = DispatchQueue(label: "com.axoledstudent.firefoxwasm.http")
    private var listener: NWListener?
    private var didFinishStarting = false

    init?() {
        guard let resourceURL = Bundle.main.resourceURL else { return nil }
        let candidate = resourceURL.appendingPathComponent("firefox", isDirectory: true)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            return nil
        }
        rootURL = candidate.standardizedFileURL
    }

    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
            let listener = try NWListener(using: parameters)
            self.listener = listener

            listener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                guard let self, !self.didFinishStarting else { return }
                switch state {
                case .ready:
                    guard let port = listener?.port else {
                        self.finishStart(.failure(ServerError.missingPort), completion: completion)
                        return
                    }
                    let url = URL(string: "http://127.0.0.1:\(port.rawValue)/")!
                    self.finishStart(.success(url), completion: completion)
                case .failed(let error):
                    self.finishStart(.failure(error), completion: completion)
                default:
                    break
                }
            }
            listener.start(queue: queue)
        } catch {
            finishStart(.failure(error), completion: completion)
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func finishStart(_ result: Result<URL, Error>, completion: @escaping (Result<URL, Error>) -> Void) {
        guard !didFinishStarting else { return }
        didFinishStarting = true
        DispatchQueue.main.async { completion(result) }
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(on: connection, accumulated: Data())
    }

    private func receiveRequest(on connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else {
                connection.cancel()
                return
            }

            var request = accumulated
            if let data { request.append(data) }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil {
                self.respond(to: connection, request: request)
                return
            }
            if request.count >= 64 * 1024 {
                self.sendError(431, reason: "Request Header Fields Too Large", to: connection)
                return
            }
            if isComplete || error != nil {
                connection.cancel()
                return
            }
            self.receiveRequest(on: connection, accumulated: request)
        }
    }

    private func respond(to connection: NWConnection, request: Data) {
        guard
            let text = String(data: request, encoding: .utf8),
            let firstLine = text.components(separatedBy: "\r\n").first
        else {
            sendError(400, reason: "Bad Request", to: connection)
            return
        }

        let parts = firstLine.split(separator: " ", maxSplits: 2).map(String.init)
        guard parts.count == 3, parts[0] == "GET" || parts[0] == "HEAD" else {
            sendError(405, reason: "Method Not Allowed", to: connection)
            return
        }

        guard let fileURL = resolve(parts[1]) else {
            sendError(404, reason: "Not Found", to: connection)
            return
        }

        do {
            let body = try Data(contentsOf: fileURL, options: .mappedIfSafe)
            let cacheControl = shouldCacheForever(fileURL)
                ? "public, max-age=31536000, immutable"
                : "no-cache"
            let header = responseHeader(
                status: 200,
                reason: "OK",
                contentLength: body.count,
                contentType: mimeType(for: fileURL),
                cacheControl: cacheControl
            )
            send(header: header, body: parts[0] == "HEAD" ? nil : body, to: connection)
        } catch {
            sendError(500, reason: "Internal Server Error", to: connection)
        }
    }

    private func resolve(_ requestTarget: String) -> URL? {
        let pathOnly = requestTarget.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        guard let decoded = pathOnly.removingPercentEncoding else { return nil }
        let components = decoded.split(separator: "/").map(String.init)
        guard !components.contains(where: { $0 == "." || $0 == ".." || $0.contains("\\") }) else {
            return nil
        }

        let relative = components.isEmpty ? ["index.html"] : components
        var candidate = rootURL
        for component in relative {
            candidate.appendPathComponent(component, isDirectory: false)
        }
        candidate = candidate.standardizedFileURL

        let rootPath = rootURL.path.hasSuffix("/") ? rootURL.path : rootURL.path + "/"
        guard candidate.path.hasPrefix(rootPath), !candidate.hasDirectoryPath else { return nil }
        guard FileManager.default.fileExists(atPath: candidate.path) else { return nil }
        return candidate
    }

    private func sendError(_ status: Int, reason: String, to connection: NWConnection) {
        let body = Data("\(status) \(reason)\n".utf8)
        let header = responseHeader(
            status: status,
            reason: reason,
            contentLength: body.count,
            contentType: "text/plain; charset=utf-8",
            cacheControl: "no-store"
        )
        send(header: header, body: body, to: connection)
    }

    private func send(header: Data, body: Data?, to connection: NWConnection) {
        connection.send(content: header, contentContext: .defaultMessage, isComplete: body == nil, completion: .contentProcessed { error in
            guard error == nil, let body else {
                connection.cancel()
                return
            }
            connection.send(content: body, contentContext: .defaultMessage, isComplete: true, completion: .contentProcessed { _ in
                connection.cancel()
            })
        })
    }

    private func responseHeader(
        status: Int,
        reason: String,
        contentLength: Int,
        contentType: String,
        cacheControl: String
    ) -> Data {
        let lines = [
            "HTTP/1.1 \(status) \(reason)",
            "Content-Length: \(contentLength)",
            "Content-Type: \(contentType)",
            "Cache-Control: \(cacheControl)",
            "Cross-Origin-Opener-Policy: same-origin",
            "Cross-Origin-Embedder-Policy: require-corp",
            "Cross-Origin-Resource-Policy: same-origin",
            "Service-Worker-Allowed: /",
            "X-Content-Type-Options: nosniff",
            "Connection: close",
            "",
            ""
        ]
        return Data(lines.joined(separator: "\r\n").utf8)
    }

    private func shouldCacheForever(_ url: URL) -> Bool {
        let name = url.lastPathComponent
        return name == "gecko.wasm.zst"
            || name == "chrome-assets.tar.zst"
            || url.path.contains("/assets/")
            || url.path.contains("/licenses/")
            || name == "logo.webp"
    }

    private func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "webp": return "image/webp"
        case "plist": return "application/x-plist"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    private enum ServerError: Error {
        case missingPort
    }
}
