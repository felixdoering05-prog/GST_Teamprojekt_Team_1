# IFC-Viewer und zentrale Modellablage für die iOS-App

Stand: 28. Oktober 2026.

## Benutzung

In der App den Tab **IFC-Viewer** öffnen. Unter dem jeweiligen Gebäude **IFC hochladen / Dateien verwalten** wählen und eine unkomprimierte `.ifc`-Datei aus der Dateien-App hochladen. Alternativ beim Anlegen eines Gebäudes im Schritt **Pläne** eine IFC-Datei auswählen. Nach der Serverbestätigung erscheint das Modell in der Gebäudemappe und im IFC-Tab; dort antippen, um es herunterzuladen und als 3D-Modell zu öffnen. Die Liste lässt sich durch Herunterziehen aktualisieren.

Auch auf der Website kann unter Gebäude → Dateien eine IFC-Datei hochgeladen, heruntergeladen, umbenannt und gelöscht werden. Die 3D-Ansicht ist zunächst in der iOS-App verfügbar. Unter **Lokale IFC-Datei öffnen** bleibt eine Vorschau ohne Upload möglich. In Revit dazu einen IFC2x3- oder IFC4-Export erstellen; RVT, DWG und IFCZIP lassen sich hier nicht direkt anzeigen.

- Ein Finger dreht das Modell, zwei Finger zoomen und verschieben.
- **Gesamtansicht** setzt die Kamera zurück, **Draufsicht** zeigt das Modell von oben.
- Ein Bauteil antippen: Markierung, Name, IFC-Typ, interne IFC-ID und GlobalId.
- **Datei öffnen** ersetzt das aktuelle Modell.

## Serverablage und Zugriff

Das Modell wird über die bestehende Dokument-API als Binärdatei in PostgreSQL (`app_documents.content`, BYTEA) abgelegt und einem Gebäude zugeordnet. Die Metadaten bleiben zusammen mit dem Modell im bestehenden Volume `d21_dbdata`. Es gibt keine neue Tabelle und keinen Datenbankumbau. Der Upload-Vertrag wird um `.ifc` / `application/x-step` erweitert. Bestehende Bilder/PDF/DWG bleiben unverändert.

- `POST /api/v1/buildings/:id/documents`: rohe Bytes, `Content-Type: application/octet-stream`, URL-kodierter `X-File-Name`, optional dieselbe UUID in `X-Upload-ID` für wiederholbare Uploads.
- `GET /api/v1/buildings/:id/documents`: Metadaten inklusive IFC-Dateien.
- `GET /api/v1/documents/:id`: geschützter Download, `application/x-step`, Attachment, `private, no-store`.
- Bestehende PATCH-/DELETE-Routen unterstützen Umbenennen mit beibehaltener `.ifc`-Endung und Löschen.

Die bisherige persönliche Sitzung und der vorgeschaltete Website-Zugang gelten weiter. Zugriff ist nur im Konto des zugehörigen Gebäudes möglich; andere Teamkonten haben keine automatische Freigabe. Kein öffentlicher Modell-Link und kein direkter Datenbankzugang aus der App. IFC nutzt dieselbe Kontospeichergrenze von 250 MiB; zusätzlich maximal 20 MiB je IFC-Datei. Signatur, Schema IFC2X3/IFC4 und Abschlusskennung werden geprüft. Das ist eine Formatkennung, keine vollständige serverseitige Geometrieprüfung.

**Der Server speichert und liefert Modelle; die 3D-Berechnung läuft im Viewer auf dem iPhone.** Es wird kein Modell auf dem VPS gerendert und weder Ollama noch Revit benötigt. Nach einem App-Neustart kann das Modell erneut vom Server geladen werden. Zum Öffnen eines Servermodells ist eine Internetverbindung nötig; es gibt noch keinen dauerhaften Offline-Download-Manager.

## Grenzen

Maximal 20 MiB pro Datei, 1.000.000 Geometrie-Vertices und 10.000 Teilgeometrien. Das sind Schutzgrenzen, keine Zusage, dass jedes Modell darunter auf jedem iPhone darstellbar ist. Geometrie wird zunächst synchron verarbeitet; große Dateien können die Viewer-Anzeige während des Einlesens anhalten. Bei Speicherverlust des WebKit-Prozesses muss ein kleinerer Ausschnitt geöffnet werden. Keine Modellbearbeitung, Schnittebenen, Geschossfilter oder vollständige IFC-Property-Sets. IFC4X3 und Spezialgeometrien wurden nicht validiert.

