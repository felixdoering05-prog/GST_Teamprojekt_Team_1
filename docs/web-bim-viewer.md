# Gemeinsamer IFC-Viewer für Website und iPhone

Stand: 10. November 2026.

## Bedienung

Im Web öffnet **BIM-Viewer** standardmäßig den h_da-Campus mit dem originalen D21-IFC, sofern es auf dem Server eingerichtet und für das persönliche Konto freigegeben ist. Ohne Modellzugriff bleibt die Campuskarte mit einem flachen D21-Grundriss verfügbar. Eigene IFC-Dateien lassen sich weiterhin aus der persönlichen Gebäudemappe auswählen oder unter **Gebäude & Räume → Bilder & Pläne → In 3D öffnen** starten. Für Website und iPhone dasselbe persönliche Konto verwenden.

Die Webansicht orientiert sich an den vier bereitgestellten Referenzbildern: orthografische Architekturansicht, helle Umgebung, schwebende Beschriftung und seitliche Geschossauswahl. Es gibt keine Bauphasen, Vergaben oder Terminanzeigen. Die optionale **Beispielcampus-Stilvorschau** ist selbst erzeugte IFC4-Geometrie mit einer erfundenen Umgebung, ausdrücklich kein D21-Modell. Eigene IFC-Dateien behalten ihre exportierte Geometrie und erhalten keine erfundene Umgebung.

**Geschosse:** Ein Geschoss auswählen, um das Gebäude bis zu dieser Etage freizulegen; **Gesamtes Gebäude** hebt den Schnitt auf. **Geschosse trennen** versetzt die exportierten Geschosse vertikal. Die Zuordnung stammt aus `IFCBUILDINGSTOREY`, räumlicher Enthaltung und Aggregationen; fehlen zugeordnete Geometrien, werden keine Etagen erfunden. Schnitthöhen werden aus der bereits transformierten Geometrie ermittelt, damit IFC-Längeneinheiten nicht mit Viewer-Koordinaten vermischt werden. Mehrgeschossige Elemente werden nicht in neue Bauteile zerlegt. Originalmaterialien eigener IFC-Dateien bleiben erhalten.

Persönlich hochgeladene Modelle verwenden auf Website und iPhone dieselben Gebäude, Dokument-IDs und IFC-Dateien in PostgreSQL (`app_documents`). Die vorhandenen Dokument-Endpunkte bleiben unverändert. Das private D21-Original wird separat und schreibgeschützt über `/api/v1/campus/d21` (Metadaten) und `/api/v1/campus/d21/model` (Datei) bereitgestellt; es wird nicht in die App-Datenbank hochgeladen. Zugriff erhalten ausschließlich Eigentümer und angenommene Mitglieder des konfigurierten bestehenden Gebäudes.

Der Browser authentifiziert den Download mit der bestehenden persönlichen Sitzung. Das eingebettete Viewer-Fenster erhält nur IFC-Bytes per `postMessage` mit Prüfung von Ursprung und Absender. Sitzungstoken werden nicht in URLs oder an den Viewer übertragen. Bibliotheken und WASM liegen auf dem eigenen Server; keine externen Viewer-Dienste.

## Funktionen und Grenzen

Drehen, Verschieben, Zoomen, Draufsicht, Bauteilwahl, Farbwahl, Ausblenden, Wiederherstellen und eine Lichtzustandsansicht für explizit exportierte IFCSPACE-Räume. Persönliche Modelle mit zugeordneten Geräten zeigen den bestätigten Lichtzustand und RGB-Farbe; bedient werden diese Geräte im Gerätebereich. Räume ohne Gerätezuordnung können lokal simuliert werden. Fehlende Raumobjekte werden nicht aus Wänden erraten. IFC2x3/IFC4, maximal 20 MB, mobile Geometriegrenzen wie in der App. Die BIM-Seite konzentriert sich auf das dreidimensionale Modell; der alte schematische Grundriss ist dort nicht mehr eingeblendet.

Bei persönlichen Modellen werden bestätigte Farben, ausgeblendete Bauteile und Lichtzustände über den bestehenden Modellstand synchronisiert. Die aktuelle, im Team ergänzte Karten-/Geräteanbindung bleibt für persönliche Modelle erhalten. Kamera, Beschriftung, Geschossschnitt und vertikale Geschossabstände bleiben lokal. D21-Original, Stilvorschau und Heat map speichern sämtliche Ansichtsänderungen ausschließlich lokal. Die Heat map steuert keine Geräte und berechnet keine physikalischen Lichtzustände.

