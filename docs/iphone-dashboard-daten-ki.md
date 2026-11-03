# iPhone: Dashboard, Demo und datenbezogene Gemini-Auswertung

03.11.2026 · Ausbau der nativen SwiftUI-App auf Basis der vorhandenen Web-Datenstruktur. Das ist eine Kontextanbindung an Gemini, **kein Training, Fine-Tuning oder eigenes KI-Modell**.

## In der App

- **Dashboard** ist ein Hauptreiter. Gebäude wählen, danach Quelle **Messwerte** oder **Server-Demo**. Beide bleiben getrennt. Daten werden beim Öffnen, per Herunterziehen und ungefähr alle 30 Sekunden im Vordergrund aktualisiert.
- Ansichten **Dashboard**, **Sensorik**, **Energie**, **Analyse**: letzter gültiger Messwert je Messgröße mit tatsächlichem Messzeitpunkt, Zeitverlauf eines Sensors, Sensorliste, Energiezeiträume und regelbasierte Grenzwertauswertung.
- Für die regelbasierte Auswertung gelten dieselben Projekt-Grenzwerte wie im Web. Das ist keine Norm-/Gesundheitsbewertung und keine KI. Die Änderung zwischen erstem und letztem geladenem Wert ist keine Prognose. Alte Messwerte werden mit Zeitangabe angezeigt, Werte über zwei Stunden im Dashboard als alt markiert.
- **Demo ohne Konto ausprobieren** auf dem Startbildschirm und **Demo** im Dashboard öffnen lokale fiktive Beispiele. Kein Serverbestand wird angelegt oder verändert; keine Gemini-Anfrage. Die Zeitachse wird für die Demo relativ zum Öffnen erzeugt. Sensoren und Energie sind ausdrücklich Beispiele und keine D21-Messungen.
- **Daten → Sensor anlegen** erfasst Kennung, Name, Messgröße und gewählte Quelle. Es wird keine Hardware gekoppelt.
- **Daten → Messwerte aus CSV importieren**: Datei auswählen, Vorschau und Kennungen prüfen, danach bewusst bestätigen. Kein automatischer Import. Sensoren müssen im gewählten Gebäude und derselben Quelle vorhanden sein.
- Energiezeiträume aus dem Web werden lesend übernommen. Der native CSV-Import unterstützt zunächst Sensormessungen. Keine automatische Summierung über verschiedene Einheiten/überlappende Energiezeiträume.

## CSV

UTF-8, maximal 1 MB und 200 Datenzeilen. Genau die Spalten `sensor_code`, `measured_at`, `value`, beliebige Reihenfolge. Komma oder Semikolon als Trennzeichen; Semikolon erlaubt Dezimalkomma. Doppelte Anführungszeichen werden unterstützt, mehrzeilige Zellen nicht. Zeitstempel brauchen ISO-8601-Datum, Uhrzeit und Zeitzone; ungültige Kalenderdaten werden abgewiesen. Siehe [Beispiel](../daten/beispiele/iphone-messwerte-vorlage.csv).

```csv
sensor_code;measured_at;value
TEMP-01;2026-11-03T12:00:00Z;22,4
TEMP-01;2026-11-03T13:00:00Z;22,8
```

Kennung `TEMP-01` vorher anlegen, z. B. Temperatur / Demo, und beim Import dieselbe Quelle wählen. Die Beispieldatei enthält erfundene Werte und sollte als Demo importiert werden. Quelle `real` heißt vom Nutzer als Messung importiert, **nicht unabhängig verifiziert**. Alle Zeilen werden atomar gespeichert. Eine UUID verhindert Duplikate beim erneuten Bestätigen derselben Anlage; derselbe Schlüssel mit verändertem Inhalt liefert 409. Nach dem ersten Versuch bleiben Dateiauswahl und Daten gesperrt, damit ein Timeout keine versehentliche zweite Anlage erzeugt. Nach Schließen der Ansicht/neuer Datei beginnt ein neuer Import; identische Werte in getrennten neuen Importen werden nicht global dedupliziert.

## Gemeinsame Daten und Schnittstellen

Es werden die bestehenden `Sensor`, `Measurement` und `EnergyReading`-Datensätze in `app_twin_records` genutzt. Angenommene Gebäudemitglieder lesen den Gebäudebestand des Eigentümers und importieren in diesen Bestand. Fremde oder noch nicht angenommene Konten erhalten 404. Die bestehenden generischen Web-Twin-Routen bleiben wie bisher kontobezogen; die neuen gebäudebezogenen Routen ermöglichen die gemeinsame mobile Ansicht.

