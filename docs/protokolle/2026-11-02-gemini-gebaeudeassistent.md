# Gemini-Gebäude-Assistent

02.11.2026 · Technisches Entwicklungsprotokoll.

Felix hat nach Einrichtung eines eigenen kostenlosen Gemini-Projekts den Gebäude-Assistenten beauftragt. Schlüssel ausschließlich außerhalb des Git-Repositories auf dem Server. Die Infrastrukturplanung wurde korrigiert: Benjamins Gaming-PC entfällt; Uni-/Cloud-Rechner und sichere Revit-Anbindung bleiben offen.

Native App: eigener Assistent aus der Gebäudeübersicht, Beispielfragen, Datenvorschau, expliziter Versand und klar getrennte Antworten. Kein Zugriff auf Teamchat oder automatische Übertragung von Plänen/IFC-Inhalten. API: bestehende Konten-/Mitgliedschaftsprüfung, serverseitiger Kontext, Datenstand-Kennung, dauerhafte Anfrage-/Kontingentverwaltung, Wiederholschutz, begrenzte Antworten und sichere Fehler.

Die vorherige neutrale Gemini-Verbindungsprüfung antwortete erfolgreich mit `D21_OK`. Für die Implementierung werden Datenbank-/Anbieter-Tests und Simulator-Build verwendet; End-to-End-Tests senden ausschließlich synthetische Testdaten. Keine fachliche Modell- oder Plananalyse abgenommen. [Bedienung und Vertrag](../gemini-gebaeudeassistent.md).

Validierung vor Veröffentlichung: 50 Backendtests bestanden. Repository- und originales Xcode-Projekt erfolgreich für den Simulator gebaut; private Signierung unverändert. Im Simulator mit lokalen Debug-Daten geprüft: Datenvorschau, deaktivierter Versand ohne Bestätigung und Antwortdarstellung nach bewusstem Senden. Bestehende Datenbank vor Deployment gesichert; keine echten Teamdateien für die Tests verwendet.
