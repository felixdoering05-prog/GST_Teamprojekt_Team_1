# IFC-Modellbefehle

02.11.2026 · Technisches Entwicklungsprotokoll.

Felix hat die ersten drei IFC-Ansichtsaktionen über Befehle freigegeben: ausblenden, einfärben und Sichtbarkeit/Originalfarben zurücksetzen. Umsetzung im geöffneten 3D-Modell mit Vorschau der tatsächlichen Aktion und lokalen Trefferzahl sowie explizitem Ausführen. Gespeicherte Modelle in der iPhone-App verwenden Gemini nur zur Übersetzung des Befehlstexts. Browser und lokale Vorschau bieten feste Offline-Beispiele.

API- und Viewer-Validierung verhindern beliebige Aktionen oder Modellcode. Keine IFC-Datei/Bauteildaten an Google; kein Schreiben an der gespeicherten Datei. Die Auswahl bleibt pro Viewer lokal. Neue Tabellen sind nicht erforderlich. Räume, Geschosse und Lichtbefehle bleiben offen.

Prüfung: 51 Backendtests, vier Three.js-/Befehlstests, echter WKWebView-Test mit synthetischer IFC-Wand sowie echte strukturierte Gemini-Antwort erfolgreich. Eine anfänglich fehlerhafte Typzuordnung wurde im WKWebView-Test gefunden und auf numerische IFC-Klassen nach dem Geometrieimport korrigiert. [Bedienung und Grenzen](../ifc-modellbefehle.md).

Repository- und originales Xcode-Projekt erfolgreich für den Simulator gebaut. Web-Frontend gebaut und Lint geprüft. Die zusätzliche sichtbare Simulatorprüfung konnte zunächst nicht durchgeführt werden, weil der Mac gesperrt war; automatischer WKWebView-Test und Build sind davon getrennte Nachweise.