| Route | Funktion |
| --- | --- |
| `GET /api/v1/buildings/:id/telemetry?source=real\|demo` | Begrenzte Übersicht inkl. Projekt-Grenzwerten |
| `POST /api/v1/buildings/:id/telemetry/sensors` | Kennung/Name/Messgröße/Quelle anlegen; gleiche Angaben wiederholbar |
| `POST /api/v1/buildings/:id/telemetry/import` | UUID, Quelle und 1–200 Zeilen importieren |

Maximal 100 angezeigte Sensoren pro Quelle/Gebäude, 500 zuletzt **gespeicherte** Messwerte und 100 zuletzt gespeicherte Energiezeiträume. Begrenzung wird angezeigt; der Ausschnitt ist nicht zwingend ein vollständiges Zeitfenster. Ein Chart zeigt höchstens 48 gültige Werte des gewählten Sensors. Werte mit `quality=verdaechtig`/`fehlend` fließen nicht in Chart, letzte gültige Werte und Gemini-Aggregate ein. Projekt-Grenzwerte stammen aus den Kontoeinstellungen des Gebäudeeigentümers, entsprechend der Web-Auswertung.

Die additive Tabelle `app_measurement_imports` enthält Schlüssel, SHA-256-Inhaltshash und Ergebnis, keine zweite Messwertkopie. Sie wird mit dem Gebäude gelöscht. Keine Änderungen/Löschungen vorhandener Konten, Dateien oder Messreihen. Die Importroute hat eine eigene 128-KB-JSON-Grenze, andere bestehenden Anfragegrenzen bleiben bestehen.

## Gemini: gesonderte Freigabe

Unter **Analyse → Daten prüfen und Gemini fragen** wird ein serverseitiger Kontext vorbereitet. Er enthält Gebäudename, eine Quelle, je Messgröße Anzahl/Minimum/Maximum/Mittel und ersten/letzten Zeitpunkt des geladenen gültigen Ausschnitts, Projekt-Grenzwerte sowie Grenzen der Aussagekraft. Mehrere Sensoren können aggregiert sein; keine Raumdiagnose daraus ableiten.

**Nicht enthalten:** Adresse, Personen-/Kontaktdaten, Sensorkennungen, Notizen, rohe Zeitreihen, Datei-/Planinhalte, Geometrie, Chatverläufe oder Zugangsdaten. Der vollständige Kontext wird in der App angezeigt. Erst ein separater Schalter und **Auswertung senden** erlauben die Übertragung an Google Gemini. Die lokale Demo hat diesen Versand nicht.

Der gesonderte Modus `measurement-analysis` wird über die vorhandene Gebäude-Assistenten-Route mit expliziter Quelle aufgerufen. Der normale Gebäudechat bekommt dadurch **keine zusätzlichen Messwerte**. Analyse darf nicht mit Chatverlauf/IFC-Auswahl vermischt werden. Der Kontext-Hash schützt die geprüfte Fassung: Bei Datenänderungen erneutes Vorbereiten und Freigeben. Fehlende gültige Werte führen zu 422, ohne Anbieteranfrage. Bestehende Kontingente, Zeitlimits und UUID-Antwortcache gelten weiter. Keine Trainingsjobs, keine Werkzeugausführung und keine Gerätebefehle. Antworten können Fehler enthalten; der Anbieter wird ausdrücklich benannt.

## Grenzen und Prüfung

Nicht alle Web-Funktionen sind damit nativ abgebildet: insbesondere Energieimport, Bearbeitung sämtlicher Web-Entitäten, Erzeugung/Quittierung von Grenzwertmeldungen und echte Geräteanbindung sind kein Teil dieses Ausbaus. Die bestehende In-App-Mitteilungsfunktion bleibt erhalten. Keine Apple-Push-Einrichtung.

Backendtests mit isolierter Datenbank prüfen Berechtigungen, Quellen, gemeinsame Web-Daten, atomare/reproduzierbare Importe, Kalenderdaten, Ausschluss privater Texte, ausdrückliche Freigabe und Kontextänderungen. Foundation-Checks prüfen den nativen CSV-Parser und die Demo; Xcode prüft Debug/Release. Sichtbare Simulatorprüfung ist noch offen, weil die Computerverbindung das Fenster nicht erreicht und Felix gerade nicht öffnen kann. Keine vollständige Bedienungsprüfung behaupten.

Code über Branch/PR, Backend nur mit `d21-deploy` bereitstellen. Bestehende Datenbank erhalten und vorher sichern. Die native App muss separat aus dem aktuellen Xcode-Projekt neu aufs iPhone installiert werden.
