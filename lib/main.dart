import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

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
  bool _firstFrameRendered = false;
  bool _starting = true;
  Uri? _initialUrl;
  bool _pageLoading = true;

  @override
  void initState() {
    super.initState();
    siteBridge = SiteBridge(origin);
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _firstFrameRendered = true;
      _prepareStartup();
    });
  }

  Future<void> _prepareStartup() async {
    final base = Uri.parse('https://www.eedv.ink/');
    var url = base;
    try {
      await MobileServices.requestStartupPermissions();
      url = await MobileServices.attributedUrl(base);
    } catch (_) {
      debugPrint('Startup permissions unavailable; opening the site.');
    } finally {
      if (mounted) {
        setState(() {
          _starting = false;
          _initialUrl = url;
        });
        if (kDebugMode) debugPrint('[WEBVIEW] Initial URL: $url');
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      siteBridge.sendPushState();
      if (_firstFrameRendered && !_starting) {
        MobileServices.initializeAppsFlyer();
      }
    }
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
            child: _initialUrl == null
                ? const _ParrotLoader()
                : widget.available
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      InAppWebView(
                        initialUrlRequest: URLRequest(
                          url: WebUri(_initialUrl.toString()),
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
                        onLoadStart: (_, url) {
                          siteBridge.loadStarted();
                          if (mounted) setState(() => _pageLoading = true);
                        },
                        onLoadStop: (_, url) async {
                          if (mounted) setState(() => _pageLoading = false);
                          await siteBridge.loadStopped();
                        },
                        onReceivedError: (_, request, error) {
                          if (request.isForMainFrame == true && mounted) {
                            setState(() => _pageLoading = false);
                          }
                        },
                        onReceivedHttpError: (_, request, response) {
                          if (request.isForMainFrame == true && mounted) {
                            setState(() => _pageLoading = false);
                          }
                        },
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
                              return {
                                'fcm_token': await FcmTokenBridge.refresh(),
                              };
                            },
                          );
                          controller.addJavaScriptHandler(
                            handlerName: "enablePush",
                            callback: (_) async {
                              if (!await siteBridge.trusted()) return null;
                              final status = await MobileServices.enablePush();
                              await siteBridge.sendPushState();
                              return status;
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
                      ),
                      if (_pageLoading) const _ParrotLoader(),
                    ],
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

class _ParrotLoader extends StatelessWidget {
  const _ParrotLoader();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xff15171e),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/web/parrot-loader-new.webp',
              width: 220,
              height: 220,
              fit: BoxFit.contain,
              semanticLabel: 'Loading MT Par',
            ),
            const SizedBox(height: 16),
            const Text(
              'MT Par',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
