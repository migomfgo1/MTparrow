import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Native token snapshot plus updates from AppDelegate.
class FcmTokenBridge {
  static const _channel = MethodChannel('com.example.fcm/token');
  static final ValueNotifier<String?> token = ValueNotifier<String?>(null);
  static bool _initialized = false;
  static int _revision = 0;

  static Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'setToken') {
        _revision++;
        token.value = call.arguments as String?;
        if (kDebugMode) {
          debugPrint(
            '[FCM] token updated: ${token.value ?? "pending APNs registration"}',
          );
        }
      }
    });
    await refresh();
  }

  static Future<String?> refresh() async {
    final revision = _revision;
    try {
      final value = await _channel.invokeMethod<String>('getToken');
      if (revision == _revision) {
        token.value = value;
        if (kDebugMode) {
          debugPrint('[FCM] token: ${value ?? "pending APNs registration"}');
        }
      }
    } on PlatformException catch (error) {
      if (kDebugMode) debugPrint('[FCM] token error: ${error.code}');
      // Registration can still be pending. The next setToken event updates it.
    } on MissingPluginException {
      // This channel is implemented by the iOS host.
    }
    return token.value;
  }
}
