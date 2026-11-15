# iPhone: Widget und Siri-Kurzbefehle (ab 1.0.130)

## Funktionen

- **Widget „Mein Gebäude“** (klein und mittel): letzter Innenwert Temperatur und CO₂ aus `buildings/:id/telemetry`, zuletzt auf dem Server gespeichertes Wetter, Anzahl ungelesener Mitteilungen. Tippen öffnet das Gebäude (`kitrifftgebaeude://building/<id>`).
- **Gebäudeauswahl:** Widget lange drücken → Widget bearbeiten. Ohne Auswahl zeigt es das zuletzt in der App geöffnete Gebäude.
- **Siri/Kurzbefehle:**
  - „Frag mein Gebäude in KI trifft Gebäude“ → Siri fragt nach der Frage, öffnet den Gebäude-Assistenten und trägt sie ein. Gesendet wird erst nach Tipp auf Senden.
  - „Öffne ‹Gebäude› in KI trifft Gebäude“ → öffnet das Gebäude (AppEntity über die Gebäude der letzten Zusammenfassung).
  - „Wo bin ich in KI trifft Gebäude“ → öffnet die Raumortung im zuletzt geöffneten Gebäude.

## Datenfluss

Das Widget hat keine Sitzung, keinen Token und stellt keine Serververbindung her. Die App schreibt nach dem Laden eine kleine JSON-Zusammenfassung (`widget-snapshot.json`) in die App Group `group.<Bundle-ID>` und ruft `WidgetCenter.reloadAllTimelines()` auf:

| Daten | Quelle in der App |
| --- | --- |
| Gebäudenamen/-nummern | `AccountModel.loadBuildings()` |
| Ungelesene Mitteilungen | Team-Mitteilungen (`CollaborationModel.unread`) |
| Temperatur, CO₂ | Gebäude-Dashboard und Sensorik (nur Quelle `real`) |
| Wetter | Wetteransicht; beim Öffnen eines Gebäudes zusätzlich der **gespeicherte** Wert per `GET buildings/:id/weather` (höchstens alle 30 min, kein Open-Meteo-Abruf) |

Keine Adressen, Dateien, Nachrichtentexte oder Zugangsdaten. Abmelden und Kontolöschung löschen die Zusammenfassung.

## Signierung

- App: `$(KTG_BUNDLE_ID_BASE)`, Extension `KTGWidgets`: `$(KTG_BUNDLE_ID_BASE).widgets`, App Group `group.$(KTG_BUNDLE_ID_BASE)` (`SupportFiles/*.entitlements`).
- Das persönliche Team 4Q7V2BW44C stellt die App Group aus (geprüft 16.11.2026).
- Release-Build für Felix’ iPhone (wichtig: **nicht** mehr `PRODUCT_BUNDLE_IDENTIFIER=` überschreiben, sonst bekommt die Extension dieselbe ID):

```
xcodebuild -scheme "KI Trifft Gebäude APP" -configuration Release -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=4Q7V2BW44C KTG_BUNDLE_ID_BASE=de.felixdoering.kitrifftgebaeude CODE_SIGN_STYLE=Automatic
```

Ohne App Group (z. B. anderes Team ohne Berechtigung) zeigt das Widget nur einen Hinweis und öffnet per Tippen die App; Siri nutzt dann eine app-interne Kopie der Gebäudeliste.
