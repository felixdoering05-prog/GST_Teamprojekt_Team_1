# iPhone: geführte Gebäudeanlage und Gebäudemappe

Stand: 28. Oktober 2026.

## Bedienung

1. Auf der persönlichen Startseite „Neues Gebäude Schritt für Schritt anlegen“ wählen.
2. Name eingeben und Adresse ergänzen oder offen lassen.
3. Fotos aus der Fotomediathek oder aus Dateien auswählen. Fotos werden als JPEG vorbereitet.
4. Pläne als PDF oder DWG ergänzen oder diesen Schritt überspringen.
5. Übersicht prüfen und die Gebäudemappe öffnen.

Nach Name und Adresse wird das Gebäude auf dem Projektserver angelegt. Fotos und Pläne
werden erst nach Bestätigung des Servers als gespeichert angezeigt. In der Gebäudemappe
sind Fotos und andere Dokumente getrennt aufgeführt; Dateien können gesucht, geöffnet,
umbenannt und nach Bestätigung endgültig gelöscht werden. PDF-/Bildvorschau verwendet
QuickLook; DWG lässt sich an eine passende CAD-App weitergeben.

## Unterbrechen und fortsetzen

„Später fortsetzen“ erhält den Zwischenstand auf diesem iPhone. Die Startseite bietet
anschließend „Gespeicherten Entwurf fortsetzen“ an. Auch nach einem App-Neustart bleibt
der Schritt erhalten. Pro persönlichem Konto und Server gibt es einen neuen Gebäudeentwurf;
bestehende Gebäude haben getrennte Warteschlangen für weitere Uploads.

Ausgewählte Dateien werden in den geschützten App-Speicher kopiert. Fehlgeschlagene und
unterbrochene Übertragungen können ohne erneute Auswahl wiederholt werden. Eine bereits
vom Server bestätigte Datei wird durch dieselbe Upload-Kennung nicht erneut angelegt.

- Der Entwurf liegt lokal und wird nicht zwischen Geräten synchronisiert.
- iOS-Dateischutz und Ausschluss von Gerätebackups für lokale Entwurfskopien.
- Keine Passwörter oder Sitzungsschlüssel im Entwurf; diese bleiben im Schlüsselbund.
- App während des Uploads geöffnet lassen. Keine Hintergrundübertragung und kein automatischer Upload bei späterer Netzverbindung.
- Lokales Verwerfen entfernt nur den Entwurf und ausstehende Dateikopien. Bereits auf dem Server gespeicherte Gebäude und Dateien bleiben bestehen.
- Ein Konto-/Serverwechsel stoppt die Bearbeitung der bisherigen Upload-Liste.
- Dateilimits bleiben bei 25 MB je Datei und 250 MB je Konto; lokale Warteschlangen sind ebenfalls auf 250 MB begrenzt.

## Website und API

Die Base44-Serverausgabe bietet dieselben Dateiaktionen mit Vorschau, Umbenennen,
Löschbestätigung und Upload-Fortschritt. Im Browser bleibt eine fehlgeschlagene Dateiauswahl
bis zum Verlassen der Seite für einen Wiederholungsversuch erhalten; keine dauerhafte Browser-Offlineablage.

Alle API-Pfade liegen unter `/api/v1`, Zugriff wie bisher über `X-D21-Session`.

| Methode | Pfad / Header | Ergänzung |
| --- | --- | --- |
| POST | `/buildings` + optional `X-Request-ID` (UUID) | Wiederholte Erstellung desselben Entwurfs liefert dasselbe Gebäude dieses Kontos |
| POST | `/buildings/:id/documents` + optional `X-Upload-ID` (UUID) | Wiederholung mit identischen Bytes liefert vorhandene Metadaten; andere Bytes mit derselben Kennung ergeben `409` |
| PATCH | `/documents/:id` mit `{name}` | Eigenen Dateinamen ändern; passende Erweiterung erhalten |
| DELETE | `/documents/:id` | Eigene Datei endgültig entfernen und Speicherplatz freigeben |

Alte Clients können weiterhin ohne Wiederholungskennungen hochladen. Die additive
Migration ergänzt ausschließlich `creation_key`, `upload_key` und eindeutige Indizes;
vorhandene Konten, Gebäude und Dateien bleiben bestehen. Wiederholungen werden innerhalb
des Konto-Locks geprüft, damit die Speicherquote nicht doppelt belastet wird.

## Prüfung

- 27 Backendtests: bisherige Konten/Dateien/Profile/Twin-Daten plus Umbenennen/Löschen,
  fremde Konten, Endungsprüfung, wiederholte Uploads und wiederholte Gebäudeanlage.
- Swift-Prüfprogramm `ios/tests/WorkflowChecks.swift`: Entwurf wieder laden,
  Konto-/Servertrennung, unterbrochene Übertragung, stabile Kennungen, Dateigrenzen,
  fehlende Dateien, defekter Entwurf und gezieltes Entfernen lokaler Entwürfe.
- Debug-Simulator-Build, Website-Build und ESLint.
- Simulator mit lokalen Beispieldaten: Name/Adresse → später fortsetzen → App-Neustart →
  Wiederaufnahme → Foto/Plan → Übersicht → Gebäudemappe → Umbenennen → PDF-Vorschau.
- Lokaler Browser mit separater Testdatenbank: Dateivorschau, Umbenennen und Löschbestätigung.

Simulator-Prüfung ohne echte Zugänge: Debug-App mit `-D21WorkflowPreview` starten.
Dieser ausdrücklich aktivierte Testmodus verwendet ausschließlich lokale Antworten,
keine echten Konten und keinen Netzwerkzugriff; er wird nicht in Release-Builds kompiliert.

Swift-Prüfung vom Repository aus:

```sh
xcrun swiftc -module-cache-path /tmp/d21-workflow-module-cache \
  'ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/WorkflowModels.swift' \
  ios/tests/WorkflowChecks.swift -o /tmp/d21-workflow-checks
/tmp/d21-workflow-checks
```
