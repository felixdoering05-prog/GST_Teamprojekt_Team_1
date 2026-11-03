# ChatGPT-Anbindung: Gebäude-Assistent in der Base44-Oberfläche

| Angabe | Eintrag |
| :--- | :--- |
| Datum | 2. November 2026 |
| Verfasser | Emir (@f77k75rjwp-dot) |
| Aufgabe | #33 · Bezug: #7, #9, #10, #21, #31, #32 |
| Status | Entwurf · im Review |
| Gegenprüfung durch / am | offen |
| Einrichtungsdokumentation | [ChatGPT-Integration](../chatgpt-integration.md) |

[← Protokollverzeichnis](README.md)

## Ziel

Ein abgegrenzter, vorführbarer KI-Ablauf in der Base44-Oberfläche: Eine angemeldete Person wählt ein Gebäude, stellt eine Freitextfrage zu dessen freigegebenen Daten und erhält eine als KI gekennzeichnete Antwort mit Gebäude- und Zeitbezug. Die regelbasierte Seite „Analyse“ bleibt unverändert und nutzt weiterhin kein Sprachmodell.

## Umgesetzt

- Seite „Gebäude-Assistent“ unter `/assistent`, in der Navigation erreichbar. Chat mit Ladezustand, gesperrter Eingabe während der Anfrage und verständlichen Fehlermeldungen.
- Backend-Funktion `buildingInsightsChat` (serverseitig). Datensammlung und Prompt in `base44/shared/buildingAssistant.ts`.
- Freigabe je Gebäude über das additive Feld `Building.ai_assistant_release` („freigegeben“ = Standard, „gesperrt“).

## Integrationsweg

Browser → `buildingInsightsChat` → Core-Integration InvokeLLM über Service-Role → Sprachmodell → Antwort an den Browser.

Kein API-Schlüssel im Projekt: weder im Browser-Bundle noch in ausgelieferten Dateien oder im Repository; es sind keine Secrets gesetzt. Aufbau, Feldliste und Testanleitung: [ChatGPT-Integration](../chatgpt-integration.md).

## KI-Einsatz

- **Werkzeug:** Eingebauter Assistent der Base44-Plattform (Base 1) für Entwurf und Umsetzung von Funktion, Datenübergabe, Prompt und Oberfläche sowie für diese Unterlagen.
- **Modell zur Laufzeit:** InvokeLLM wird ohne Modellangabe aufgerufen, es gilt die Plattform-Einstellung „automatic“. Im Code sind weder Modell noch Anbieter festgelegt. Die Bezeichnung „ChatGPT“ im Issue-Titel ist damit nicht durch den Code gedeckt. Soll ein bestimmtes Modell verwendet werden, muss es explizit gesetzt und hier festgehalten werden.
- **Bereinigte Arbeitsaufträge** (Zusammenfassungen, keine wörtlichen Prompts):
  1. Eine Seite bauen, auf der eine angemeldete Person ein Gebäude wählt, eine Freitextfrage stellt und eine sichtbar als KI gekennzeichnete Antwort erhält.
  2. Nur freigegebene Felder übermitteln, Frage und Datenmenge begrenzen, Freigabe serverseitig prüfen.
  3. Datenfluss, Prüfungen und Grenzen für das Protokoll dokumentieren.
- **Übernommen:** Seitenaufbau und Texte, Fehlercodes, Regelwerk im Prompt (sieben Regeln, unter anderem keine erfundenen Messwerte, Ursachen nur als Vermutung, höchstens 180 Wörter), Grenzwert-Vorbelegung.
- **Eigene Prüfung:** Statuscodes am Server nachgestellt; Antwort gegen den Datenbestand gegengeprüft (Gebäude, Zeitraum, Kennzahlen); Produktionsbuild geprüft; Prompt-Regeln stichprobenartig geprüft.
- **Nicht geprüft:** systematische Antwortqualität, Halluzinationsrate, Verhalten bei sehr langen oder mehrdeutigen Fragen.

## Datenfluss und übermittelte Felder

Übermittelt werden ausschließlich Daten des ausgewählten Gebäudes: Stammdaten (Name, Kürzel, Standort, Baujahr, Bruttogrundfläche, Geschosse, Nutzung), Kennzahlen je Messgröße für 24 Stunden, neuester Wert je Sensor mit Grenzwertbewertung, bis zu 8 Überschreitungen, hinterlegte Grenzwerte, bis zu 10 offene Meldungen und die Datenqualität.

Nicht übermittelt: Anmeldedaten, Sitzungstoken, Namen oder E-Mail-Adressen von Personen, Anschrift, Modellverweise, interne Datensatz-IDs, Daten anderer Gebäude. Die Frage ist auf 400 Zeichen begrenzt, Steuerzeichen werden entfernt.

## Testfälle

Alle Prüfungen am 2.11.2026 gegen die veröffentlichte Funktion, Gebäude D21.