## Quellcode und Build

`dashboard/base44-frontend/ifc-viewer/` enthält den aus `ios/ifc-viewer/` abgeleiteten Viewer-Kern. Die Web-Variante lädt Dateien über den geprüften Nachrichtenkanal zum Elternfenster und besitzt die hier beschriebene eigenständige Architektur- und Geschossdarstellung. Änderungen an gemeinsamen Interaktionen, Befehlen und dem Modellzustandsvertrag weiterhin mit iOS abgleichen. `storeys.js`, `example.js` und `surroundings.js` ergänzen die Webdarstellung.

`npm run build` baut mit `scripts/build-ifc.mjs` zunächst den eigenständigen Viewer und kopiert WASM und Lizenztexte nach `public/ifc-viewer/`, anschließend die Website. Generierte Viewer-Dateien werden nicht committet. Docker führt denselben Build aus.

## Prüfung

`npm run test:viewer` prüft das Parsen der selbst erzeugten IFC4-Vorschau, die Zuordnung aller dargestellten Bauteile, verschachtelte/zyklische räumliche Beziehungen und Schnitthöhen mit getrennten Geschossen. Zusätzlich Website-Build und ESLint sowie Browserprüfung mit lokal simuliertem Konto und eigener IFC-Raum-Testdatei. Keine Produktivdaten für diese Tests.

Lokaler Prüflauf vom 3. November 2026: drei IFC-/Geschosstests, Build und ESLint bestanden. Im Browser wurden die Stilvorschau, das Öffnen der obersten Etage ohne Dachplatte, vertikale Geschossabstände, Zoom und die Übertragung der vorhandenen `ios/tests/fixtures/light-room.ifc` geprüft. Die Testdatei besitzt keine Geschosszuordnung; der Viewer zeigt entsprechend null Geschosse und deaktiviert die Trennung. Bei 390 px Breite funktionieren Modellauswahl und einklappbare Geschossliste ohne horizontalen Seitenüberlauf; der Wechsel zur Desktopbreite passt die orthografische Ansicht an. Keine Browserfehler im Prüflauf. Produktivserver und ein echtes D21-Modell waren nicht Teil dieses Tests.

## D21 auf dem Campus

