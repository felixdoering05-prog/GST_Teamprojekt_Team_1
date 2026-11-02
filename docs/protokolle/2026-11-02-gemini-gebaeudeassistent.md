# Gemini-Gebäude-Assistent

02.11.2026 · Technisches Entwicklungsprotokoll.

Felix hat nach Einrichtung eines eigenen kostenlosen Gemini-Projekts den Gebäude-Assistenten beauftragt. Schlüssel ausschließlich außerhalb des Git-Repositories auf dem Server. Die Infrastrukturplanung wurde korrigiert: Benjamins Gaming-PC entfällt; Uni-/Cloud-Rechner und sichere Revit-Anbindung bleiben offen.

Native App: eigener Assistent aus der Gebäudeübersicht, Beispielfragen, Datenvorschau, expliziter Versand und klar getrennte Antworten. Kein Zugriff auf Teamchat oder automatische Übertragung von Plänen/IFC-Inhalten. API: bestehende Konten-/Mitgliedschaftsprüfung, serverseitiger Kontext, Datenstand-Kennung, dauerhafte Anfrage-/Kontingentverwaltung, Wiederholschutz, begrenzte Antworten und sichere Fehler.

Die vorherige neutrale Gemini-Verbindungsprüfung antwortete erfolgreich mit `D21_OK`. Für die Implementierung werden Datenbank-/Anbieter-Tests und Simulator-Build verwendet; End-to-End-Tests senden ausschließlich synthetische Testdaten. Keine fachliche Modell- oder Plananalyse abgenommen. [Bedienung und Vertrag](../gemini-gebaeudeassistent.md).

Validierung vor Veröffentlichung: 50 Backendtests bestanden. Repository- und originales Xcode-Projekt erfolgreich für den Simulator gebaut; private Signierung unverändert. Im Simulator mit lokalen Debug-Daten geprüft: Datenvorschau, deaktivierter Versand ohne Bestätigung und Antwortdarstellung nach bewusstem Senden. Bestehende Datenbank vor Deployment gesichert; keine echten Teamdateien für die Tests verwendet.

## Produktive Prüfung

PR #58 wurde zusammengeführt und über `d21-deploy` veröffentlicht. Produktiver Code-Stand: `2c6a19c665e1701abdbd42f2ddfdd4bd12d009ff`. Der Assistent wurde im bestehenden Testkonto mit einem ausschließlich synthetischen, eigens dafür angelegten Gebäude geprüft: Status und Antwort HTTP 200, Modell `gemini-3.5-flash-lite`, nicht leere Antwort. Gemini stellte korrekt fest, dass keine Raumzahl bekannt ist. Derselbe Request lieferte beim erneuten Abruf `cached: true` und dieselbe Antwort. Das selbst erzeugte Testgebäude wurde anschließend entfernt; die Kontingentbuchung blieb erhalten. Keine echten Teamdateien oder Chatnachrichten übertragen.

API-Gesundheitsprüfung erfolgreich. Vorher/nachher unverändert: 3 Konten, 2 Gebäude, 2 Dateien und 2 Teamchat-Nachrichten. Datenbank-Container unverändert seit 27.10.2026; weder DB-Container noch Volume ersetzt. n8n und Cloudflare-Tunnel laufen weiter. Eine Aktualisierung dieser Dokumentation erfordert kein erneutes App-Deployment.
