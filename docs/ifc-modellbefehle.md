# IFC-Modellbefehle: ausblenden, einfärben, zurücksetzen

Stand: 02.11.2026. Erste kontrollierte Befehle für die **3D-Ansicht**, keine Bearbeitung/Überschreibung der IFC-Datei.

## Bedienung

Gebäude → **3D** → Modell öffnen → **Modellbefehle**. Alternativ im Gebäude-Assistenten auf **IFC-Modell mit Befehlen öffnen** tippen.

1. Beispiel wählen oder einen einzelnen Befehl eingeben, etwa „Blende alle Wände aus“, „Färbe alle Wände blau“ oder „Alles zurücksetzen“.
2. Bei gespeicherten Modellen in der iPhone-App Übertragung des **Befehlstextes** an Google bestätigen und **Befehl prüfen** tippen. Keine IFC-Datei, Bauteilnamen, IDs, Geometrie oder Gebäudestammdaten werden dafür übertragen. Es gelten dieselben Gemini-Kontingente wie beim Text-Assistenten.
3. Die App prüft das JSON, der lokale Viewer ermittelt die passenden tatsächlich darstellbaren IFC-Bauteile. **Aktion, Farbe und Trefferzahl** werden vor Ausführung angezeigt. Der Ausführungstext wird aus den validierten Feldern erzeugt, nicht ungeprüft aus einer KI-Zusammenfassung.
4. Erst **Ausführen** ändert die Ansicht. Schließen zeigt das Modell wieder. „Alles zurücksetzen“ stellt Sichtbarkeit und Originalfarben der Bauteile wieder her; es ändert nicht Kamera oder simulierte Raumlichter.

„Ausgewähltes Bauteil ausblenden“ setzt eine vorherige Bauteilauswahl durch Antippen voraus. Kein passendes Bauteil bzw. keine Auswahl → keine Ausführung. Alle Teilflächen einer logischen IFC-ID werden gemeinsam geändert. Beim Wechsel der Auswahl wird eine offene Vorschau verworfen. Beim Schließen oder Modellwechsel werden alte Antworten nicht nachträglich angewendet.

Im Browser und bei lokaler IFC-Vorschau ohne verknüpftes App-Konto funktionieren zunächst die **vier festen Beispielbefehle vollständig lokal**. Freie Formulierungen über Gemini sind in diesem Schritt für gespeicherte Modelle in der nativen App integriert, nicht im Web.

## Erlaubter Umfang und Grenzen

Erlaubt sind nur `hide`, `color`, `reset`, mit Ziel `selected`, `walls`, `doors`, `windows`, `roofs`, `slabs` oder `all`. Farbwerte müssen `#RRGGBB` entsprechen. Wände werden anhand der numerischen IFC-Klassen erkannt, nicht anhand von Dateinamen. Dach/Decke bedeutet die entsprechende IFC-Klasse; ein als Deckenplatte exportiertes Dach wird nicht automatisch als Dach erraten.

Mehrfachbefehle, unklare/negierte Wünsche, Dateibearbeitung, Löschen des Modells, Räume/Geschosse und Lichtsteuerung sind nicht Teil dieser ersten Befehlsversion. Die manuelle Smart-Home-Simulation bleibt unabhängig verfügbar. KI kann Absichten falsch deuten; deshalb die konkret angezeigte Aktion und Trefferzahl prüfen.

Keine Serverdatei wird geschrieben, kein Revit geändert, keine Ansicht mit anderen Mitgliedern synchronisiert. Farben/Sichtbarkeit gelten bis zum Schließen dieses Viewers.

## API und Sicherheitsgrenzen

Bestehende authentifizierte Gebäude-Assistenten-API, zusätzliche Variante:

- GET `/api/v1/buildings/:id/assistant?mode=ifc-command`: statischer erlaubter Befehlsumfang und dessen `context_hash`, keine Modell-/Gebäudedaten für Google.
- POST gleicher Pfad, `X-Request-ID` UUID und `{mode:"ifc-command",question,consent:"yes",context_hash}`: Antwort enthält `command:{action,target,color,summary}`. `unsupported/none` beschreibt abgewiesene Wünsche, nie eine ausführbare Aktion.
- Serverseitige Mitgliedschaft, Quota, Wiederholschutz und Nachprüfung bleiben erhalten. Ungültige/zusätzliche Felder oder unzulässige Aktion/Farbe werden abgewiesen. Keine neue Datenbanktabelle.
- Modellbefehle werden nicht als Code ausgeführt: kein `eval`, kein Modellskript. WebKit nimmt nur Hauptframe-Nachrichten aus `d21ifc://viewer` an, begrenzt den Text und übergibt JSON über feste JavaScript-Aufrufe mit Datenargumenten. API- und Website-Schlüssel bleiben ausschließlich auf der nativen/Server-Seite.
- Die ermittelte IFC-ID-Liste bleibt lokal. Vorschlag und tatsächliche Ausführung sind getrennt; kein automatisches Ausführen einer Gemini-Antwort.

## Prüfungen

51 Backendtests inklusive strukturierter Befehle, Replay ohne neuen Anbieteraufruf, abgewiesener Löschaktion und unsupported-Antwort. Vier Three.js-/Befehlstests für Vorschau ohne Änderung, mehrteilige IFC-Elemente, Farben, Sichtbarkeit, Reset, veraltete Ziele und ungültige Befehle. Tatsächlicher WKWebView-Test mit synthetischer IFC-Wand: Farbe → Ausblenden → Reset, Trefferzahl 1 und separate Bestätigung; unerlaubtes Löschen bleibt gesperrt. Echte neutrale Gemini-Anfrage „Färbe alle Wände blau“ lieferte valides JSON. Keine privaten Modelle für diesen Anbietertest übertragen.

```sh
node --test ios/ifc-viewer/interactions.test.js ios/ifc-viewer/commands.test.js
swiftc 'ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCResource.swift' ios/ifc-viewer/tests/commands/main.swift -o /tmp/d21-ifc-command-smoke
/tmp/d21-ifc-command-smoke 'ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCAssets' ios/ifc-viewer/tests/wall.ifc.txt
```
