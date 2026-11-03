# ChatGPT-Integration · Gebäude-Assistent

Stand: 2. November 2026 · Aufgabe: #33

[← Zur Startseite](../README.md) · [Protokoll](../protokolle/2026-11-02-chatgpt-gebaeudeassistent.md)

## Zweck

Die Base44-Oberfläche beantwortet Fragen zu den Daten eines einzelnen Gebäudes. Angemeldete Personen wählen ein Gebäude, stellen eine Freitextfrage und erhalten eine als KI gekennzeichnete Antwort mit Gebäude- und Zeitbezug. Die Antwort stützt sich ausschließlich auf den übergebenen Datenbestand; mögliche Ursachen erscheinen ausdrücklich als Vermutung.

Die regelbasierte Seite „Analyse“ bleibt unabhängig davon und nutzt kein Sprachmodell.

## Aufbau

| Teil | Ort |
| :--- | :--- |
| Serverfunktion (Anmeldung, Prüfungen, Aufruf des KI-Dienstes) | `base44/functions/buildingInsightsChat/entry.ts` |
| Datensammlung, Kennzahlen, Prompt | `base44/shared/buildingAssistant.ts` |
| Seite „Gebäude-Assistent“ | `src/pages/BuildingAssistant.jsx` |
| Chat, Antwortkarte, Nachrichten | `src/components/assistant/` |
| Aufruf aus dem Browser | `src/lib/assistantClient.js` |
| Freigabe je Gebäude | Feld `Building.ai_assistant_release` |

Diese Dateien liegen im Base44-Projekt. Die Serverausgabe unter `dashboard/base44-frontend/` enthält den Assistenten nicht (Stand 3.11.2026). Als Ablage im Repository dient die Momentaufnahme `docs/d21-digital-twin-revit-bim-und-g-a060ebbe-2026-11-03.zip`.

## Zugänge und Konfiguration

Es sind keine Zugangsdaten und keine Secrets hinterlegt. Nötig sind:

- Zugang zum Base44-Projekt für Änderungen und Veröffentlichung.
- Die Plattform-Integration InvokeLLM; das Modell wird über die Einstellung `automatic` gewählt, im Code ist keines festgelegt.
- Eine Anmeldung als App-Nutzer, da die Funktion ohne Sitzung mit 401 antwortet.

Konfigurationsnamen ohne Werte:

| Name | Bedeutung | Vorgabe |
| :--- | :--- | :--- |
| `Building.ai_assistant_release` | Freigabe der Gebäudedaten | `freigegeben` |
| `ThresholdConfig.warning_min`, `warning_max`, `critical_min`, `critical_max` | Grenzwerte je Messgröße | Vorbelegung im Shared-Modul |
| Messfenster | Zeitraum der betrachteten Messwerte | 24 Stunden |
| `MAX_QUESTION_LENGTH` | Länge der Frage | 400 Zeichen |
| `MIN_MEASUREMENTS` | Mindestzahl für belastbare Aussage | 5 |

## Einrichtung

1. Entitäten `Building`, `Room`, `Sensor`, `Measurement`, `Alert` und `ThresholdConfig` müssen vorhanden und befüllt sein.
2. Funktion `buildingInsightsChat` bereitstellen; sie wird im Base44-Projekt mit der Anwendung ausgeliefert.
3. Prüfen, dass die Integration InvokeLLM antwortet.
4. Je Gebäude die Freigabe setzen: `freigegeben` für Daten, die an den KI-Dienst gehen dürfen, sonst `gesperrt`.
5. Anwendung veröffentlichen und die Seite `/assistent` aufrufen.

Eine Veröffentlichung im Base44-Editor ist keine Aktualisierung des Projektservers. Für den Produktivbetrieb muss die Datensammlung auf die D21-API umgestellt werden; siehe [Base44 → eigener Projektserver](base44-serveranbindung.md).

## Schnittstellenvertrag

Aufruf aus dem Browser über das SDK:

```js
const res = await base44.functions.invoke('buildingInsightsChat', {
  building_id: '<ID des Gebäudes>',
  question: 'Ist die Luftqualität im Hörsaal heute auffällig?',
});
```

Anfrage: beide Felder müssen Zeichenketten sein; andere Typen werden verworfen. Steuerzeichen werden durch Leerzeichen ersetzt, mehrfache Leerzeichen zusammengefasst.

Antwort bei Erfolg:

```json
{
  "answer": "…",
  "building": { "id": "…", "name": "D21", "code": "D21" },
  "period": { "from": "…", "to": "…", "hours": 24 },
  "data_quality": { "measurements": 0, "demo_measurements": 0, "real_measurements": 0, "demo_only": false, "has_enough_data": false, "sensor_count": 36, "room_count": 12 },
  "notice": "Es liegen nur 0 Messwerte im Zeitraum vor – die Aussagekraft ist begrenzt."
}
```

