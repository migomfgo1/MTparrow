import 'dart:async';

import 'package:appsflyer_sdk/appsflyer_sdk.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

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
  }

  static const _trackingChannel = MethodChannel('mtparrow/tracking');
  static bool _appsFlyerConfigured = false;
  static bool _configuringAppsFlyer = false;
  static bool _sendingSession = false;
  static Future<String>? _pushRequest;
  static Future<void>? _startupPermissions;

  static Future<void> _waitUntilResumed() async {
    if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      return;
    }
    final resumed = Completer<void>();
    final listener = AppLifecycleListener(
      onResume: () {
        if (!resumed.isCompleted) resumed.complete();
      },
    );
    try {
      await resumed.future;
    } finally {
      listener.dispose();
    }
  }

  // Share the startup flow so web handlers cannot overlap ATT and push prompts.
  static Future<void> requestStartupPermissions() =>
      _startupPermissions ??= _requestStartupPermissions();

  static Future<void> _requestStartupPermissions() async {
    await _waitUntilResumed();
    await initializeAppsFlyer();
    final status = await _requestPushOnce();
    if (kDebugMode) debugPrint('[PUSH] $status');
  }

  static Future<Uri> attributedUrl(Uri url) async {
    const ownedOrigins = {'https://www.eedv.ink', 'https://eedv.ink'};
    if (!ownedOrigins.contains(url.origin)) return url;
    final query = Map<String, dynamic>.from(url.queryParametersAll);
    query.remove('ctag');
    try {
      if (_appsFlyerConfigured && await _trackingAllowed()) {
        final uid = await AppsFlyerSdk.instance.getAppsFlyerUID();
        if (uid != null && uid.trim().isNotEmpty) query['ctag'] = uid;
      }
    } catch (_) {
      debugPrint('[AppsFlyer] UID unavailable; opening URL without ctag.');
    }
    return query.isEmpty
        ? Uri.parse(url.replace(query: '').toString().replaceFirst('?', ''))
        : url.replace(queryParameters: query);
  }

  static Future<bool> _trackingAllowed() async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return true;
    await _waitUntilResumed();
    final status = await _trackingChannel.invokeMethod<String>('request');
    if (kDebugMode) debugPrint('[ATT] status: $status');
    return status == 'authorized';
  }

  // Called after the first frame and on resume, never before runApp.
  static Future<void> initializeAppsFlyer() async {
    if (_configuringAppsFlyer) return;
    if (_appsFlyerConfigured) {
      await _sendAppsFlyerSession();
      return;
    }
    _configuringAppsFlyer = true;
    try {
      // Do not initialize attribution until ATT is authorized on iOS.
      if (!await _trackingAllowed()) return;
      const key = String.fromEnvironment(
        'APPSFLYER_DEV_KEY',
        defaultValue: 'q38wQ9sTMeTLUV3y4rvJMc',
      );
      if (key.isEmpty) return;
      final sdk = AppsFlyerSdk.instance;
      await sdk.init(devKey: key, appId: '6836364375');
      await sdk.setDisableAdvertisingIdentifiers(false);
      _appsFlyerConfigured = true;
      await sdk.registerSessionReadyListener(_sendAppsFlyerSession);
    } catch (_) {
      debugPrint('AppsFlyer initialization or ATT request failed.');
    } finally {
      _configuringAppsFlyer = false;
    }
  }

  static Future<void> _sendAppsFlyerSession() async {
    if (_sendingSession || !_appsFlyerConfigured) return;
    _sendingSession = true;
    try {
      final sdk = AppsFlyerSdk.instance;
      final allowed = await _trackingAllowed();
      await sdk.setDisableAdvertisingIdentifiers(!allowed);
      if (await sdk.isStopped() == allowed) await sdk.stop(!allowed);
      if (!allowed || !await sdk.isSessionReady()) return;
      if (kDebugMode) debugPrint('[AppsFlyer] Starting authorized session.');
      await sdk.start(awaitResponse: true);
    } catch (_) {
      debugPrint('AppsFlyer session could not be reported.');
    } finally {
      _sendingSession = false;
    }
  }

  static Future<String> enablePush() async {
    await requestStartupPermissions();
    return _requestPushOnce();
  }

  static Future<String> _requestPushOnce() =>
      _pushRequest ??= _enablePush().whenComplete(() => _pushRequest = null);

  static Future<String> _enablePush() async {
    if (!firebaseReady) return 'Push is unavailable. Reopen the app to retry.';
    try {
      final messaging = FirebaseMessaging.instance;
      await _waitUntilResumed();
      var settings = await messaging.getNotificationSettings();
      if (settings.authorizationStatus == AuthorizationStatus.notDetermined) {
        settings = await messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
      }
      if (kDebugMode) {
        debugPrint(
          '[PUSH] authorization: ${settings.authorizationStatus.name}',
        );
      }
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
