import Flutter
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, MessagingDelegate {
  private var fcmTokenChannel: FlutterMethodChannel?
  private var latestFcmToken: String?
  private var tokenBridgeReady = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let tokenChannel = FlutterMethodChannel(
      name: "com.example.fcm/token",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    fcmTokenChannel = tokenChannel
    tokenBridgeReady = false
    tokenChannel.setMethodCallHandler { [weak self] call, result in
      guard let self = self else { result(nil); return }
      guard call.method == "getToken" || call.method == "ready" else {
        result(FlutterMethodNotImplemented)
        return
      }
      self.tokenBridgeReady = true
      guard FirebaseApp.app() != nil else { result(nil); return }
      guard Messaging.messaging().apnsToken != nil else {
        result(nil)
        return
      }
      if let token = self.latestFcmToken { result(token); return }
      Messaging.messaging().token { [weak self] token, error in
        DispatchQueue.main.async {
          if let error = error {
            result(FlutterError(code: "fcm_token_unavailable",
                               message: error.localizedDescription, details: nil))
            return
          }
          if let token = token { self?.latestFcmToken = token }
          result(token)
        }
      }
    }
    // firebase_messaging forwards registration callbacks to AppDelegate.
    // Keep its Messaging delegate in place to preserve the plugin's behavior.
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "ParrotFlightReminder") {
      let channel = FlutterMethodChannel(
        name: "mtparrow/flight_reminders", binaryMessenger: registrar.messenger()
      )
      channel.setMethodCallHandler { call, result in
        guard call.method == "schedule" else {
          result(FlutterMethodNotImplemented)
          return
        }
        Self.updateFlightReminder(call.arguments, result: result)
      }
    }
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.latestFcmToken = fcmToken
      if self.tokenBridgeReady {
        self.fcmTokenChannel?.invokeMethod("setToken", arguments: fcmToken)
      }
    }
  }

  private static func updateFlightReminder(_ arguments: Any?, result: @escaping FlutterResult) {
    guard let values = arguments as? [String: Any],
          let id = values["id"] as? String, !id.isEmpty, id.count <= 80,
          let name = values["name"] as? String, !name.isEmpty, name.count <= 60,
          let days = values["days"] as? [Int],
          days.allSatisfy({ (0...6).contains($0) }),
          let time = values["time"] as? String else {
      result("invalid")
      return
    }
    let clock = time.split(separator: ":").compactMap { Int($0) }
    guard clock.count == 2, (0...23).contains(clock[0]), (0...59).contains(clock[1]) else {
      result("invalid")
      return
    }

    let center = UNUserNotificationCenter.current()
    let identifier: (Int) -> String = { "parrot.flight.\(id).\($0)" }
    let selected = Set(days)
    center.removePendingNotificationRequests(
      withIdentifiers: (0...6).filter { !selected.contains($0) }.map(identifier)
    )
    if selected.isEmpty {
      result("ok")
      return
    }
    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
      guard granted, error == nil else {
        DispatchQueue.main.async { result("denied") }
        return
      }
      Task {
        do {
          for day in selected.sorted() {
            let content = UNMutableNotificationContent()
            content.title = "Time for your flight"
            content.body = name
            content.sound = .default
            let date = DateComponents(hour: clock[0], minute: clock[1], weekday: day + 1)
            let request = UNNotificationRequest(
              identifier: identifier(day),
              content: content,
              trigger: UNCalendarNotificationTrigger(dateMatching: date, repeats: true)
            )
            try await center.add(request)
          }
          await MainActor.run { result("ok") }
        } catch {
          await MainActor.run { result("unavailable") }
        }
      }
    }
  }
}