| Eingabe | Erwartung | Ergebnis | Stand |
| :--- | :--- | :--- | :--- |
| Aufruf ohne Inhalt | 400 `missing_building` | 400 wie erwartet | bestanden |
| Unbekannte Gebäude-ID | 404 `building_not_available` | 404 wie erwartet | bestanden |
| Gebäude mit Status „gesperrt“ (temporär angelegt, danach gelöscht) | 403 `not_released` | 403 wie erwartet | bestanden |
| Echte Frage zu D21 | 200 mit Antwort, Gebäude, Zeitraum, Datenqualität | 200, Antwort vorhanden; 0 Messwerte im 24-Stunden-Fenster, 36 Sensoren, 12 Räume | bestanden |
| Frage länger als 400 Zeichen | 400 `question_too_long` | nicht einzeln geprüft | offen |
| Aufruf ohne Anmeldung | 401 `unauthorized` | nicht einzeln geprüft | offen |
| Ausfall des KI-Dienstes | 502 `ai_unavailable` mit Hinweis | nicht ausgelöst | offen |

Mobilgerät, gleichzeitige Nutzung und Betrieb mit realen Messwerten sind nicht geprüft. Screenshots der Vorführung fehlen noch.

## Kosten und Begrenzungen

- Jede Frage löst genau einen Modellaufruf aus. Es gibt kein Gesprächsgedächtnis und kein Zwischenspeichern von Antworten.
- Eine Ratenbegrenzung je Nutzer ist nicht umgesetzt. Jede angemeldete Person kann beliebig viele Aufrufe auslösen.
- Ein Kostensatz je Aufruf liegt nicht im Repository. Die Abstimmung zu Budget und Umfang steht aus.
- Je Anfrage höchstens 600 Messwerte, 200 Sensoren, 300 Räume, 8 Überschreitungen und 10 Meldungen.

## Abgrenzung zur Serverausgabe

Der Assistent liest die Base44-Entitäten dieser App. Die Serverausgabe unter `dashboard/base44-frontend/` arbeitet über die D21-API mit PostgreSQL.

Der Assistent liegt im Repository nicht als gepflegter Code, sondern als Momentaufnahme vor: Im Base44-Projekt befinden sich Funktion, Shared-Modul und Seite; im Repository erscheinen sie im Export `docs/d21-digital-twin-revit-bim-und-g-a060ebbe-2026-11-03.zip` (163 Dateien, ohne `docs/`, `node_modules/` und `dist/`). Der ältere Export `docs/d21-digital-twin-revit-bim-und-g-a060ebbe.zip` vom 28.10.2026 enthält den Assistenten noch nicht und bleibt zum Vergleich erhalten. Die Seiten der Serverausgabe unter `dashboard/base44-frontend/src` umfassen elf Dateien ohne Assistenten; eine Codesuche nach „assistent“ findet dort keinen Treffer.

Eine Änderung im Base44-Editor ist keine Veröffentlichung auf dem Projektserver. Die Übernahme erfolgt kontrolliert über Export → eigener Branch → Pull Request → Gegenprüfung → `d21-deploy`. Siehe [Base44 → eigener Projektserver](../base44-serveranbindung.md).

## Risiken und offene Punkte

| Punkt | Auswirkung | Nächster Schritt / verantwortlich |
| :--- | :--- | :--- |
| Assistent nur in Base44, nicht in der Serverausgabe | Ablauf auf dem Projektserver nicht verfügbar | Datensammlung auf D21-API umstellen; Schnittstelle mit Felix abstimmen |
| Keine Ratenbegrenzung | Unkontrollierte Modellaufrufe und Kosten | Begrenzung je Nutzer ergänzen, Budget mit Felix festlegen |
| Datenübermittlung an einen KI-Dienst ohne Beschluss | Rechtliche Bewertung offen (Zweck, Anbieter, Speicherdauer) | Eintrag im [Entscheidungsprotokoll](../entscheidungen.md) |
| Keine kontoindividuelle Gebäudezuordnung | Gemeinsame Ablage ohne Besitzerfeld; geprüft werden nur Anmeldung, Existenz und Freigabe | `tenant_id` und Row-Level-Security prüfen, falls mehrere Einrichtungen folgen |
| 24-Stunden-Fenster bei Demo-Daten | Dünne Datenlage, Antworten bleiben allgemein | Reale Messwerte anbinden |
| Grenzwerte doppelt gepflegt (`src/lib/metrics.js` und Shared-Modul) | Abweichende Bewertung möglich | Eine Quelle festlegen |
| Code nur als ZIP-Momentaufnahme, keine Versionierung | Änderungen am Assistenten sind im Repository nicht nachvollziehbar | Export bei jeder Freigabe erneuern oder dauerhafte Synchronisierung entscheiden |

## Nächste Schritte

1. Anwendungsfall, Schnittstelle und Budget mit Felix abstimmen und das Ergebnis hier nachtragen (bis 3.11.2026).
2. Beschluss zur Datenübermittlung an einen KI-Dienst im Entscheidungsprotokoll erfassen.
3. Screenshots der Vorführung ergänzen; der Export vom 3.11.2026 ist abgelegt und bei jeder Freigabe zu erneuern.

## Freigabe und Nachträge

- Gegenprüfung und Freigabe (Person, Datum, PR): offen
- Nachträge (Datum, Grund, Änderung): keine
