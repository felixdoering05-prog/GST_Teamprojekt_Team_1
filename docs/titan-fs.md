# Titan FS – Kommandozentrale und Gebäudemeldungen

## Ausgangspunkt

Der Feature-Branch basiert auf `origin/main` nach PR #179 (`585d71e`). Die Anwendung besteht aus der selbst betriebenen React-/Vite-Oberfläche in `dashboard/base44-frontend`, dem Express-Backend mit PostgreSQL und der nativen SwiftUI-App. Der iPhone-Mängelmelder speicherte bereits Meldungen, Fotos und IFC-Bezüge in `app_building_issues`. Die Web-App zeigte im Bereich „Meldungen“ bisher die Sensorwarnungen aus dem separaten Grenzwert-Prüflauf.

## Änderungen im Repository

| Bereich | Komponenten und Dateien |
| --- | --- |
| Sichtbarer Name | HTML-Metadaten, Webmanifest, Authentifizierung, Navigation, Datenschutzseite, Absender der Passwort-Mail, iOS-Startseite, Home-Screen-Name, Widget und Siri-App-Name |
| Dashboard | `pages/Dashboard.jsx`, `components/dashboard/WidgetBoard.jsx`, `ProjectWidgets.jsx` und `DashboardModel.jsx` im Web-Frontend |
| Darstellung | `lib/Appearance.jsx`, `AppearanceCard.jsx`, `titan.css`, iOS `AppAppearance.swift` und Profil in `ContentView.swift` |
| Gebäudemeldungen | `dashboard/backend/src/issues.js`, Web-Komponente `BuildingIssues.jsx` und iOS `BuildingIssues.swift` mit `IssueOutbox.swift` |
| IFC-Anzeige | `IFCModelFrame.jsx`, Web-Viewer `viewer.js` und `issue-location.js` |
| Kontoeinstellungen | `dashboard/backend/src/ui-preferences.js` mit `widget-catalog.js` |
| Prüfungen | `dashboard/backend/test/issues.test.js`, `ui-preferences.test.js` und `dashboard/base44-frontend/ifc-viewer/issue-location.test.js` |

Das Dashboard bietet 15 Widgets. Im Bearbeitungsmodus lässt sich die Reihenfolge per Ziehgriff, Tastatur oder Richtungstasten ändern. Die Größen Klein, Mittel und Breit bestimmen die Breite im Raster. Bei schmalen Viewports stapeln sich die Widgets. Das Meldungs-Widget kann nach Status filtern. Für das BIM-Widget lässt sich ein freigegebenes Gebäudemodell auswählen. „Standard wiederherstellen“ setzt das Layout nach dem Speichern auf die Standardkonfiguration zurück. Sensorik und Auswertungen verwenden weiterhin ihre vorhandenen Quellen.

Darstellung und Layout werden pro Konto gespeichert. Web-Schriftstufen entsprechen 90, 100, 115 und 130 Prozent. iOS überträgt diese Auswahl auf die benachbarten Dynamic-Type-Stufen des Geräts und berücksichtigt die vorhandene Bedienungshilfengröße. Beide Clients bieten Hell, Dunkel und System. Der lokale Cache ist kontobezogen und gleicht zwischengespeicherte Änderungen beim erneuten Laden der Einstellungen mit der Serverrevision ab.

Der separate Projektvortrag unter `/projekt/` und die Home-Assistant-Integration behalten ihre jeweiligen Projektnamen. Das Web-Favicon und das iOS-App-Symbol verwenden weiterhin ihre Gebäudemotive. Die vorhandene iOS-Projektgrafik bleibt als Asset erhalten.

## Schema und Kompatibilität

Das Backend führt die additiven Migrationen während der bestehenden Initialisierung aus.

| Objekt | Ergänzung |
| --- | --- |
| `app_ui_preferences` | `theme` mit Vorgabe `system`, `font_scale` mit Vorgabe 100 und `dashboard_layout` als optionales JSONB. Die vorhandene Darstellungseinstellung und ihre Revision bleiben erhalten. |
| `app_building_issues` | Optionale Priorität und optionale IFC-Express-ID des Bauteils. Bei vorhandenen Meldungen bleibt die Priorität zunächst „Nicht festgelegt“. |
| `app_issue_history` | Neue Einträge für Erfassung, Änderungen und Foto-Uploads. Erfasst werden Revision, Zeitpunkt, handelndes Konto und betroffene Felder. Aus Datenschutzgründen werden keine früheren Beschreibungstexte oder Fotos dupliziert. Der Verlauf folgt dem Löschverhalten der Meldung. |

`GET/PATCH /api/v1/profile/ui?view=appearance` liefert die erweiterten Kontoeinstellungen. Aufrufe ohne den Parameter behalten die bisherige Antwort mit `presentation_mode` und `revision`. Alte iOS-Versionen können weiterhin Meldungen ohne Priorität und Bauteilbezug senden. Modelle, Dokumente, Rollen, Bundle-IDs, Deep Links, API-Pfade und Datenbank-Volumes bleiben nutzbar. Die Migration verändert keine vorhandenen Meldungs- oder Dokumentinhalte. Frühere Bearbeitungsschritte werden aus dem aktuellen Stand nicht rekonstruiert.

