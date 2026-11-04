# Geräte im Gebäude, RGB-Raumlicht und BIM-Kartenumgebung

Stand: 04.11.2026. Technischer Arbeitsnachweis.

## Geräte nachträglich zuordnen

Die iPhone-App enthält keinen eigenen Home-Assistant-Geräteabschnitt mehr. Unter **Gebäude → Geräte → Vorhandenes Gerät verbinden** erscheinen ausschließlich die für das eigene Konto serverseitig freigegebenen echten Lampen. Gebäude und Raum werden anschließend gewählt. Bestehende echte Geräte und Simulationen besitzen **Gebäude & Raum** zum nachträglichen Umordnen.

Ein frei eingegebener Raumname dient der Organisation. Für die farbige Anzeige muss zusätzlich ein IFC-Modell und dessen tatsächlicher `IFCSPACE` gewählt werden. Ohne Raumgeometrie wird kein Raum erfunden. Der Server prüft, dass Modell und Raum zum Zielgebäude gehören. Modellräume werden nach ID und begrenztem IFC-Namen/LongName ermittelt, nicht aus der Form von Wänden geraten. Die vorhandenen neueren Servermodelle enthalten Raumobjekte; die frühe lokale `Projekt1.ifc` enthält keine.

Die echte private Lampe bleibt an ihr freigegebenes Konto gebunden. Zuordnung zu einem Gebäude erteilt anderen Mitgliedern keinen Zugriff auf Home Assistant. Echte Geräte dürfen nur eigenen Gebäuden zugeordnet werden; ihre Zustände und Raumfarben erscheinen nur im Modellabruf des freigegebenen Kontos. Simulationen bleiben für berechtigte Gebäudemitglieder sichtbar. Gebäudeübergreifende Verschiebung von Simulationen erfolgt nur zwischen eigenen Gebäuden.

## RGB und Modell

Die Beispiel-Schreibtischlampe meldet in Home Assistant `hs` und `color_temp`; RGB-Steuerung ist verfügbar. Die App zeigt einen Farbwähler und Helligkeit. **Farbe anwenden und einschalten** sendet erst beim ausdrücklichen Tippen, nicht während des Ziehens am Farbwähler. Home Assistant erhält nur die fest freigegebene Light-Entity mit `rgb_color`, optional `brightness` und `turn_on/turn_off`. Fähigkeiten und Wertebereiche werden serverseitig geprüft; ein nicht bestätigter Zustand wird nicht als Erfolg dargestellt. Wegen geräteseitiger Farbkonvertierung gilt eine begrenzte RGB-/Helligkeitstoleranz bei der Rückprüfung.

Simulationen können ebenfalls RGB-Farben speichern. Beim Modellabgleich werden zugeordnete, erreichbare eingeschaltete Lampen zu einer vereinfachten mittleren Raumfarbe zusammengefasst. Das ist eine UI-Markierung, keine physikalische Lichtsimulation. Unbekannte Geräte werden nicht als ausgeschaltet ausgegeben. Verknüpfte Räume sind im Viewer nicht zusätzlich über den Simulationsschalter bedienbar; die echte Bedienung bleibt im Gerätebereich.

Der native Viewer erhält einen Schattenboden und eine gerichtete Lichtquelle mit begrenzter Shadow-Map. Farbige Raumvolumina bleiben als transparente Markierung durch Wände sichtbar. Keine IFC-Geometrie wird für Lichtfarbe oder Schatten verändert.

## Karte in BIM-Optik

Im gespeicherten 3D-Modell öffnet das **Kartensymbol** die Standortauswahl. Standort, Modellrotation im Uhrzeigersinn und Meter pro Modelleinheit werden pro IFC-Dokument gespeichert. Der ausgewählte Standort entspricht dem geometrischen Modellmittelpunkt. Die Position wird mit berechtigten Gebäudemitgliedern geteilt; die App weist vor dem Speichern darauf hin. Diese manuelle Platzierung ist keine vermessungsgerechte automatische Georeferenzierung. Verschiedene IFC-Dateien desselben Gebäudes können unterschiedliche Ursprünge haben und werden deshalb separat platziert.

