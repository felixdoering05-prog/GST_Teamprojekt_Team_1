# n8n: GitHub-Meldungen und Erreichbarkeitsprüfung

Datum: 02.11.2026. Technisches Arbeitsprotokoll, kein Team-Sitzungsprotokoll.

Felix hat die Einrichtung der ersten zwei n8n-Abläufe beauftragt und als Ziel zunächst den n8n-Ausführungsverlauf gewählt. Keine WhatsApp-/Mail-Nachrichten beauftragt.

## Umsetzung

- Separater n8n-Dienst im bestehenden Docker-Compose-Projekt, eigenes Volume `d21_n8ndata`, Port 5678 nur an 127.0.0.1. Zugang über SSH-Portweiterleitung und eigenständiges n8n-Konto.
- Offizielles Image 2.45.7 auf Digest fixiert. Begrenzte Ressourcen (768 MiB/0,75 CPU), eine Ausführung gleichzeitig, automatische Bereinigung nach 72 Stunden bzw. 5.000 Ausführungen.
- GitHub-Poll alle fünf Minuten: Aufgaben, Zuständigkeiten und PR-Status im öffentlichen Hauptrepository. Erster Lauf speichert den Ausgangsstand, spätere Läufe protokollieren Änderungen. Keine GitHub-Schreibrechte.
- Alle zwei Minuten interner App-Gesundheitscheck sowie öffentlicher HTTPS-Eingang mit erwarteter 401 wegen Passwortschutz. Zustandswechsel, fortdauernde Störungen und Prüflücken werden im Output gespeichert.
- Erstimport/Veröffentlichung über versionierte Startlogik; spätere Neustarts erhalten Workflow-Daten und Editoränderungen.

## Prüfung und Grenzen

Vorbereitung: Server mit 3.868 MiB RAM, davon ca. 2.902 MiB verfügbar, ca. 106 GiB frei. Bestehender App-Healthcheck antwortete mit `status: ok`. Laufende App-/DB-Container wurden dabei nicht geändert.

Fünf lokale Tests prüfen Ausgangsstand, Zuweisung, neue Aufgaben, PR-Merge, Wiederholungen, unvollständige/zu große GitHub-Antworten, Netzfehler, öffentliche 502, Wiederherstellung, Prüflücken und die tatsächlich generierten Code-Knoten.

Der n8n-Verlauf ist kein dauerhaftes Archiv. Ein kompletter VPS-Ausfall benötigt eine unabhängige externe Überwachung für sofortige Warnungen. Der wechselnde Cloudflare-Testlink muss gepflegt werden. Kein Revit/Ollama-Tunnel, keine KI-Verarbeitung und keine neue App-API/Datenbanktabelle eingerichtet.

## Laufzeitprüfung vor Deployment

In einem separaten, vorübergehenden Testcontainer ohne veröffentlichten Port wurden beide Workflows erfolgreich importiert und veröffentlicht. Der automatische GitHub-Lauf am 02.11. um 13:07 UTC las 17 Aufgaben und 37 Pull Requests und speicherte den Ausgangsstand. Zwei zeitgesteuerte Erreichbarkeitsprüfungen waren erfolgreich: intern HTTP 200 mit `status: ok`, öffentlich erwartetes HTTP 401. Der tatsächliche Code lief dabei im n8n-JavaScript-Runner, nicht nur in den lokalen Tests.

Der Testdienst nutzte etwa 175 MiB RAM. Das offizielle Image meldet den internen Task-Runner als künftig abzulösend; bei einem Versionsupgrade ist die Umstellung auf einen externen Runner einzuplanen. Der fehlende optionale Python-Runner betrifft diese ausschließlich in JavaScript geschriebenen Abläufe nicht.

Produktive Laufzeitnachweise werden nach dem ersten Start ergänzt. [Einrichtung und Bedienung](../../dashboard/n8n/README.md)