## Datenfluss iPhone → PostgreSQL → Web

1. Das iPhone schreibt den Entwurf samt unveränderlicher Anfrage-UUID und optionalem komprimierten Foto in eine iOS-geschützte lokale Datei für dieses Konto und diesen Server. Die Warteschlange ist vom iCloud-Gerätebackup ausgeschlossen.
2. `POST /buildings/:id/issues` verwendet die vorhandene Authentifizierung und Gebäudefreigabe. Wiederholte Übertragungen mit derselben Anfragekennung liefern die bestehende Meldung. Sobald die API eine Meldungs-ID bestätigt, speichert die App diese vor dem Foto-Upload. Ein identischer wiederholter Foto-Upload erzeugt keinen zusätzlichen Verlaufseintrag.
3. Solange die App im Vordergrund ist, versucht sie ausstehende Übertragungen regelmäßig erneut. „Lokal gespeichert“ zeigt die Warteschlange, „Synchronisiert“ die vollständige Übertragung und „Fehler“ einen Eintrag mit manueller Wiederholung. Ein Teilupload kann bereits in der Web-App sichtbar sein, während das Foto noch in der Warteschlange steht.
4. Die Web-App aktualisiert Liste, Details und Meldungs-Widgets bei geöffneter Ansicht alle acht Sekunden. Ein Fensterfokus prüft erneut. Die Übersicht nutzt `GET /issues` mit serverseitigen Filtern und Cursor. Details und Fotos verwenden die geschützten gebäudespezifischen Endpunkte. Eigentümer und angenommene Gebäudemitglieder sehen nur ihre freigegebenen Gebäudemeldungen.

Die native Warteschlange setzt ein bekanntes Gebäude in einer bereits geöffneten Sitzung voraus. Beim Kaltstart prüft die bestehende App die Anmeldung am Server. Ausstehende Entwürfe bleiben bis zur nächsten Anmeldung mit demselben Konto und Server erhalten.

## Räumliche Zuordnung

Die Meldung verweist auf das Gebäude und bei IFC-Zuordnung auf ein Dokument desselben Gebäudes. `space_id` und `element_id` sind Express-IDs innerhalb genau dieser IFC-Datei. Der Web-Viewer liest die Raum- und Geschossbeziehungen aus dem IFC. Ein gültiger Bauteilbezug hebt die vorhandene Geometrie hervor. Ein IFC-Raum mit Geometrie wird als Fläche hervorgehoben.

Ein erfasster Punkt wird mit der Modelltransformation des Web-Viewers dargestellt. IFC-Geometrie und Punkt verwenden das bereits auf dem iPhone verwendete, durch web-ifc normierte Modellkoordinatensystem. Der Viewer wählt das über den IFC-Bezug ermittelte Geschoss oder ein anhand der Punkthöhe eindeutig passendes Geschoss. Die nummerierte Markierung zeigt genau den gespeicherten Punkt und trägt die Meldungs-ID. Ein freier Raumtext oder eine reine Raumzuordnung erzeugt keinen Punkt. Koordinaten außerhalb des Modellbereichs werden als nicht darstellbar angezeigt. Freie PDF-Pläne haben gegenwärtig keine gespeicherte Verknüpfung mit Meldungskoordinaten. Der iPhone-Mängelmelder erfasst Punkte und IFC-Räume. Für zusätzlich hinterlegte Bauteil-IDs unterstützt die API die direkte Zuordnung.

## Abnahme

- Automatisiert werden Migrationen, Kompatibilität der alten Darstellungs-API, Revisionen, Kontotrennung, Dubletten, Fotos, Protokollierung, Gebäudezugriff und IFC-Geschossauflösung geprüft.
- Der lokale Chromium-Test gegen eine kurzlebige Datenbank hat das Konfigurieren und Wiederherstellen des Layouts, die Darstellung nach erneuter Anmeldung, 130 Prozent bei 393 px Breite, das Polling, den IFC-Marker, Geschoss und Bauteil, eine Meldung ohne Position sowie abgelehnten Fremdzugriff geprüft. Die mobile API wurde mit einem eigenen Testkonto angesprochen.
- GitHub Actions prüft Backend, den gebündelten iOS-Viewer und den SwiftUI-Simulator-Build. Die Übertragung nach einem Offline-Wechsel, Gerätewiederanmeldung und Lesbarkeit mit Bedienungshilfegrößen sind auf einem echten iPhone zu prüfen.
- Für eine fachliche Abnahme mit Echtdaten sind ein autorisierter Testserver und die zugehörige IFC-Datei erforderlich. Der Feature-Branch dient der Prüfung vor der Veröffentlichung.