Die Auswahlkarte verwendet MapKit. Erst **Speichern & Straßen laden** übermittelt den gewählten etwa 200-Meter-Kartenausschnitt an den öffentlichen Dienst `ovp.dresel.systems` (Europa-Daten). Keine IFC-Datei, privaten Lampen, E-Mails oder Zugangsschlüssel werden übermittelt. Daten werden begrenzt und auf dem Projektserver zwischengespeichert; der mobile Viewer lädt selbst keine Kartentiles oder externen Skripte. Drehen/Skalieren am unveränderten Standort verwendet den vorhandenen Kartenausschnitt weiter.

Die tatsächlichen Straßenlinien, vereinfachten Gebäudeumrisse und ausgewählten Grünflächen aus OpenStreetMap werden direkt mit Three.js in einer hellen grauen BIM-Optik gezeichnet. Fehlende Nachbargebäudehöhen werden ausdrücklich als geschätzt gekennzeichnet; keine erfundenen Fenster oder behauptete Vermessungsgenauigkeit. Der Gebäudeumriss am Modellanker wird ausgeblendet, um eine doppelte Darstellung unter dem IFC zu vermeiden. Der ursprünglich geprüfte globale Dienst war überlastet; die offiziell gelistete Europa-Instanz lieferte im echten Innenstadt-Test 57 Straßenabschnitte. Abfragen sind zeitlich und größenmäßig begrenzt (zehn je Konto/Stunde, 100 im Projekt/24 Stunden, zwei gleichzeitig); bei Dienstfehler bleibt eine sichtbare Fehlermeldung. Ohne erfolgreich geladene Daten wird keine angeblich echte Umgebung generiert.

Im Viewer steht die Attribution **© OpenStreetMap-Mitwirkende** mit Link zur [ODbL-/Copyright-Seite](https://www.openstreetmap.org/copyright). Vereinfachte OSM-Daten bleiben entsprechend lizenziert; sie werden nicht als proprietäre Projektdaten ausgegeben.

## Technik und Tests

Additiv: `app_lamp_locations`, `app_model_map_views`, `app_map_requests`, nullable Modell-/Raumverweise und RGB-/Helligkeitsfelder in `app_devices`. Keine bestehenden Datenbank-Volumes löschen. Zugriffsschutz, revisionsgeprüfte Zuordnung, feste Home-Assistant-Ziele, dauerhafte Auftragskennungen und keine automatische Wiederholung physischer Schaltbefehle bleiben bestehen.

API-Erweiterungen: `GET documents/:id/model-rooms`, `PUT integrations/home-assistant/lights/:key/location`, `PUT buildings/:id/devices/:device/location`, `GET buildings/:id/lamps`, `GET/PUT documents/:id/map-view`, `POST documents/:id/map-view/load`. Modellabrufe ergänzen private/transiente `device_lights` und gespeicherte `map_view`; die IFC-Originaldatei bleibt unverändert.

Backendtests umfassen Raum-/Modellzugehörigkeit, fremde Konten, Revisionen, RGB-Payload und Wertebereiche, private Raumfarben, spätere Simulationszuordnung, Gebäudewechsel sowie explizite Kartennetzwerkabfragen und beschränkte Geometrie. Viewer und iPhone werden gebaut; die lokale visuelle Prüfung verwendet ein eigenes vorhandenes IFC mit ausdrücklich gekennzeichneter Testfarbe und Testumgebung. Reale Farbwechsel und eine genaue Kartenplatzierung auf Felix’ iPhone bleiben bewusst vom Nutzer zu prüfen.

Quellen: [Home Assistant Light](https://www.home-assistant.io/integrations/light/), [Three.js Schatten](https://threejs.org/manual/pages/shadows.html), [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), [OpenStreetMap-Lizenz](https://www.openstreetmap.org/copyright).