Für die lokale Vorschau kopiert die App die ausgewählte Datei in ihren temporären, mit Dateischutz versehenen Bereich. Heruntergeladene Servermodelle werden ebenfalls temporär mit Dateischutz gespeichert und beim Schließen ihrer Vorschau entfernt. Lokale Kopien bleiben für die Lebensdauer der Viewer-Ansicht verfügbar und werden beim Freigeben der Ansicht entfernt. Nach einem Prozessabbruch räumt iOS temporäre Dateien nach seinen Regeln auf. Der Viewer nutzt einen nicht persistenten WKWebView, eine feste lokale Ressourcenliste und eine Content-Security-Policy ohne externe Netzwerkziele; Konto-Zugangsdaten werden nicht an JavaScript übergeben.

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

Die Backendtests prüfen zusätzlich IFC-Upload, Listen/Download bytegleich, erneute Initialisierung ohne Datenverlust, wiederholbare Uploads, fremde Konten, Umbenennen/Löschen sowie ungültige Signaturen, Schema und die 20-MiB-Grenze.

## Modellbibliothek mit Suche und Wiederholungen

Der IFC-Tab zeigt Modellkarten mit Dateiname, zugehörigem Gebäude, Dateigröße und „In 3D öffnen“. Die Suche berücksichtigt Datei- und Gebäudenamen sowie Groß-/Kleinschreibung und Akzente. Die Anzeige unterscheidet zwischen fehlenden Gebäuden, einer leeren Modellliste und fehlenden Suchergebnissen.

Beim Aktualisieren bleiben erfolgreiche bisherige Ergebnisse sichtbar. Jedes Gebäude wird unabhängig behandelt: Fällt eine Abfrage aus, erscheint eine Meldung mit gezieltem „Erneut versuchen“; die übrigen Gebäude werden trotzdem geladen. Ein fehlgeschlagener Abruf der Gebäudeliste löscht den bisherigen Stand nicht. Gelöschte Gebäude werden nach einem erfolgreichen Abruf aus dem lokalen Anzeigecache entfernt. Konto- und Serverwechsel leeren diesen Cache; verspätete Antworten eines alten Kontos/Servers werden verworfen. Der Cache liegt ausschließlich im Arbeitsspeicher und ist keine Offline-Ablage der Modelle.

Beim Modell-Download sind weitere Öffnen-Aktionen gesperrt. Fehler erscheinen mit einer erneuten Öffnen-Aktion. Beim Verlassen der Übersicht wird ein laufender Download abgebrochen. Datei-Uploads, Kontorechte, API-Verträge und der eigentliche 3D-Viewer bleiben unverändert.

Automatisierte Prüfung der Listenlogik auf dem Mac:

```sh
swiftc -parse-as-library \
  'ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/WorkflowModels.swift' \
  'ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/IFCLibraryState.swift' \
  ios/tests/IFCLibraryChecks.swift -o /tmp/d21-ifc-library-checks
/tmp/d21-ifc-library-checks
```

### Lokale Vorschau für Entwicklung

Nur Debug-Builds: `-D21WorkflowPreview -D21IFCPreview` verwendet lokale Mock-Antworten und startet im IFC-Tab. Der sichtbare Hinweis „VORSCHAU · Lokale Testdaten“ kennzeichnet die Daten. Die drei Beispielmodelle verwenden dieselbe selbst erstellte Testwand und bewusst synthetische Dateigrößen, keine echten D21-Modelle.

Zusätzliche Startargumente:

- `-D21IFCEmpty`: Gebäude ohne Modelle.
- `-D21IFCNoBuildings`: kein Gebäude vorhanden.
- `-D21IFCBuildingFail`: ein Gebäude kann nicht geladen werden.
- `-D21IFCListFail`: die Gebäudeliste kann nicht geladen werden.
- `-D21IFCFailPreview`: der Download des zweiten Modells schlägt fehl.

Ohne den expliziten Workflow-Vorschau-Modus sind diese Optionen inaktiv; der gesamte Mock-Code ist aus Release-Builds ausgeschlossen. Für Tests einen separaten Simulator-Bundle-Identifier verwenden, damit persönliche Testinstallationen und deren Schlüsselbund unberührt bleiben.
