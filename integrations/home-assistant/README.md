# Home Assistant → KI trifft Gebäude

Diese Custom Integration schickt ausgewählte Sensorwerte aus Home Assistant (HA) an den Projektserver.
Home Assistant baut die Verbindung **nur nach außen** auf. Es muss also nicht aus dem Internet erreichbar sein.
Auf dem Projektserver liegt **kein** Home-Assistant-Zugang, sondern nur der Hash eines eigenen Brückenschlüssels. Dieser Schlüssel lässt sich jederzeit widerrufen.

## Was übertragen wird

| Art | Inhalt |
|---|---|
| Übersicht | Nur Sensoren (`sensor.*`) mit Temperatur, Luftfeuchte, CO₂, Leistung oder Energie, dazu deren Geräte (Name, Hersteller, Modell) und Bereiche |
| Laufende Werte | Höchstens einmal pro Minute, **nur** von Sensoren, die in der App ausgewählt wurden, und nur wenn sich der Wert geändert hat |
| Verlauf | Einmalig für neu ausgewählte Sensoren: Stundenwerte der letzten 7 Tage aus der HA-Statistik |

Nicht übertragen werden zum Beispiel Personen, Standorte, Kameras, Anwesenheit, Schalter, Akkustände und Automationen.
Der Server prüft das zusätzlich und weist alles andere ab.

## Installation

1. Den Ordner `custom_components/ki_trifft_gebaeude` nach `<HA-Konfiguration>/custom_components/` kopieren, zum Beispiel mit dem File-Editor- oder Samba-Add-on.
2. Home Assistant neu starten.
3. In der App „KI trifft Gebäude“ das Gebäude öffnen und dort **Geräte → Home Assistant → Kopplungscode erzeugen** wählen. Nur der Besitzer des Gebäudes kann das. Der Code gilt 10 Minuten.
4. In Home Assistant **Einstellungen → Geräte & Dienste → Integration hinzufügen → „KI trifft Gebäude“** wählen. Dort die Serveradresse aus der App und den Code eingeben.
5. In der App die gewünschten Sensoren auswählen und die HA-Bereiche den Räumen des Gebäudes zuordnen.

## Trennen

- In der App: **Home Assistant → Verbindung trennen**. Das löscht den Schlüssel, die Geräteübersicht und alle übernommenen Werte. HA zeigt danach einen Hinweis an.
- In Home Assistant: die Integration entfernen. Dabei wird die Verbindung auf dem Server ebenfalls gelöscht.

## Limits (pro Konto, durch Admins änderbar)

| Limit | Standard |
|---|---|
| `ha_links` (Verbindungen) | 2 |
| `ha_entities` (Sensoren pro Gebäude) | 50 |
| `ha_values_hour` (Messwerte pro Stunde) | 3000 |
| `ha_history_day` (Verlaufsimporte pro Tag) | 5 |

Werte werden 90 Tage gespeichert.

## Tests

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

Die Tests prüfen die Paketlogik (`payload.py`) ohne Home-Assistant-Installation. Der Server wird in `dashboard/backend/test/ha-import.test.js` getestet.
