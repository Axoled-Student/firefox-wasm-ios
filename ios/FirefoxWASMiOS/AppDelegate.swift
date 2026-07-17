import AVFoundation
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureAudioSession()

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = FirefoxViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        configureAudioSession()
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .moviePlayback,
                options: [.mixWithOthers, .allowAirPlay, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
            NSLog("[audio] AVAudioSession setup failed: %@", String(describing: error))
        }
    }
}
