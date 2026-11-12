# Gebäude-Dashboard, KI-Chat und Gebäudeverwaltung – 12. November 2026

Kandidat 1.0.103 (103). Das Design orientiert sich an vertrauten Chatmustern, verwendet aber eigene Farben, Texte und Symbole.

- Ruhiger Kopfbereich mit Gebäude und Hinweis auf den privaten Chat.
- Großzügiger Gesprächsbereich: eigene Nachrichten als dezente Sprechblasen, Antworten ohne zusätzliche große Kartenrahmen.
- Fester mehrzeiliger Eingabebereich am unteren Bildschirmrand, auch bei eingeblendeter Tastatur.
- Kurze Einstiegsvorschläge füllen nur das Eingabefeld; sie senden keine Anfrage ohne bewussten Tipp.
- Plus-Menü bündelt Fragen/Modellvorschläge und IFC-Auswahl. Der aktive Modellkontext bleibt sichtbar.
- Modelländerungen sind im Eingabebereich ausdrücklich markiert und behalten Vorschau und Bestätigung vor dem gemeinsamen Speichern.
- Eine ausstehende Frage wird sofort angezeigt. „Antwort wird erstellt“ bezeichnet das Warten auf die vollständige Serverantwort; es wird kein Streaming vorgetäuscht.
- Antworten lassen sich markieren oder mit einem Tipp kopieren. Fehlermeldungen und Neuladen bleiben im Gespräch sichtbar.
- Datenschutz, übertragene Daten, Kontofreigabe und Nutzungslimit stehen gebündelt unter dem Info-Symbol. Bestehende Kontofreigaben, Server-Endpunkte, Zugriffsrechte und Verlaufsspeicherung bleiben erhalten.

Keine echte Live-Sprache und keine serverseitige Streaming-Implementierung in diesem Schritt. Kein neuer Verlauf-/Löschen-Knopf, der einen weiterhin auf dem Server gespeicherten Chat nur verstecken würde.

## Prüfstand

Simulator-Build; visuelle Prüfung mit ausschließlich synthetischen, lokalen Gesprächsdaten. Der temporäre Vorschau-Einstieg wird vor dem Commit entfernt. Kein KI-Aufruf, keine Geräteschaltung, keine Änderung an privaten Chats für die Gestaltung erforderlich.

## Vorheriger Stand 102

PR #123 ist zusammengeführt. Die Mobile-API ist aktiv: ohne Website-Passwort liefern geschützte Endpunkte 401; der vorhandene Testaccount kann sich anmelden und seine Gebäude abrufen. Neue Diagnosesitzung anschließend abgemeldet. Normale Webseite bleibt mit Website-Passwort geschützt. Version 1.0.102 (102) ist mit persönlicher Signierung auf Felix' iPhone installiert und erfolgreich gestartet; kein TestFlight-Upload. Datenbankcontainer unverändert.


## Gebäude direkt öffnen

Ein Tipp auf die Gebäudekarte öffnet direkt das Gebäude-Dashboard, ohne vorgeschaltete Werkzeugauswahl. Die Startkarte wurde verkleinert und die lange Schritt-/Textübersicht aus dem normalen Gebäude-Einstieg entfernt. Eine kompakte Symbolnavigation führt zu Start, Modell, Geräten, KI und Teamchat; der aktive Bereich wechselt mit einer dezenten Animation, bei „Bewegung reduzieren“ ohne Animation.

Das Dashboard zeigt maximal drei Diagramme aus der bestehenden gebäudebezogenen Telemetrie: für jede Messgröße wird ein einzelner Sensor mit gültigen Daten verwendet und benannt; Sensoren werden nicht gemittelt. Sind Energiezeiträume vorhanden, erscheinen maximal zwei Sensorkurven plus ein Verbrauchsdiagramm. Energieeinheiten und Medien werden nicht vermischt oder summiert. Es werden geladene Ausschnitte dargestellt, ältere Werte gekennzeichnet und keine fehlenden Messungen erfunden. Ohne Daten gibt es eine Einrichtung-/Importaktion. Die Debug-Vorschau zeigt ausdrücklich fiktive Daten; im Release werden nur als `real` gespeicherte Werte geladen, deren Echtheit nicht unabhängig bestätigt ist.

Symbolkarten bündeln Geräte, KI, Dateien, Wetter-Heatmap, Energie und Sensorik. Namen/Adresse und Freigaben stehen unter dem Drei-Punkte-Menü; sie nehmen nicht mehr die ganze Startansicht ein.

## Gebäude löschen

Unter Gebäude verwalten kann nur der Eigentümer nach ausdrücklicher zweiter Bestätigung ein Gebäude löschen. Der Server prüft die Kontositzung und Eigentümerschaft unabhängig von der App. Dateien, Mitgliedschaften, Nachrichten und alle mit `ON DELETE CASCADE` angebundenen Gebäudedaten werden entfernt. KI-Antwortcaches werden geleert; nichtinhaltliche Text-KI-Nutzungsnachweise und Plan-Auftragskennungen der letzten 24 Stunden bleiben erhalten, damit Löschen nicht die KI-Limits zurücksetzt. Eine verspätete KI-Antwort darf keinen Cache mit gelöschter Gebäudezuordnung füllen. Fremde Gebäude bleiben erhalten. Physische Geräte in Home Assistant, heruntergeladene Kopien, Anbieterdaten und historische Backups werden dadurch nicht gelöscht.

Die App entfernt nach bestätigter Serverlöschung nur lokale Entwürfe dieses Gebäudes. Tests verwenden ausschließlich isolierte Konten und Gebäude; keine produktiven Gebäude wurden gelöscht.

## Abschließende Prüfung

141 Backendtests erfolgreich, inklusive Eigentümer-/Mitgliedsgrenze, ausdrücklicher Bestätigung, gezielter Kaskaden und geleerter KI-Caches bei erhaltenem Nutzungseintrag. Simulator-Build, signierter iPhone-Release-Build sowie visuelle Prüfung mit lokalen Debug-Daten. Die umfangreichere Änderung bleibt ein gemeinsamer Kandidat 103; die zuvor ausdrücklich freigegebene Version 102 bleibt auf dem iPhone, bis 103 veröffentlicht/installiert wird.