Fehlerfälle:

| Code | HTTP | Bedeutung |
| :--- | :--- | :--- |
| `unauthorized` | 401 | keine Anmeldung |
| `missing_building` | 400 | keine Gebäude-ID übergeben |
| `missing_question` | 400 | leere Frage |
| `question_too_long` | 400 | mehr als 400 Zeichen |
| `building_not_available` | 404 | Gebäude existiert nicht |
| `not_released` | 403 | Gebäude für den Assistenten gesperrt |
| `ai_unavailable` | 502 | KI-Dienst hat nicht geantwortet |
| `empty_answer` | 502 | keine Antwort erzeugt |
| `internal_error` | 500 | unerwarteter Fehler |

## Datenfluss

1. Browser sendet Gebäude-ID und Frage an die Funktion.
2. Die Funktion prüft Anmeldung, Eingaben, Existenz und Freigabe des Gebäudes.
3. Sie lädt Sensoren, Räume, offene Meldungen, Messwerte der letzten 24 Stunden und Grenzwerte; Grenzen: 200 Sensoren, 300 Räume, 25 Meldungen, 600 Messwerte, 20 Grenzwertsätze.
4. Sie berechnet Kennzahlen je Messgröße, den neuesten Wert je Sensor und die Überschreitungen.
5. Das Shared-Modul baut den Prompt aus Regelwerk und Datenbestand, die Funktion ruft InvokeLLM über die Service-Role auf.
6. Die Antwort geht zusammen mit Gebäude, Zeitraum und Datenqualität an den Browser.

An den KI-Dienst gehen ausschließlich:

- Gebäude: Name, Kürzel, Standort, Baujahr, Bruttogrundfläche, Geschosse, Nutzung.
- Zeitraum: Beginn, Ende, Stunden.
- Datenqualität: Anzahl Messwerte gesamt, davon Demo und real, Mindestmenge erreicht, Sensoren, Räume.
- Kennzahlen je Messgröße: Anzahl, Minimum, Maximum, Mittelwert, Einheit.
- Grenzwerte je Messgröße.
- Überschreitungen: Stufe, Messgröße, Wert, Einheit, Raumkürzel, Zeitpunkt (höchstens 8).
- Offene Meldungen: Titel, Text, Stufe, Messgröße, Wert, Grenzwert, Raum, Zeitpunkt (höchstens 10).

Nicht enthalten: Anschrift, Beschreibung, Modellverweise, interne IDs, Namen oder Kontaktdaten von Personen, Daten anderer Gebäude.

## Testanleitung

1. In der Anwendung anmelden und `/assistent` öffnen.
2. Ein freigegebenes Gebäude wählen und fragen: „Wie war die Temperatur in den letzten 24 Stunden, und gibt es Auffälligkeiten?“
3. Prüfen: Antwort als KI gekennzeichnet, Gebäude und Zeitraum genannt, Zahlen mit Einheit; bei dünner Datenlage erscheint ein Hinweis.
4. Fehlerfälle prüfen: leere Frage absenden (Hinweis, kein Absturz); Frage über 400 Zeichen; ein auf `gesperrt` gesetztes Gebäude (Hinweis statt Antwort); Abmelden und Seite erneut öffnen (Anmeldung erforderlich).
5. Für Prüfungen am Server die Funktion mit leerem Inhalt (400), unbekannter ID (404) und gesperrtem Gebäude (403) aufrufen.

Ergebnisse und offene Punkte gehören in das [Protokoll](../protokolle/2026-11-02-chatgpt-gebaeudeassistent.md).

## Grenzen

- Kein Gesprächsgedächtnis; jede Frage ist eigenständig.
- Fenster von 24 Stunden; Demo-Messwerte liegen älter und ergeben eine dünne Datenlage.
- Keine Ratenbegrenzung je Nutzer, kein Zwischenspeichern von Antworten.
- Keine kontoindividuelle Zuordnung von Gebäuden; geprüft werden Anmeldung, Existenz und Freigabe.
- Grenzwerte doppelt gepflegt (`src/lib/metrics.js` und Shared-Modul).
- Abhängig von der Plattform-Integration InvokeLLM.

## Offene Punkte

1. Anbindung an die D21-API statt an Base44-Entitäten.
2. Kostensatz je Aufruf und Budget; Abstimmung mit Felix.
3. Beschluss zur Datenübermittlung an einen KI-Dienst im [Entscheidungsprotokoll](entscheidungen.md).
4. Feste Modellwahl, falls ein bestimmtes Modell gefordert ist.
5. Screenshots der Vorführung; der Export vom 3.11.2026 ist abgelegt.
