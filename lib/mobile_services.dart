import 'package:appsflyer_sdk/appsflyer_sdk.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'fcm_token_bridge.dart';

@pragma('vm:entry-point')
Future<void> handleBackgroundPush(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class MobileServices {
  static bool firebaseReady = false;

  static Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(handleBackgroundPush);
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
            alert: true,
            badge: true,
            sound: true,
          );
      firebaseReady = true;
      await FcmTokenBridge.initialize();
    } catch (_) {
      debugPrint('Firebase initialization failed.');
    }
    const key = String.fromEnvironment(
      'APPSFLYER_DEV_KEY',
      defaultValue: 'q38wQ9sTMeTLUV3y4rvJMc',
    );
    if (key.isEmpty) return;
    try {
      final sdk = AppsFlyerSdk.instance;
      await sdk.init(devKey: key, appId: '6836364375');
      await sdk.setDisableAdvertisingIdentifiers(true);
      await sdk.registerSessionReadyListener(() async {
        try {
          await sdk.start(awaitResponse: true);
        } catch (_) {
          debugPrint('AppsFlyer session could not be reported.');
        }
      });
    } catch (_) {
      debugPrint('AppsFlyer initialization failed.');
    }
  }

  static Future<String> enablePush() async {
    if (!firebaseReady) return 'Push is unavailable. Reopen the app to retry.';
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return 'Allow notifications for MT Par in iOS Settings.';
      }
      for (var attempt = 0; attempt < 10; attempt++) {
        if (await messaging.getAPNSToken() != null) {
          await FcmTokenBridge.refresh();
          await messaging.subscribeToTopic('mt_par_updates');
          return 'Push notifications enabled.';
        }
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      return 'Waiting for Apple push registration. Try again shortly.';
    } catch (_) {
      return 'Could not enable push. Check your connection and try again.';
    }
  }
}
