# IFC-Viewer für die iOS-App – Version 1

Stand: 28. Oktober 2026.

## Benutzung

In der App den Tab **IFC-Viewer** öffnen, alternativ in einer Gebäudemappe **IFC-Modell lokal öffnen**. Eine unkomprimierte `.ifc`-Datei aus der Dateien-App auswählen. In Revit dazu einen IFC2x3- oder IFC4-Export erstellen; RVT, DWG und IFCZIP lassen sich hier nicht direkt anzeigen.

- Ein Finger dreht das Modell, zwei Finger zoomen und verschieben.
- **Gesamtansicht** setzt die Kamera zurück, **Draufsicht** zeigt das Modell von oben.
- Ein Bauteil antippen: Markierung, Name, IFC-Typ, interne IFC-ID und GlobalId.
- **Datei öffnen** ersetzt das aktuelle Modell.

Die erste Version verarbeitet Dateien **lokal auf dem Gerät**. Sie lädt keine IFC-Datei hoch, verändert keine Gebäudedaten und verwendet weder Ollama noch Benjamins PC. Die bestehende Server-Upload-API für Bilder/PDF/DWG bleibt unverändert. Serverablage und Zuordnung eines IFC-Modells zu einem Gebäude sind ein nächster Schritt und brauchen einen abgestimmten API-Vertrag.

## Grenzen

Maximal 20 MiB pro Datei, 1.000.000 Geometrie-Vertices und 10.000 Teilgeometrien. Das sind Schutzgrenzen, keine Zusage, dass jedes Modell darunter auf jedem iPhone darstellbar ist. Geometrie wird zunächst synchron verarbeitet; große Dateien können die Viewer-Anzeige während des Einlesens anhalten. Bei Speicherverlust des WebKit-Prozesses muss ein kleinerer Ausschnitt geöffnet werden. Keine Modellbearbeitung, Schnittebenen, Geschossfilter oder vollständige IFC-Property-Sets. IFC4X3 und Spezialgeometrien wurden nicht validiert.

Die App kopiert die ausgewählte Datei in ihren temporären, mit Dateischutz versehenen Bereich. Die Kopien bleiben für die Lebensdauer der Viewer-Ansicht verfügbar und werden beim Freigeben der Ansicht entfernt. Nach einem Prozessabbruch räumt iOS temporäre Dateien nach seinen Regeln auf. Der Viewer nutzt einen nicht persistenten WKWebView, eine feste lokale Ressourcenliste und eine Content-Security-Policy ohne externe Netzwerkziele; Konto-Zugangsdaten werden nicht an JavaScript übergeben.

## Build und Abhängigkeiten

Der Xcode-Projektordner enthält fertige Offline-Ressourcen unter `IFCAssets/`. Zum normalen iOS-Build werden weder npm noch Internet benötigt. Nach Änderungen an `ios/ifc-viewer/` auf einem Entwicklungsrechner ausführen:

```sh
cd ios/ifc-viewer
npm ci
npm run build
```

Die großen JavaScript-/WASM-Dateien werden beim Build mit Apples LZFSE komprimiert und erst im lokalen URL-Handler entpackt. Der Ressourcen-Build benötigt deshalb macOS/Swift; Xcode kann die fertigen Ressourcen direkt verwenden.

Quellen **und** neu erzeugte `IFCAssets` gemeinsam committen. `package-lock.json` fixiert die Abhängigkeiten: Three.js 0.186.1 (MIT), web-ifc 0.0.78 (MPL-2.0), esbuild 0.28.2 (Build-Werkzeug). Die Lizenztexte liegen neben den Ressourcen. Upstream-Quellcode: https://github.com/ThatOpen/engine_web-ifc (Release 0.0.78) und https://github.com/mrdoob/three.js (r186). Der IFC-Parser wurde nicht verändert.

## Prüfen

Signierter Debug-Build für den iOS-Simulator. Außerdem native WebKit-Integration auf macOS mit derselben lokalen URL-Scheme-Ladung, WebAssembly-Parser, einem selbst erstellten IFC4-Wandmodell, Kamera-Aktionen, Bauteilauswahl und ungültiger Eingabedatei:

```sh
swiftc "ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCResource.swift" ios/ifc-viewer/tests/main.swift -o /tmp/d21-ifc-smoke -framework WebKit -framework AppKit
/tmp/d21-ifc-smoke "$PWD/ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCAssets" "$PWD/ios/ifc-viewer/tests/wall.ifc.txt"
```

Der Test schreibt eine Vorschau nach `/tmp/d21-ifc-viewer.png`. Echte D21-Revit-Exporte und das physische iPhone müssen zusätzlich getestet werden; der WebKit-Test auf dem Mac ersetzt diese Prüfung nicht.
