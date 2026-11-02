# Gebäude-Assistent mit Gemini

Stand: 02.11.2026. Erster nativer App-Assistent mit `gemini-3.5-flash-lite`, über die bestehende Node-/Express-API. Keine Ablösung des Gebäude-Teamchats und keine automatische Revit-/Plananalyse.

## In der App

Gebäude öffnen → **KI**. Eigener Chat mit gespeichertem privatem Verlauf, Modellauswahl und bestätigbaren Modellbefehlen. Vor Senden den Datenumfang aufklappen und Übertragung bestätigen. Der Frage-Modus sendet bis zu sechs frühere Frage-Antwort-Paare sowie optionale serverseitige IFC-Typzahlen mit; der Teamchat bleibt privat. Siehe [aktueller Ablauf, Datenumfang und API](gemeinsames-modell-und-ki-chat.md).

Der Assistent kennt keine Planinhalte, Geometrie, Messwerte oder Bauzustände. Optional übergebene IFC-Typzahlen darf er als IFC-Einträge nennen. Eine tatsächliche Modelländerung entsteht erst nach gesonderter Vorschau und Bestätigung; IFC-Geometrie wird nicht bearbeitet.

## Zugriff und Betrieb

- Google-Projekt **D21 Gebaeude-Assistent**, derzeit kostenlose Stufe. Keine kostenpflichtige Abrechnung eingerichtet; der API-Schlüssel ist kein Studentenabo und keine Flatrate.
- Schlüssel ausschließlich auf dem Server unter `/etc/d21/gemini-api-key`, root-lesbar, außerhalb des Git-Repositories. Keine Schlüsselwerte in Dokumentation, App, Quellcode, Browser-Frontend oder Logs.
- Compose-Konfiguration: `GEMINI_ENABLED=true`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `D21_AI_CONFIG_DIR=/etc/d21`. Nur diese nicht geheimen Einstellungen stehen in der vorhandenen Server-`.env`; die Datei selbst nicht committen. Verzeichnis read-only im API-Container unter `/run/d21-ai`, Key-Dateipfad über `GEMINI_API_KEY_FILE`.
- Lokal ist die Funktion standardmäßig ausgeschaltet. Optionales `private-ai/` ist ignoriert; nie echte Schlüssel in Tests oder lokale Vorschau einbauen.
- **20 angenommene Anfragen pro Konto / 100 projektweit in rollierenden 24 Stunden**, höchstens drei pro Konto/Minute und zwei gleichzeitige Anfragen. Fehlgeschlagene Provider-Aufrufe zählen mit. Gemini hat eigene, zusätzliche Kontingente. Diese Grenzen sind keine monetäre Abrechnungssperre für andere Anwendungen, die denselben Google-Schlüssel verwenden.
- Provider-Timeout 30 Sekunden, App-Timeout 45 Sekunden, maximal 900 Ausgabe-Tokens. Kein automatischer Anbieter-Retry, keine automatische Modell-Ausweichwahl. Bei Fehlern werden keine Provider-Antworttexte, Prompts oder Schlüssel geloggt.
- Anfragekennung verhindert doppelten Versand nach verlorener Verbindung. Bei erfolgreicher Antwort startet ein weiterer bewusster Klick eine neue Anfrage. Eine bekannte fehlgeschlagene Anfrage kann nur über einen bewussten neuen Versuch erneut ausgelöst werden.
- Additive Tabellen `app_ai_budget` und `app_ai_requests`. Im Kontingentcache keine Fragen im Klartext; nur Frage-/Kontexthash, Konto/Gebäude, Modell, Zustand, Zeitpunkte und die Antwort für erneuten Abruf. Antworten werden bei der nächsten Anfrage nach 24 Stunden verworfen, Metadaten nach sieben Tagen bereinigt. Das ist eine bedarfsabhängige Bereinigung, kein minutengenauer Löschjob. Antworten sind nur für den anfragenden Account abrufbar und weiter an dessen aktuellen Gebäudezugriff gebunden.
- Der neue KI-Chat speichert Fragen und Antworten zusätzlich als privaten Verlauf in `app_ai_conversations` (bis 100 Paare je Konto/Gebäude). Der Frage-Modus sendet davon bis sechs Paare als Kontext. Dieser Verlauf ist vom kurzlebigen Kontingentcache getrennt.
- Das Löschen eines Gebäudes setzt nur den Gebäude-Verweis im Anfrageprotokoll leer und setzt keine Kontingente zurück. Bestehende Konten, Dokumente und Gebäude bleiben bei der Initialisierung erhalten. Bei fehlendem Schlüssel/ausgeschalteter KI funktionieren die übrigen App-Funktionen weiter.

Kostenlose Google-Dienste haben eigene Datenverwendungsbedingungen. Nur dafür freigegebene Daten übertragen; vor späterer Übertragung interner Baupläne erneut Umfang und Bedingungen prüfen. Aktuell ist eine Datei-Auswertung bewusst nicht implementiert.

## API-Vertrag für Benjamin / Emir

Bestehender Website-Zugang und `X-D21-Session` bleiben erforderlich:

- `GET /api/v1/buildings/:id/assistant` → `enabled`, `model`, `notice`, `context`, `context_hash`, `limits`. Keine Google-Anfrage; nur lesender Datenstand für die Vorschau.
- `POST /api/v1/buildings/:id/assistant`, Header `X-Request-ID: <UUID>`, JSON `{question, consent:"yes", context_hash}` → `{answer,model,notice,cached}`. Client-Kontext wird nicht übernommen; der Server liest die Gebäudeangaben selbst.
- 400 ungültige Frage/fehlende Bestätigung; 401 abgelaufene Sitzung; 404 kein Gebäudezugriff; 409 geänderter Datenstand, laufende oder widersprüchliche Anfragekennung; 410 Antwortcache abgelaufen; 429 Kontingent; 502 unvollständige Antwort; 503 nicht eingerichtet/ausgelastet/Anbieterfehler; 504 Timeout.

Der Endpoint ist auch für einen späteren Web-Client nutzbar; eine neue Assistenten-Weboberfläche ist in diesem Schritt nicht enthalten. Der bestehende regelbasierte Web-Analysebereich wird nicht stillschweigend auf Gemini umgestellt.

## Prüfung

Tests mit isolierter PostgreSQL-Laufzeit und gemocktem Anbieter: Zugriff, ausdrückliche Bestätigung, überprüfter Kontext, Ausschluss von Dateiinhalten und fremden Daten, begrenzte Fragen, versteckte Modell-Gedanken, Wiederholung ohne zweiten Anbieteraufruf, Quota, teilweise Antworten, sichere Fehler, Rechteentzug während einer Anfrage, fehlende Konfiguration, belegte Slots sowie fortbestehende Kontingente nach Gebäudelöschung. Echte Google-Testaufrufe verwenden ausschließlich synthetische Angaben, keine Team-Pläne.

Quellen: [Modell](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [API](https://ai.google.dev/api), [Preise und Datenverwendung](https://ai.google.dev/gemini-api/docs/pricing), [Schlüssel](https://ai.google.dev/gemini-api/docs/api-key).

## IFC-Ansicht steuern

Für Ansichtsaktionen im geöffneten IFC-Modell gibt es jetzt einen getrennten Befehlsmodus: ausblenden, einfärben und zurücksetzen, jeweils mit lokaler Trefferzahl und Bestätigung. Dabei geht nur der Befehlstext an Google, kein Modell. [Modellbefehle](ifc-modellbefehle.md). Im KI-Reiter lassen sich Vorschläge im Modus Modellbefehl erzeugen und nach serverseitiger Vorschau bestätigen.