Standorte und Gebäudekennungen stammen aus der [h_da-Campuskarte](https://www2.h-da.de/imap/index.html). D21 wird bei 8.63648° Ost, 49.8640005° Nord, Holzhofallee 38 verankert. Die importierte IFC-Site-Koordinate liegt deutlich abseits dieses Standorts und wird nicht für die Platzierung verwendet. Die Modellgröße bleibt unverändert; die ungefähre Drehung folgt der längsten Kante des [OSM-D21-Grundrisses](https://www.openstreetmap.org/way/148028797). Keine vermessungstechnische oder fachlich freigegebene Georeferenzierung.

Die Karte lädt nur im Sichtfeld liegende Rasterkacheln von `tile.openstreetmap.org` mit normalem Browser-Cache; kein Vorabruf, Offline-Download oder fremder Mapbox-Schlüssel. Quellen, ODbL-Lizenz und verwendete öffentliche Standort-/Grundrissdaten sind unter `/campus-data/index.html` verlinkt. Das Original-IFC ist dort nicht enthalten.

### Private Bereitstellung auf dem Projektserver

1. `H_DA_D21_Final.ifc` aus dem privaten Release `d21-dateien-2026-11-02` herunterladen. SHA-256 des verwendeten Stands: `fd4474dea8b6c342f27ef8d849298f8e4ebb23467977b88a9dc44fdc2d735057` (18.579.648 Bytes).
2. Außerhalb von Git und Webroot in das private Modellverzeichnis kopieren, beispielsweise `dashboard/private-models/H_DA_D21_Final.ifc`. Die Compose-Datei bindet dieses Verzeichnis ausschließlich lesend in die API ein. Eine alternative Ablage über `D21_CAMPUS_MODELS_DIR` in der serverseitigen `.env` konfigurieren.
3. `D21_CAMPUS_BUILDING_ID` auf die numerische ID eines vorhandenen D21-Gebäudes setzen. Nur dessen Eigentümer und angenommene Mitglieder erhalten Zugriff; ausstehende Einladungen reichen nicht. Keine automatische Freigabe an alle Konten.
4. Nach Teamreview und Merge die normale Bereitstellung durchführen. Mit einem berechtigten und einem unberechtigten Konto prüfen. Ohne Konfiguration oder Datei zeigt die Website die Campuskarte und einen verständlichen Modellhinweis.

Keine Modellkopie im öffentlichen Repository, im Website-Build oder in `app_documents`. Keine Änderung der Originaldatei durch die Heat map. Die lokale Vorschau nutzt dieselbe Datei aus einem privaten Verzeichnis außerhalb des Repositorys.

Der untersuchte Originalstand enthält 6.201 Meshes und 473.055 Vertices und liegt damit unter den mobilen Viewer-Grenzen. Web-IFC meldet bei der Geometrieprüfung sieben nicht triangulierbare BRep-Begrenzungen (`No basis found for brep`); eine vollständige Rekonstruktion jedes IFC-Bauteils ist deshalb nicht zugesichert. Es werden nur tatsächlich gelesene Geschosse/Geometrien angezeigt, einschließlich vorhandener Zwischen- und Bezugsebenen.

## Heat map und Jahreszeiten

Der neue Reiter **Heat map** (`/heat-map`) verwendet D21 und die Campuskarte. Vier Jahreszeiten, ein Tag-im-Jahr-Regler, ein Stundenregler (00–23 Uhr), Start/Pause für den Jahresverlauf, ein Monatsvergleich und eine abschaltbare transparente Campuseinfärbung steuern die Ansicht. Flächen anklicken zeigt den simulierten Wert; der Wert aktualisiert sich mit dem Szenario. Geschossschnitt und Kamerasteuerung bleiben verfügbar. Die Temperaturlegende bleibt von **−10 bis 50 °C** fest: Blau → Türkis → Grün → Gelb → Orange → Rot.

**Gemessene Luft, simulierte Oberflächen:** Auf Emirs Ergänzung basiert die Lufttemperatur jetzt auf historischen DWD-Stundenmessungen der Station **Frankfurt/Main (01420)** für das vollständige Kalenderjahr **2025**. Sie dient als regionale Referenz und ist keine Messung am D21. Die Karte „DWD-Lufttemperatur“ zeigt die tatsächliche Beobachtung samt Messzeit; besonnte/abgewandte Referenzflächen und die Einfärbung des IFC-Gebäudes bleiben illustrative Berechnungen. `heat-simulation.js` ergänzt die gemessene Lufttemperatur um eine stilisierte, saison- und ausrichtungsabhängige Erwärmung. Die Campuskarte erhält eine schematische räumliche Variation. Es werden keine realen Materialparameter, Verschattungen oder Raumtemperaturen berechnet. Die geplante direkte Campus-Messanbindung bleibt davon unabhängig.

Der versionierte öffentliche Datenausschnitt liegt in `dashboard/base44-frontend/public/weather/frankfurt-2025.json`; Herkunft und Lizenz stehen daneben in `README.md`. Er wird vom eigenen Webserver geladen, ohne externen Laufzeitabruf, API-Schlüssel oder Upload zur App-Datenbank. `npm run import:weather` erstellt den Ausschnitt reproduzierbar aus dem offiziellen DWD-Archiv. ZIP-Prüfsumme, Produktdatei und Abrufzeit bleiben im Snapshot nachvollziehbar. Temperaturfeld: `TT_TU`, °C; DWD-Qualitätsniveau `QN_9` bleibt erhalten. Relative Luftfeuchte wird nicht für diese Heat map verwendet.

Rohzeiten sind UTC. `weather-profile.js` ordnet die 8.760 Stunden dem deutschen Kalenderjahr 2025 in **Europe/Berlin (MEZ/MESZ)** zu: erster UTC-Zeitpunkt 31.12.2024, 23:00 Uhr; letzter 31.12.2025, 22:00 Uhr. Die bei der Frühlingsumstellung nicht existierende Ortsstunde bleibt ohne Messwert; bei der doppelten Herbststunde wird die frühere Beobachtung verwendet und die Mehrdeutigkeit samt UTC-Zeit angezeigt. Fehlwerte (`-999` im Original) werden als `null` übernommen, ohne Interpolation. Fehlende oder ungültige Wetterdaten schalten die Einfärbung aus: neutrales Grau am Modell, keine Campusüberlagerung, keine versteckte synthetische Ersatztemperatur. Die feste Farbskala sättigt außerhalb −10/50 °C; die Legende kennzeichnet die Randfarben mit ≤/≥, numerische Abfragen behalten den ungekürzten Wert. Monatsstichproben verwenden jeweils die eigene Messung am 15. des Monats zur gewählten Ortszeit, keine Monatsmittelwerte und keine wiederverwendete Temperatur des ausgewählten Tages.

Der GPU-Shader aktualisiert gemeinsame Temperaturuniformen ohne erneutes Laden oder Kopieren der IFC-Geometrie. Szenarien gelangen per ursprungs- und absendergeprüftem Nachrichtenkanal in den Viewer; Werte werden auf gültige Tage/Stunden begrenzt. Simulation und Farbskala verändern weder Originalmaterialien in der IFC-Datei noch gespeicherte Modellzustände. Beim Verlassen der Seite werden Animation, Nachrichtenempfänger und Grafikressourcen freigegeben; eine laufende Animation pausiert bei verborgenem Browserdokument.

Prüfung nach Abgleich mit dem aktuellen Hauptbranch: neun Viewer-Tests (IFC/Geschosse, Campuskoordinaten, Kachelanschlüsse, Farbanker und Begrenzungen, Winter/Sommer, Besonnung, vollständiger Jahresverlauf und ungültige Szenariowerte). Zusätzlich 41 Backendtests für Campuszugriff, Konten, Dokumente, Zusammenarbeit, Karten/Geräte und Modellstände sowie Website-Build und ESLint. Die Serverbereitstellung erfolgt erst nach dem üblichen Teamreview.

Browserprüfung der ersten Variante mit dem privaten Original-IFC und lokalem Vorschaukonto: Sommer-/Winterwechsel, Tageszeit bis 00:00 Uhr, Jahresanimation mit Pause, abschaltbare Campusüberlagerung, Schnitt auf 1.OG und Rückkehr zum Gesamtgebäude sowie Temperaturabfrage einer Modelloberfläche. Bei 390 px Breite kein horizontaler Seitenüberlauf; Bedienelemente stehen unter der Modellfläche. Keine Browserfehler oder Warnungen in diesem Prüflauf. Die Karte wurde über tatsächlich geladene OpenStreetMap-Kacheln geprüft. Ergänzende Wettertests prüfen die UTC-/Ortszeitzuordnung, beide Zeitumstellungen, Null-/Nullgrad-Unterscheidung und den unveränderten Messwert als Eingabe der Oberflächensimulation.

Wetterergänzung geprüft: 18 Viewer-/Wettertests einschließlich ZIP-CRC-Prüfung; Build und ESLint bestanden. Alle 8.760 exportierten Temperatur-/Qualitätswertpaare wurden zusätzlich unabhängig mit dem originalen DWD-Produkt verglichen: identisch, 75 Temperaturfehlwerte, `QN_9` durchgängig 3. Der verwendete Archivhash ist `c50d340202d5147d781f6bbb5a880691fbd3215e2c730d9b9cca2ea801440282`. Browser: 16.07.2025 14:00 MESZ entspricht 12:00 UTC und 19,7 °C Lufttemperatur. Am 30.03.2025 02:00 Ortszeit bleiben alle Temperaturanzeigen leer und das Modell grau; beim Wechsel zu 03:00 erscheint der echte Messwert von 1,2 °C. Auch der vorherige HTTP-Fehlerfall ohne Wetterdatei zeigt keine Ersatzwerte. Mobile Breite 390 px ohne horizontalen Überlauf; abschließender regulärer Browserlauf ohne Fehler/Warnungen. Legende und Shader verwenden dieselbe sRGB-Farbinterpolation.


## Weltweiter Gebäudestandort

Beim Anlegen oder Bearbeiten eines Gebäudes können optional WGS84-Breitengrad und -Längengrad sowie die Modellrichtung ab Norden hinterlegt werden. Die Koordinaten lassen sich manuell eingeben; die Adresse wird nicht an einen Suchdienst gesendet. Das IFC bleibt unverändert und wird im Viewer auf den Standort bezogen und mit der angegebenen Richtung ausgerichtet. Die Funktion ist länderunabhängig und funktioniert auch für Standorte in Italien.

Die OpenStreetMap-Karte ist pro Gebäude standardmäßig ausgeschaltet. Erst nach gesetztem Einverständnis werden sichtbare Kartenkacheln für diesen Standort geladen; dabei erhält OpenStreetMap Anfragen zum betrachteten Kartenausschnitt. Bestehende Gebäude ohne Koordinaten und Einverständnis behalten ihr bisheriges Verhalten. Die Gebäudefelder werden ergänzend in den vorhandenen Gebäudedaten gespeichert; es ist keine Umstellung oder Löschung vorhandener Projektdaten vorgesehen.


## Glassy-Layout und Heatmap-Modi

Die globale Oberfläche verwendet eine gemeinsame Glassy-Sprache mit kühlem blau-grauem Hintergrund, sichtbar abgegrenzten Glasflächen, ruhigen türkisen Akzenten und stärkerer Lesbarkeit. Der Viewer übernimmt die schwebenden, abgerundeten Steuerungsflächen der Referenz; D21-Geschoss-, Bauteil-, Raumlicht- und IFC-Bedienung bleibt projektbezogen.

Die Heatmap hat drei klar getrennte Darstellungen:

- **Raummesswerte:** Es werden ausschließlich Temperaturmessungen mit `source=real`, Qualitätsstatus `ok`, aktivem real gekennzeichneten Temperatur-Sensor, Einheit °C und Zeitstempel aus den letzten 24 Stunden berücksichtigt. Ein Raum wird nur eingefärbt, wenn die Gebäuderaumzuordnung eine IFC GlobalId enthält, die im geladenen Modell exakt vorkommt. Werte werden pro Raum nicht gemittelt oder über Räume interpoliert. Räume ohne passenden Messwert behalten ihre IFC-Originaldarstellung.
- **Raumsimulation:** Für eine visuelle Präsentation kann ein festes Szenario reproduzierbare Temperaturen je IFC-Raum darstellen. Die Werte werden deterministisch aus Szenario, GlobalId und Geschosslage abgeleitet; der Solaraufschlag dient nur als illustrative Szenarioannahme. Die Werte sind keine Messungen und keine validierte bauphysikalische Prognose, beziehen keine Wetter- oder Sensordaten ein und werden nicht gespeichert.
- **Campus-Simulation:** Die bestehende DWD-Ansicht bleibt erreichbar. Sie verwendet historische stündliche Lufttemperaturmessungen der DWD-Station Frankfurt/Main aus 2025 als Außenluft-Referenz. Die räumliche Oberflächentemperatur bleibt eine schematische Simulation; sie ist keine Gebäudemessung und keine Raumtemperaturprognose.

Das Backend stellt außerdem standortbezogene Open-Meteo-Wettermodell-/Prognosedaten bereit. Die Raummesswert-Heatmap zeigt sie getrennt als Außenwetter; sie werden nicht zur Berechnung der Raumfarben verwendet. Aktuelle Wetterdaten können ausdrücklich aktualisiert werden. Fehlt ein Standort, eine IFC GlobalId-Zuordnung, ein passender Messwert oder ein Wetterabruf, zeigt die Oberfläche den Datenmangel an, statt Werte zu erzeugen.

### Prüfstatus zum Implementierungsstand

| Bereich | Nachweisbarer Stand |
|---|---|
| Gebäudedaten und IFC-Zuordnung | Gebäude, Dateien und IFC-Raumdaten bleiben im vorhandenen Datenpfad; neue Raummesswertanzeige liest bestehende Sensor-/Messdatensätze. |
| IFC-Geschossauswahl | Vorhandene Geschossauswahl wird für Filterung der eingefärbten Räume weiterverwendet. |
| Echte Raum-Heatmap | Nur mit gültiger Zuordnung `Room.ifc_global_id ↔ IFCSPACE.GlobalId`, Sensorstatus, Einheit, Qualitätsstatus und frischem `source=real)-Messwert. |
| Wetter | DWD-Datei: historische Stationsbeobachtung 2025. Open-Meteo-API: Außenwettermodell/Prognose. Beides wird nicht als Innenraummessung ausgegeben. |
| Unbekannt / noch nachzuweisen | Für jedes reale Gebäude muss geprüft werden, ob Sensoren und Räume in Produktivdaten korrekt mit der IFC GlobalId verbunden sind und ob Live-Messwerte im gewünschten Zeitfenster eintreffen. |
| Bestandsschutz | Die neue Ansicht verändert keine Gebäude-, Sensor-, Messwert- oder IFC-Datensätze. Sie nutzt nur bestehende Datensätze und ergänzt die Oberfläche. |
