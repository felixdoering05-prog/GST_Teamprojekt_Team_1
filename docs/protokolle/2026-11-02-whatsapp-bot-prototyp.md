# WhatsApp-Projekt-Bot vorbereiten

Datum: 2. November 2026

Felix möchte die Projektgruppe automatisch mit GitHub verbinden und hat eine zweite Telefonnummer vorgesehen. Die Nummer ist laut Rückmeldung noch nicht in WhatsApp eingerichtet.

Vorbereitet wurde ein separater Prototyp unter `dashboard/whatsapp-bot/`: ausgehende Meldungen über Aufgaben und Pull Requests des öffentlichen Hauptrepositorys, Abgleich alle fünf Minuten, erste Baseline ohne Alt-Meldungen, persistente Warteschlange und Wiederholung nach Fehlern. Kein Chat-Import und keine `!aufgabe`-Funktion in dieser Version. Private Repository-Daten sind standardmäßig gesperrt.

Standardmäßig läuft nur eine lokale Vorschau. Für den späteren WhatsApp-Zugang werden die separate Nummer, Gruppenmitgliedschaft, explizite Zielgruppen-ID und eine von Felix selbst durchgeführte QR-Kopplung benötigt. Zugangsdaten und Laufzeitdateien sind vom Repository ausgeschlossen.

Prüfung: fünf automatisierte Tests bestanden, WhatsApp-/QR-Pakete importierbar, Paketprüfung ohne bekannte Schwachstellen in der verwendeten Konfiguration. Echter QR-/Gruppentest sowie Serverbetrieb sind noch offen. Die inoffizielle WhatsApp-Web-Anbindung kann trotz separater Nummer gesperrt werden.

An der Produktiv-App, API, Datenbank oder dem bestehenden Deployment-Skript wurde nichts geändert. Anleitung und Grenzen: [Bot-README](../../dashboard/whatsapp-bot/README.md).

Der echte lesende GitHub-Vorschaulauf erfasste 17 Aufgaben und 35 Pull Requests als Ausgangsstand. Es wurden keine Nachrichten versandt; die Warteschlange blieb leer.
