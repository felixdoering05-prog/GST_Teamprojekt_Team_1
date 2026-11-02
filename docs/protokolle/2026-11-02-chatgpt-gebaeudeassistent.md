# ChatGPT-Anbindung: Gebäude-Assistent in der Base44-Oberfläche

Datum: 2. November 2026 · Aufgabe: #33

[← Protokollverzeichnis](README.md)

Für den abgegrenzten Anwendungsfall „Frage zu freigegebenen Gebäudedaten“ erhält die Base44-Oberfläche die Seite „Gebäude-Assistent“ (`/assistent`). Angemeldete Nutzer wählen ein Gebäude und stellen eine Freitextfrage. Die Antwort ist als KI-generiert gekennzeichnet und nennt Gebäude und Zeitraum (letzte 24 Stunden). Die regelbasierte Seite „Analyse“ bleibt unverändert und nutzt weiterhin kein Sprachmodell.

## Integrationsweg

Browser → Backend-Funktion `buildingInsightsChat` → Core-Integration InvokeLLM (serverseitig über Service-Role) → Sprachmodell.

Kein API-Schlüssel im Projekt, weder im Browser-Bundle noch in ausgelieferten Dateien oder im Repository; es sind keine Secrets gesetzt. Modellwahl `automatic`, keine feste Modellversion im Code. Datensammlung und Prompt: `base44/shared/buildingAssistant.ts`. Freigabe je Gebäude über das additive Feld `Building.ai_assistant_release` („freigegeben“ = Standard, „gesperrt“).

## Übermittelte Daten

Ausschließlich Daten des einen ausgewählten Gebäudes: Stammdaten, Kennzahlen je Messgröße für 24 Stunden (Anzahl, Min, Max, Mittel), neueste Werte je Sensor mit Grenzwertbewertung, bis zu 8 Überschreitungen, hinterlegte Grenzwerte, bis zu 10 offene Meldungen, Datenqualität.

Nicht übermittelt: Anmeldedaten, Sitzungstoken, Namen oder E-Mail-Adressen von Personen, Gebäudeadresse, Modellverweise, interne Datensatz-IDs, Daten anderer Gebäude. Die Frage ist auf 400 Zeichen begrenzt und wird bereinigt.

## Prüfungen

Am Server geprüft: Aufruf ohne Payload → 400; unbekannte Gebäude-ID → 404; gesperrtes Gebäude (temporär angelegt, danach gelöscht) → 403; echter Aufruf mit D21 → 200 mit Antwort, Gebäude, Zeitraum und Datenqualität (0 Messwerte im Fenster, 36 Sensoren, 12 Räume); Produktionsbuild erfolgreich. Nicht geprüft: mobiles Gerät, Last, Betrieb mit realen Messwerten.

## Abgrenzung zur Serverausgabe

Der Assistent liest die Base44-Entitäten dieser App. Die Serverausgabe unter `dashboard/base44-frontend/` arbeitet über die D21-API mit PostgreSQL. Für den Produktivbetrieb ist die Datensammlung auf die D21-API umzustellen, ohne neue Konto- oder Gebäudeablage. Die Anmeldung nutzt die bestehenden Base44-Konten; innerhalb der App entsteht keine zweite Kontoablage. Eine Änderung im Base44-Editor ist keine Veröffentlichung auf dem Projektserver. Siehe [Base44 → eigener Projektserver](../base44-serveranbindung.md).

Ergänzend: Die App ist inzwischen veröffentlicht (Base44-Adresse), zusätzlich zur Serverausgabe. Oberflächen-Export: `docs/d21-digital-twin-revit-bim-und-g-a060ebbe.zip`.

## Grenzen und offene Punkte

- Keine kontoindividuelle Gebäudezuordnung (gemeinsame Ablage ohne Besitzerfeld). Der Server prüft Anmeldung, Existenz und Freigabe; für Mandantenfähigkeit wären `tenant_id` plus Row-Level-Security nötig.
- 24-Stunden-Fenster: Demo-Messwerte liegen älter und ergeben eine dünne Datenlage.
- Grenzwert-Vorbelegung doppelt vorhanden (`src/lib/metrics.js` und `base44/shared/buildingAssistant.ts`).
- Jede Frage löst einen Modellaufruf aus; kein Gesprächsgedächtnis.

## Freigabe und Nachträge

- Gegenprüfung und Freigabe (Person, Datum, PR): offen
- Nachträge (Datum, Grund, Änderung): keine
