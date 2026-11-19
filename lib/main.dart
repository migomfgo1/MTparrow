import 'package:flutter/material.dart';

import 'mobile_services.dart';
import 'fcm_token_bridge.dart';
import 'site_bridge.dart';

import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

const port = 19453;
const origin = 'http://127.0.0.1:$port';
final server = InAppLocalhostServer(port: port, documentRoot: 'assets/web');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await MobileServices.initialize();
  var available = true;
  try {
    await server.start().timeout(const Duration(seconds: 5));
  } catch (_) {
    available = false;
  }
  runApp(ParrotApp(available: available));
}

class ParrotApp extends StatefulWidget {
  const ParrotApp({super.key, required this.available});

  final bool available;

  @override
  State<ParrotApp> createState() => _ParrotAppState();
}

class _ParrotAppState extends State<ParrotApp> with WidgetsBindingObserver {
  late final SiteBridge siteBridge;

  @override
  void initState() {
    super.initState();
    siteBridge = SiteBridge(origin);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) siteBridge.sendPushState();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    siteBridge.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const background = Color(0xff15171e);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(scaffoldBackgroundColor: background),
      home: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          body: SafeArea(
            child: widget.available
                ? InAppWebView(
                    initialUrlRequest: URLRequest(
                      url: WebUri('https://www.eedv.ink/'),
                    ),
                    initialSettings: InAppWebViewSettings(
                      javaScriptEnabled: true,
                      useShouldOverrideUrlLoading: true,
                      allowsInlineMediaPlayback: true,
                      mediaPlaybackRequiresUserGesture: false,
                      javaScriptCanOpenWindowsAutomatically: false,
                      allowsLinkPreview: false,
                      disableContextMenu: true,
                      transparentBackground: true,
                      isInspectable: false,
                    ),
                    shouldOverrideUrlLoading: (_, action) =>
                        siteBridge.navigate(action),
                    onLoadStart: (_, url) => siteBridge.loadStarted(),
                    onLoadStop: (_, url) => siteBridge.loadStopped(),
                    onPermissionRequest: (_, request) async {
                      final allowed =
                          request.origin.origin == origin &&
                          request.resources.isNotEmpty &&
                          request.resources.every(
                            (type) =>
                                type == PermissionResourceType.MICROPHONE ||
                                type == PermissionResourceType.CAMERA ||
                                type ==
                                    PermissionResourceType
                                        .CAMERA_AND_MICROPHONE,
                          );
                      return PermissionResponse(
                        resources: request.resources,
                        action: allowed
                            ? PermissionResponseAction.GRANT
                            : PermissionResponseAction.DENY,
                      );
                    },
                    onWebViewCreated: (controller) {
                      siteBridge.attach(controller);
                      controller.addJavaScriptHandler(
                        handlerName: 'getFcmToken',
                        callback: (_) async {
                          final url = await controller.getUrl();
                          if (url?.origin != origin) return null;
                          return {'fcm_token': await FcmTokenBridge.refresh()};
                        },
                      );
                      controller.addJavaScriptHandler(
                        handlerName: "enablePush",
                        callback: (_) async {
                          if ((await controller.getUrl())?.origin != origin)
                            return null;
                          return MobileServices.enablePush();
                        },
                      );
                      controller.addJavaScriptHandler(
                        handlerName: 'flightReminder',
                        callback: (arguments) async {
                          if ((await controller.getUrl())?.origin != origin)
                            return null;
                          if (arguments.length != 1 ||
                              arguments.first is! Map) {
                            return 'invalid';
                          }
                          const channel = MethodChannel(
                            'mtparrow/flight_reminders',
                          );
                          return channel.invokeMethod<String>(
                            'schedule',
                            arguments.first,
                          );
                        },
                      );
                      controller.addJavaScriptHandler(
                        handlerName: 'practiceHaptic',
                        callback: (_) async {
                          if ((await controller.getUrl())?.origin != origin)
                            return null;
                          await HapticFeedback.lightImpact();
                          return true;
                        },
                      );
                    },
                  )
                : const Center(
                    child: Text('Could not start the app. Reopen to retry.'),
                  ),
          ),
        ),
      ),
    );
  }
}
