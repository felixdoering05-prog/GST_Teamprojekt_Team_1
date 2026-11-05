# iPhone-Heatmap, gebäudebezogenes Wetter und weiße Modellkarte

Stand: 05.11.2026. App 1.0.96 (96).

## Bedienung

Der neue Hauptbereich **Heatmap** bietet die Auswahl eines eigenen oder freigegebenen Gebäudes. Wetter funktioniert auch ohne IFC. Standort setzen: Gebäudemitte auf Apple Karten auswählen und speichern; nur der Eigentümer darf ihn verändern. Ein vorhandener Web-Gebäudestandort oder Modellkarten-Standort dient als Ausgangspunkt. Änderungen werden mit der Web-Gebäudeablage abgeglichen. Die Position wird mit berechtigten Gebäudemitgliedern geteilt.

**Wetterdaten laden** ruft ausdrücklich Open-Meteo auf. Der Projektserver sendet nur einen auf drei Nachkommastellen gerundeten Standort (ungefähr 100-m-Raster), keine IFC-Datei, Kontakte oder Zugangsdaten. Aktuelle Temperatur, Feuchtigkeit, Bewölkung, Wind und bis zu 24 stündliche Temperatur-/Strahlungsprognosen werden geprüft und gespeichert. Es sind regionale Wettermodellwerte und Prognosen, keine am Gebäude gemessenen Werte. Zeitstempel, Quelle und Abrufzeit bleiben sichtbar. Fehlende Werte bleiben leer. Angaben über Frankfurt aus der ursprünglichen Web-Heatmap werden nicht auf andere Gebäude übertragen.

Mit **3D-Heatmap öffnen** wird ein IFC aus der ausgewählten Gebäudemappe geladen. Der Stundenregler verändert die Farbe direkt im Modell. Die feste Skala reicht von −10 bis 50 °C. Erwärmung durch Strahlung und Flächenausrichtung ist vereinfacht; Materialien, reale Verschattung, Innenräume und Energiebedarf werden nicht berechnet. Diese Ansicht verändert weder IFC-Datei noch Geräte oder gespeicherte Bauteilfarben.

**Wetter mit der KI besprechen** öffnet den privaten Gebäudechat mit einer vorbereiteten Frage, die der Nutzer selbst absendet. Der Kontext enthält die zuletzt geladenen Wetterwerte, Quelle und Abrufzeit. Es erfolgt kein neuer Wetterabruf durch eine KI-Frage. Die bestehende kontoweite KI-Freigabe und deren Budgets bleiben erforderlich. Auch der bewusst gestartete Live-Sprachassistent erhält den vorhandenen Wetterkontext. Keine eigene KI wird trainiert.

## Karte und Platzierung

Die mobile 3D-Umgebung hat einen weißen Hintergrund und einen transparenten Schattenboden. Straßen und Nachbargebäude erscheinen in sehr hellen neutralen Farben. Ein neuer Kartendownload umfasst etwa **100 × 100 m**. Bereits gespeicherte ältere Umgebungen können größer sein; die Darstellung begrenzt weit entfernte Objekte, ohne bestehende Daten zu löschen. OpenStreetMap-Attribution bleibt sichtbar. Der bisherige Europa-Overpass-Dienst und seine Grenzen gelten weiter.

Bei **Modell auf Karte** prüft die App IFC-GPS-Angaben gegen den gewählten Kartenpunkt und meldet Abweichungen über 100 m. Sie prüft, ob ein OSM-Gebäudegrundriss den Mittelpunkt umfasst, und erkennt das Vorhandensein einer projizierten Georeferenzierung. Der Entwurfspunkt kann vor dem Speichern geprüft werden; nach dem Platzieren wird erneut geprüft. Standortänderungen aktualisieren den Gebäudepunkt für Wetterdaten.

Das ist eine Plausibilitätsprüfung, keine automatische vermessungsgerechte Georeferenzierung. Beliebige projizierte Koordinatensysteme, exakte Gebäudedrehung und Maßstab werden nicht blind aus ungeprüften Daten übernommen. Fehlende oder widersprüchliche IFC-Angaben erfordern die manuelle Bestätigung von Gebäudemitte, Drehung und Maßstab.

## API und Schutz

- `GET/PUT buildings/:id/location`: nur berechtigte Konten lesen, nur Eigentümer schreiben; revisionsgeprüft.
- `GET buildings/:id/weather`: nur gespeicherte passende Daten; keine externe Abfrage.
- `POST buildings/:id/weather/refresh`: bewusst ausgelöst, 15 Minuten Cache, sechs Abrufe je Konto/Stunde und 60 im Projekt/Stunde; mindestens 30 Sekunden Abstand je Gebäude. Feste HTTPS-Zieladresse, keine Redirects, 12 Sekunden Timeout, 300 kB Antwortgrenze, Zahlen-/Einheiten-/Zeitprüfung.
- `GET documents/:id/placement-check`: nur berechtigte Gebäude, optionaler Entwurfspunkt wird geprüft, nicht gespeichert.

Additive Tabellen: `app_building_locations`, `app_building_weather`, `app_weather_requests`. Standortwechsel macht alte Wetterdaten unpassend; alte Werte werden nicht als neue ausgegeben. Die Datenbank und Originalmodelle bleiben erhalten. Ausfälle führen zu sichtbaren Fehlern und vorhandene Daten werden mit ihrem tatsächlichen Abrufdatum gezeigt.

## Prüfung

Gezielte Tests decken Kontotrennung, Eigentümerrechte, konkurrierende Standortänderungen, expliziten Abruf, Rundung, Cache, fehlende Werte, falsche Einheiten, KI-Kontext sowie Standortprüfung ab. Der Wetterdienst wurde anhand eines öffentlichen Darmstadt-Punkts wirklich abgerufen. Die native GPU-Einfärbung wurde mit einem ausdrücklich synthetischen IFC auf warme und kalte Farben und weißen Hintergrund visuell geprüft. Diese technische Prüfung ersetzt keine fachliche Abnahme eines Gebäudemodells.

Quellen: [Open-Meteo API](https://open-meteo.com/en/docs), [Open-Meteo](https://open-meteo.com/) · CC BY 4.0; [OpenStreetMap](https://www.openstreetmap.org/copyright).
