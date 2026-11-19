import 'package:flutter_test/flutter_test.dart';
import 'package:mtparrow/main.dart';

void main() {
  testWidgets('Shows a retry message if the asset server cannot start', (
    tester,
  ) async {
    await tester.pumpWidget(const ParrotApp(available: false));
    expect(
      find.text('Could not start the app. Reopen to retry.'),
      findsOneWidget,
    );
  });
}
