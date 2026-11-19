import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'fcm_token_bridge.dart';
import 'mobile_services.dart';

class SiteBridge {
  static const siteOrigin = 'https://beefwv8.com';
  static const appOrigins = {'https://www.eedv.ink', 'https://eedv.ink'};
  final String localOrigin;
  InAppWebViewController? controller;
  bool started = false;
  bool ready = false;
  bool disposed = false;
  bool sending = false;
  bool pending = false;
  int navigation = 0;
  Future<String>? pushRequest;

  SiteBridge(this.localOrigin) {
    FcmTokenBridge.token.addListener(tokenChanged);
  }

  void attach(InAppWebViewController value) {
    controller = value;
    value.addJavaScriptHandler(
      handlerName: 'inAppEvent',
      callback: (arguments) async {
        if (!await trusted()) return {'error': 'untrusted_origin'};
        if (arguments.length > 1 ||
            (arguments.isNotEmpty && arguments.first != 'push')) {
          return {'error': 'unsupported_event'};
        }
        pushRequest ??= MobileServices.enablePush();
        try {
          final status = await pushRequest!;
          await sendPushState();
          return {'status': status};
        } finally {
          pushRequest = null;
        }
      },
    );
  }

  Future<bool> trusted() async {
    final url = await controller?.getUrl();
    return url?.origin == localOrigin ||
        appOrigins.contains(url?.origin) ||
        (started && url?.origin == siteOrigin);
  }

  Future<NavigationActionPolicy> navigate(NavigationAction action) async {
    final url = action.request.url;
    if (url == null) return NavigationActionPolicy.CANCEL;
    if (url.scheme == 'uniwebview') {
      if (action.isForMainFrame != true || !await trusted()) {
        return NavigationActionPolicy.CANCEL;
      }
      final query = url.queryParameters;
      if (url.host != 'action' || query['host'] != 'beefwv8.com') {
        return NavigationActionPolicy.CANCEL;
      }
      if (query['key'] == 'init' && query['project'] == 'beef') {
        await sendPushState();
      } else if (query['key'] == 'startLoadSite' &&
          query['anotherKey'] == 'beef') {
        started = true;
        ready = false;
        await controller?.loadUrl(
          urlRequest: URLRequest(url: WebUri(siteOrigin)),
        );
      }
      return NavigationActionPolicy.CANCEL;
    }
    return url.origin == localOrigin || url.scheme == 'https'
        ? NavigationActionPolicy.ALLOW
        : NavigationActionPolicy.CANCEL;
  }

  void loadStarted() {
    navigation++;
    ready = false;
  }

  Future<void> loadStopped() async {
    ready = true;
    await sendPushState();
  }

  void tokenChanged() {
    if (ready) sendPushState();
  }

  Future<void> sendPushState() async {
    if (disposed || !ready) return;
    pending = true;
    if (sending) return;
    sending = true;
    try {
      while (pending && !disposed) {
        pending = false;
        final revision = navigation;
        final web = controller;
        if (web == null) continue;
        final pageOrigin = (await web.getUrl())?.origin;
        final canSend =
            appOrigins.contains(pageOrigin) ||
            (started && pageOrigin == siteOrigin);
        if (!canSend && !kDebugMode) continue;
        final token = await FcmTokenBridge.refresh();
        var granted = false;
        if (MobileServices.firebaseReady) {
          final settings = await FirebaseMessaging.instance
              .getNotificationSettings();
          granted =
              settings.authorizationStatus == AuthorizationStatus.authorized ||
              settings.authorizationStatus == AuthorizationStatus.provisional;
        }
        if (disposed || !ready || revision != navigation) continue;
        final platform = defaultTargetPlatform == TargetPlatform.iOS
            ? 'iOS'
            : 'Android';
        final options = MobileServices.firebaseReady
            ? Firebase.app().options
            : null;
        final bundleId =
            options?.iosBundleId ?? 'com.mtparrow.parrowm.mtparrow';
        final payload = {
          'isWebView': platform,
          'version': bundleId,
          'project_id': options?.projectId ?? 'mart-in-c1bb4',
          'Firebase_projectName': bundleId,
          'firebase_brand': 'false',
          'webViewReady': 'true',
          'mobile_push_token': token ?? '',
          'push_recive': granted && token != null && token.isNotEmpty
              ? 'true'
              : 'false',
        };
        if (kDebugMode) {
          final formatted = const JsonEncoder.withIndent('  ').convert(payload);
          for (final line in formatted.split('\n')) {
            debugPrint('[PUSH_PAYLOAD] $line');
          }
          debugPrint(
            '[PUSH_BRIDGE] page=$pageOrigin; '
            'eligibleForPostMessage=$canSend',
          );
        }
        if (!canSend) continue;
        await web.evaluateJavascript(
          source:
              'if (window.location.origin === ' +
              jsonEncode(pageOrigin) +
              ') {' +
              'window.parent.postMessage(' +
              jsonEncode(payload) +
              ',' +
              jsonEncode(pageOrigin) +
              '); }',
        );
      }
    } catch (_) {
      debugPrint('Push state could not be delivered to the site.');
    } finally {
      sending = false;
    }
  }

  void dispose() {
    disposed = true;
    FcmTokenBridge.token.removeListener(tokenChanged);
    controller = null;
  }
}
