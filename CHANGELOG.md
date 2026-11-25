# Änderungsverlauf

## 25. November 2026 – WLAN-Präsenz: Knoten Räumen zuordnen

- Ein ESP32-Knoten lässt sich unter **Sensorik → WLAN-Präsenz** einem Raum des Gebäudes zuordnen (Auswahlliste der Räume aus dem Gebäudemodell) oder weiterhin frei benennen.
- Neue Übersicht über den Knoten: je Raum „≈ n Personen“, „leer“ oder „veraltet“. Mehrere Knoten im selben Raum zählen nicht doppelt; es gilt die höchste Personenzahl der aktuellen Knoten. Schätzwerte.

## 25. November 2026 – WLAN-Präsenz mit RuView (experimentell)

- Neuer Schalter unter **Daten & Einstellungen → WLAN-Präsenz (RuView)**, standardmäßig aus. Nur eingeschaltet nimmt der Server Präsenzdaten an und die Sensorik zeigt sie.
- ESP32-S3-Knoten mit RuView-Firmware senden im Heimnetz an eine neue Brücke (`sensorik/ruview-bridge`). Sie meldet alle 10 Sekunden je Knoten Anwesenheit, Bewegung, Personenzahl, Atemfrequenz und Signalqualität; CSI-Rohdaten verlassen das Heimnetz nicht.
- Sensorik zeigt je Knoten eine Karte mit Raumnamen; Werte älter als 60 Sekunden gelten als veraltet. Verlauf wird nach 24 Stunden gelöscht, Sperren einer Brücke löscht ihre Werte. Schätzwerte, kein Medizinprodukt.

## 24. November 2026 – Sensorwerte im Dashboard aktuell halten

- Die Kommandozentrale lädt Messwerte jede Minute und bei Rückkehr zum Browsertab im Hintergrund nach. Bei einem vorübergehenden Fehler bleiben die letzten Werte sichtbar. „Stand“ nennt den neuesten statt den ältesten Messwert.
- Das Modell-Widget öffnet Raum-Popups wieder per Klick. Seit #209 erschienen sie nur nach Klick, Klicks waren im Dashboard aber abgeschaltet. Bauteile lassen sich dort weiterhin nicht auswählen.

## 17. November 2026 – Smart Home direkt im Webmodell

- „Smart Home“ bzw. „Räume & Geräte“ öffnet eine gemeinsame Raumkarte mit Temperatur, Luftfeuchte, CO₂, Einzelmesswerten und Lampen. Auswahl per Klick auf die Raumgeometrie oder über die Raumliste, auch ohne Raumkörper.
- Bestehende serverseitig freigegebene Home-Assistant-Lampen lassen sich schalten, dimmen und einfärben; Simulationslampen/Steckdosen verwenden ihre bisherigen geschützten Befehlswege. „Raumlicht aus“ meldet bestätigte und unbestätigte Ergebnisse getrennt. Keine automatischen Wiederholungen von Schaltbefehlen.
- Eigentümer können Geräte dem ausgewählten IFC-Raum zuordnen bzw. aus einem anderen Raum umordnen. Importierte Home-Assistant-Lampen ohne Server-Schaltzugang bleiben als Zustandsanzeige sichtbar und verweisen auf die iPhone-App im Heimnetz.
- Sensorwerte verschiedener Geräte im selben Raum werden pro Messgröße zusammengeführt. Ein ESP32 verdeckt keinen zusätzlichen CO₂-Sensor mehr; derselbe Sensor wird nicht doppelt gezählt. Quelle, Zeitstempel und veraltete Einzelwerte bleiben erkennbar, echte Messwerte haben Vorrang vor Simulationen.
- Lampenstatus wird parallel abgefragt; veraltete importierte Zustände gelten nicht als live. Das Raumlicht berücksichtigt die Helligkeit. Modellknöpfe sind bis zur Initialisierung gesperrt.

## 17. November 2026 – Robustere Raumerkennung

- Grundrisse: nummerierte Raumnamen und kombinierte Namens-/Flächenbeschriftungen werden übernommen; ganzzahlige Flächenangaben sind zulässig, technische Höhen-/Maßtexte bleiben ausgeschlossen.
- Kleine Lücken in Wandanschlüssen bis maximal 30 mm können für die Raumgrenzen geschlossen werden. Dies wird im Qualitätsbericht markiert; Originalwände und echte Durchgänge bleiben unverändert.
- IFC-Analyse: Geschosse werden auch über verschachtelte Raumstrukturen ermittelt. Mehrdeutige oder fehlende Geschossbezüge bleiben unbekannt. Bestehende Analyseberichte werden im Hintergrund auf Version 4 aktualisiert; IFC-Dateien werden nicht geändert.
- Bestehende Planentwürfe werden nicht automatisch neu erzeugt oder überschrieben. Modelle ohne IfcSpace benötigen weiterhin ergänzte Raumdaten bzw. eine gesonderte geometrische Ermittlung.

## 17. November 2026 – Gebäude im Web löschen

- Eigentümer können ein geöffnetes Gebäude über „Gebäude löschen“ entfernen. Eine Warnung und die Eingabe des Gebäudenamens bestätigen die endgültige Löschung für alle Mitglieder.
- Der bestehende, serverseitig geschützte Löschweg wird verwendet. Fehler bleiben im Dialog sichtbar; erst nach erfolgreicher Antwort wird das Gebäude aus der Liste und der gespeicherten Auswahl entfernt.

## 17. November 2026 – Neue Sensoren automatisch in die Raum-Popups

- Beim Öffnen eines eigenen Modells im Web-BIM-Viewer (und danach jede Minute) werden neu hinterlegte Sensoren automatisch dem passenden IFC-Raum zugeordnet, wenn ihr Raumname oder ihre Raumnummer eindeutig zu einem Raum im Modell passt (Groß-/Kleinschreibung, Leerzeichen, Umlaute egal). Ihre Werte erscheinen dann im Raum-Popup.
- Ist das nicht eindeutig – Sensor ohne Gebäude, ohne Raum oder Raum nicht/mehrfach im Modell –, fragt eine Karte „Neue Sensoren zuordnen“ über dem Viewer nach: Raum im Modell wählen oder „Nicht in diesem Modell“. Sensoren ohne Gebäude sieht nur der Eigentümer; die Zuordnung setzt dann auch das Gebäude.
- Neue Endpunkte `POST /documents/:id/sensor-placement/sync` und `PUT /documents/:id/sensor-placement/:sensor` (Eigentümer und angenommene Mitglieder). Verknüpft wird über `Room.ifc_global_id`; ein vorhandener Raum ohne IFC-Bezug wird verknüpft statt dupliziert. Die IFC-Datei bleibt unverändert. Demo- und inaktive Sensoren werden nicht abgefragt.
- Prüfung: 231 Backend-Tests (229 bestanden, 2 übersprungen), Viewer-Tests, ESLint, Build; Browserprüfung mit lokaler Test-API und Test-IFC (automatische Zuordnung, Nachfrage, Zuordnen, Popup zeigt Wert).

## 17. November 2026 – Gebäude im Web geführt einrichten

- Neue Einrichtung mit Gebäudedaten, optionalen Bildern, Plänen/IFC und Abschlussübersicht. Gespeicherte Gebäude lassen sich später weiter einrichten, ohne erneut angelegt zu werden.
- Jedes Gebäude öffnet mit einer Übersicht und eigenen Bereichen für Galerie, Pläne/3D und Räume. Eigene und geteilte Gebäude bleiben unterscheidbar.
- Mehrere Dateien auswählen oder ablegen, Übertragung je Datei verfolgen und nur fehlgeschlagene Uploads mit derselben Upload-Kennung erneut versuchen. Während unbestätigter Uploads schützt die Einrichtung vor versehentlichem Weiterschalten.
- Bildergalerie mit Vorschau, Umbenennen, Herunterladen und bestätigtem Löschen. Gespeicherte Unterlagen verwenden dieselben bestehenden Zugriffsrechte wie die App. Die neue Einrichtung aktiviert keine KI- oder Kartendienste automatisch.

## 17. November 2026 – Raum-Popup für jeden Raum, erst nach Klick

- Web-BIM-Viewer: Jeder IFC-Raum hat ein Popup; es erscheint nur, wenn man in den Raum klickt (Raumvolumen oder Boden innerhalb des Raums, z. B. im Geschossschnitt). Klick daneben, erneut in denselben Raum oder auf × schließt es. Wände, Fenster usw. werden wie bisher als Bauteil ausgewählt.
- Räume mit Sensor zeigen Messwerte, Räume ohne Sensor „Keine Sensordaten für diesen Raum“. Der Name lässt sich in jedem Popup per Doppelklick ändern.
- `GET /documents/:id/sensor-overlay` liefert zusätzlich `room_names` (gespeicherte Namen aller Räume des Modells), damit umbenannte Räume ohne Sensor ihren Namen behalten.
- Prüfung: 228 Backend-Tests (226 bestanden, 2 übersprungen), 37 Viewer-Tests, ESLint, Build; Browserprüfung mit lokaler Test-IFC (kein Popup ohne Klick, Raum mit/ohne Sensor, Wand bleibt Bauteilauswahl, Umbenennen, ×).

## 17. November 2026 – Raumnamen per Doppelklick im 3D-Popup ändern

- Doppelklick auf den Raumnamen im Messwert-Popup des Web-BIM-Viewers öffnet ein Eingabefeld; Enter oder Wegklicken speichert, Esc bricht ab. Der Name gilt sofort im Popup und wird nach Bestätigung durch den Server übernommen; bei einem Fehler kehrt der alte Name zurück und ein kurzer Hinweis erscheint.
- Neuer Endpunkt `PUT /documents/:id/rooms/:space/name` (Eigentümer und angenommene Mitglieder, wie die Sensor-Raumzuordnung): speichert den Namen am Raum-Datensatz mit der IFC-GlobalId des IfcSpace, legt ihn bei Bedarf an und ändert die IFC-Datei nicht. 1–60 Zeichen, keine Steuerzeichen. Das Overlay zeigt diesen Namen auch für direkt platzierte ESP32-Geräte.
- Prüfung: 227 Backend-Tests (225 bestanden, 2 übersprungen), 36 Viewer-Tests, ESLint, Website-Build; Browserprüfung mit lokaler Test-IFC und simuliertem Server (Speichern, Fehlerfall, Esc).

## 17. November 2026 – Live-Messwerte als schwebende Popups im Web-BIM-Viewer

- Der Web-BIM-Viewer (und das Dashboard-Widget „BIM-Modell“) fragt `GET /documents/:id/sensor-overlay` alle 30 Sekunden ab und zeigt die neuesten Werte als schwebendes Popup über der Mitte des zugehörigen IFC-Raums: Raumname, Temperatur, Luftfeuchte (ggf. CO₂), Messzeit und Kennzeichnung „live“, „alt“ (> 3 min) oder „Demo“. Dieser Web-Teil war nach dem Merge von PR #188 nur auf dem Feature-Branch geblieben.
- Popups folgen Geschossschnitt und abgesetztem Geschoss; Räume anderer Geschosse werden ausgeblendet. Die Popups sind HTML-Elemente über dem Modell und werden vom Schnitt nicht abgeschnitten.
- Der Overlay-Endpunkt liefert zusätzlich Sensoren, die über „Sensor einem Raum zuordnen“ einem Raum mit IFC-GlobalId dieses Modells zugeordnet sind (z. B. Schlafzimmer), auch ohne direkt platziertes ESP32-Gerät. Nur aktive Sensoren, keine Sensoren widerrufener Geräte, nur mit Gebäudezugang; Sitzungsschlüssel gelangen nicht in den Viewer.
- Prüfung: 225 Backend-Tests (223 bestanden, 2 übersprungen), 35 Viewer-Tests, ESLint, Website-Build; Browserprüfung mit lokal erzeugter Test-IFC (Gesamtgebäude, Erdgeschossschnitt, abgesetztes Geschoss). Produktivdaten und das echte Modell „Zuhause · Grundriss_Hochparterre.ifc“ waren nicht Teil der Prüfung.

## 16. November 2026 – Nala Solutions (iPhone 1.0.141)

- Der Produktname lautet jetzt **Nala Solutions**: App-Anzeigename, Startansicht, Widget, Web-Dashboard, Web-App-Metadaten, Datenschutztexte, Exporte und Passwort-E-Mails sind angepasst.
- Neuer Dashboard-Zugang: `https://nala-solutions.de`, mit persönlicher Account-Anmeldung ohne zusätzlichen Browser-Passwortdialog. Der bisherige Dashboard-Zugang bleibt erreichbar; `kitrifftgebäude.de` bleibt die Landingpage mit aktualisiertem Namen und Dashboard-Link.
- Die Home-Assistant-Integration verwendet den neuen Anzeigenamen; ihre technische Kennung bleibt kompatibel. Bestehende App-Kennungen, Sitzungen, Gerätebrücken und Signierungsressourcen werden nicht umbenannt oder automatisch migriert.
- Die Domain wird mit eigenem HTTPS-Zertifikat und eigener nginx-Datei eingerichtet. Eine native Installation von 1.0.141 ist damit noch nicht erfolgt.

## 16. November 2026 – Planentwurf: Fortschritt und Ebenenwahl (iPhone 1.0.139)

- Die Anzeige unterscheidet Warteschlange, laufende Verarbeitung und fertigen Entwurf. Die animierte Prozentanzeige ist phasen- und zeitbasiert geschätzt, keine gemessene Fertigstellungsquote.
- Erkannte Pläne lassen sich vor dem Neuaufbau Ebenen/Geschossen zuordnen; siehe [#194](../../pull/194).
- Aktueller Quellstand ist 1.0.139. Eine erfolgreiche Installation dieses Gesamtstands auf dem iPhone ist noch nicht nachgewiesen.

## 16. November 2026 – Titan-FS-Dashboard auf titanfs.de

- Das vollständige Dashboard erhält `https://titanfs.de` mit HTTPS und ausschließlich persönlicher Account-Anmeldung ohne zusätzlichen Browser-Passwortdialog. Gebäudedaten und Verwaltung bleiben durch Sitzung und Berechtigungen geschützt; der bisherige App-Zugang bleibt gültig.
- `kitrifftgebäude.de` bleibt die öffentliche Landingpage. Ihr Dashboard-Link führt zur neuen Domain.
- Einrichtung mit DNS-Prüfung, optionaler www-Weiterleitung, Zertifikatserneuerung und Wiederherstellung der vorherigen Konfiguration bei Fehlern.

## 16. November 2026 – Zuverlässigere Plananalyse

- Gemini-Überlastung bei vorübergehenden 5xx-Antworten wird begrenzt wiederholt und verständlich gemeldet ([#190](../../pull/190)); eine Überlastung ist keine fachliche Ablehnung des Plans.
- Die Vektorvermessung verwirft das eigentliche Gebäude nicht mehr als Planrahmen ([#191](../../pull/191)).

## 16. November 2026 – Echter ESP32 + BME280 im IFC-Raum und Messwert-Popups in der 3D-Ansicht

- Ein angemeldeter ESP32 kann vom Eigentümer auf echte Hardware (BME280) umgestellt und einem IfcSpace eines hochgeladenen IFC-Modells zugeordnet werden (`PUT /sensor-devices/:id`). Echte Geräte senden genau Temperatur und Luftfeuchte; diese Werte werden als `source=real` gespeichert und erscheinen damit auch in den Raumtemperaturen. Kein CO₂-Platzhalter mehr.
- Für die Zuordnung entsteht ein echter Raum-Datensatz mit der IFC-GlobalId des Raums. Alte Simulationswerte bleiben getrennt als Demo erhalten; ein echtes Gerät kann nicht zurück auf Simulation gestellt werden.
- Neuer lesender Endpunkt `GET /documents/:id/sensor-overlay` liefert die neuesten Werte je IFC-Raum (nur mit Gebäudezugang, ohne Geräteschlüssel). `GET /buildings/:id/sensor-devices` listet Geräte ohne Schlüssel.
- 3D-Ansicht (iPhone): kleines Popup über der Mitte des zugeordneten Raums mit Temperatur und Luftfeuchte, Aktualisierung alle 30 Sekunden, „alt“ nach drei Minuten ohne Werte. Die ESP32-Karte im Dashboard kennzeichnet echte Werte nicht mehr als simuliert.
- Gebäude-Dashboard zeigt ein neu hochgeladenes IFC-Modell sofort: Es nutzt den aktuellen Stand der Gebäudeliste statt des Stands beim Öffnen und lädt die Liste neu, solange kein Modell bekannt ist. Vorher erschien weiter „3D-Modell hinzufügen“, obwohl der 3D-Reiter das Modell schon zeigte.
- Prüfung: neue Backend-Tests für Rechte, Revision, Raumprüfung, Messwertannahme und Overlay; Viewer-Tests für Eingabeprüfung und Formatierung. Ein integrierter Geräte-/TestFlight-Nachweis steht aus; die bei der ursprünglichen Implementierung verwendete lokale Xcode-Version konnte das Projektformat nicht öffnen.

## 16. November 2026 – Sensoren gemeinsam Räumen zuordnen (iPhone 1.0.138)

- Unter Sensorik → Daten → Sensor einem Raum zuordnen lassen sich ESP32- und CSV-Sensoren mit vorhandenen Räumen verbinden. Ein neuer Raum kann direkt beim Zuordnen angelegt werden.
- Das gewählte Gebäude ist der feste Rahmen: Räume und Sensoren anderer Gebäude werden abgewiesen. Eigentümer und angenommene Mitglieder sehen und bearbeiten dieselbe Zuordnung.
- ESP32-Karten zeigen den Raumnamen. Neue Pakete übernehmen die aktuelle Zuordnung; historische Messwerte behalten ihren früheren Raum. Simulierte Werte bleiben ausdrücklich als Testwerte gekennzeichnet.
- Home-Assistant-Sensoren behalten ihre eigene Bereich/Raum-Zuordnung im Home-Assistant-Import.

## 16. November 2026 – Grundrisse aus Fotos/Scans und Korrektur-Editor (iPhone 1.0.137)

- Servererkennung für Rasterpläne, Fotos und Skizzen mit OpenCV; Raumnamen und Maße werden ergänzend mit Gemini gelesen.
- Web und iPhone bieten einen Korrektur-Editor für erkannte Grundrisse; Änderungen können einen neuen IFC-Entwurf erzeugen ([#185](../../pull/185)).
- Fachliche Prüfung und bestätigte Übernahme bleiben erforderlich. [Ablauf und Grenzen](docs/plan-zu-ifc.md).

## 16. November 2026 – kitrifftgebäude.de ausschließlich für die Landingpage

- Die Domain-Konfiguration veröffentlicht die vorhandene Projektseite mit ihren Bildern, Styles und PDF. App und geschütztes Dashboard behalten ihren bisherigen Zugang; keine Schlüsselbund- oder Entwurfsmigration.
- App-/API-Routen werden auf der Landingpage-Domain nicht veröffentlicht. Der Dashboard-Link führt zum bisherigen geschützten Zugang.
- Aktivierung erst bei passendem DNS und gültigem HTTPS-Zertifikat; automatischer Rückfall auf die vorherige nginx-Konfiguration bei Fehlern.

## 16. November 2026 – ESP32-Werte im normalen Dashboard (iPhone 1.0.136)

- Bereits verbundene ESP32 erscheinen automatisch im Gebäude-Dashboard und unter Sensorik mit Temperatur, Luftfeuchte, CO₂ und Verlauf. Kein zusätzlicher CSV-Sensor und kein Umschalten in den Vorstellungsmodus nötig.
- Die echte WLAN-Übertragung und die simulierten Zahlen bleiben unterscheidbar. Nach mehr als drei Minuten ohne Werte erscheint „Letzter Stand“.
- Eine eigene, lesende Schnittstelle liefert ausschließlich die diesem Gebäude zugeordneten, nicht gesperrten ESP32-Sensoren. Andere Demo-Daten, Energie, Geräteschlüssel und fremde Gebäudedaten werden nicht übernommen.
- „Sensor anlegen“ heißt jetzt „CSV-Sensor anlegen“. Testwerte bleiben von echten Auswertungen, Heatmap und Widget getrennt.

## 16. November 2026 – Lampen aus Home Assistant übernehmen (iPhone 1.0.135)

- Beim App-Import aus Home Assistant stehen jetzt auch Lampen (`light.*`) zur Auswahl: Name, Gerät, Bereich → Raum, Farbfähigkeit und Zustand (an/aus, Helligkeit, Farbe).
- Zustände kommen beim Abgleich mit (`POST …/samples` mit `lights`) und sind für Gebäudemitglieder sichtbar.
- Schalten: Der Eigentümer schaltet auf seinem angemeldeten iPhone direkt in Home Assistant. Vorher prüft `POST …/home-assistant/lights/:entity/command` Rechte, Auswahl, Farbfähigkeit und das Kontolimit `light_minute` (Tabelle `app_ha_commands`, Status `delegated`).
- Lampen zählen zum Limit `ha_entities`; höchstens 100 Lampen je Übersicht.
- Lampensteuerung neu: großer Helligkeitsregler wie im Kontrollzentrum, Szenen (Hell, Lesen, Gemütlich, Abend), Weißton-Regler (warm–kalt, `color_temp_kelvin` im Bereich der Lampe) und Farbfelder plus eigene Farbe. Angezeigt wird nur, was die Lampe laut `supported_color_modes` kann. Beim Ziehen höchstens ein Auftrag alle 3 s, der Endwert immer.

## 16. November 2026 – Home Assistant ohne Installation verbinden (iPhone 1.0.134)

- Neuer Standardweg: Die App findet Home Assistant per Bonjour im WLAN (oder per eingegebener Adresse), der Nutzer meldet sich auf der normalen Home-Assistant-Anmeldeseite an (OAuth/IndieAuth, `client_id` = `/app-api/v1/ha-client`, Rückleitung `kitrifftgebaeude://ha-auth`). Kein Token kopieren, kein YAML, keine Freigabe nach außen.
- Der Home-Assistant-Zugang liegt nur im Schlüsselbund des iPhones. Beim Öffnen der App werden ausgewählte Sensoren samt Verlauf (Halbstundenmittel, bis 7 Tage) hochgeladen: `POST /buildings/:id/home-assistant/samples`, Übersicht über `PUT …/inventory`, Verbindung über `POST …/app-connect` (nur Eigentümer).
- Neues Limit `ha_sync_hour` (30). Die Integration mit Kopplungscode bleibt als Option „Fortgeschritten“ für den Dauerbetrieb.
- Versionssprung auf 1.0.134, weil 1.0.133 für PR #181 (Domain) reserviert ist.

## 16. November 2026 – Home-Assistant-Import (iPhone 1.0.132)

- Neue Custom Integration `integrations/home-assistant/custom_components/ki_trifft_gebaeude`: Home Assistant schickt ausgewählte Sensorwerte (Temperatur, Luftfeuchte, CO₂, Leistung, Energie) samt Geräten und Bereichen an den Projektserver. Die Verbindung geht nur nach außen. Auf dem Server liegt kein HA-Token, nur der Hash eines eigenen Brückenschlüssels.
- Koppeln per Einmalcode (10 Minuten). Nur der Eigentümer verbindet, wählt Sensoren aus, ordnet HA-Bereiche den Räumen zu und trennt. Mitglieder sehen die Werte.
- Laufende Werte (höchstens 1 Paket pro Minute) und einmalig ein Verlauf mit Stundenwerten der letzten 7 Tage. Temperatur, Feuchte und CO₂ erscheinen auch in Sensorik, Wärmekarte und KI-Auswertung.
- Neue Limits pro Konto: `ha_links`, `ha_entities`, `ha_values_hour`, `ha_history_day`.
- iPhone: Geräte → Home Assistant.

[Anleitung](integrations/home-assistant/README.md)

## 16. November 2026 – Widget und Siri-Kurzbefehle (iPhone 1.0.130)

- Home-Bildschirm-Widget (klein/mittel): Lieblingsgebäude mit letztem Temperatur-/CO₂-Messwert, gespeichertem Wetter und ungelesenen Mitteilungen. Tippen öffnet das Gebäude.
- Das Widget hat keine Sitzung und ruft keinen Server auf. Die App schreibt nach dem Laden eine kleine Zusammenfassung in die App Group und lädt die Widgets neu; beim Abmelden wird sie gelöscht.
- Lieblingsgebäude = zuletzt geöffnetes Gebäude oder im Widget gewählt.
- Siri/Kurzbefehle: „Frag mein Gebäude …“ (Frage wird nur eingetragen), „Öffne Gebäude X“, „Wo bin ich?“ (Raumortung).
- Release-Build signiert jetzt mit `KTG_BUNDLE_ID_BASE=…` statt `PRODUCT_BUNDLE_IDENTIFIER=…`, weil die Extension `<Basis>.widgets` braucht.

[Anleitung](docs/ios-widget-siri.md)

## 14. November 2026 – LiDAR-Raumscan mit Server-IFC (iPhone 1.0.127)

- Der Raumscan schickt die RoomPlan-Struktur an den Projektserver; der IFC-Worker erzeugt mit ifcopenshell ein IFC4 mit Raumvolumen, Wandstärken, Tür-/Fensteröffnungen und Möbeln.
- Raumnamen und -typen aus RoomPlan-Labels und erkannten Möbeln, ohne KI. Prüfen und Übernehmen in der App.
- Ohne Serververbindung entsteht das IFC wie bisher auf dem iPhone.

[Anleitung](docs/lidar-raumscan-server.md)

## 10. November 2026 – Grundriss zu vorläufigem IFC

- Einmalige Google-Freigabe je Gebäude; nach Aktivierung neue Bilder/PDFs automatisch analysieren. Vorhandene Pläne nur nach Auswahl.
- Dauerhafte PostgreSQL-Aufträge, getrennter BIMCraft-Worker, Limits und Abbruch bei Widerruf.
- Web- und iPhone-Oberfläche für Vorschau, Warnungen, Verwerfen und Übernehmen als zusätzliche IFC.
- Keine automatische Übernahme, kein Ersatz vorhandener Modelle. Lesbare Maße nötig; Dach und Treppen werden nicht rekonstruiert.
- Konfigurierbare Dienste und Umzugsanleitung für einen späteren h_da-Server.

[Anleitung](docs/plan-zu-ifc.md)


## 05.11.2026 – Automatische IFC-Platzierung (iPhone 1.0.98)

- Ein gemeinsamer Schritt „Automatisch platzieren & Karte laden“, Zahlenfelder unter Details.
- IFC MapConversion mit expliziter EPSG-Referenz (UTM / Web Mercator), Modellmittelpunkt, Einheiten und Nordrichtung werden ausgewertet. Alternativ IFC-Site-GPS mit TrueNorth oder passender vorhandener OSM-Grundriss.
- Unklare Angaben bleiben manuell korrigierbar; 180°-Mehrdeutigkeit wird angezeigt. Kein Anschluss an ein amtliches Geoportal, keine vermessungstechnische Freigabe.


[← Projektübersicht](README.md)

**Neueste Änderungen zuerst.** Innerhalb eines Tages stehen die zuletzt zusammengeführten Änderungen oben. Dieser Verlauf dokumentiert Entwicklung; er ersetzt keine Team-Sitzungsprotokolle. Frühere Einträge beschreiben den damaligen Stand und werden durch spätere Änderungen ergänzt.

## 5. November 2026

### Native Heatmap für Gebäude, Wetter und weiße Karte

- Neuer iPhone-Reiter mit Gebäudestandort, aktuellen Open-Meteo-Modellwerten und bis zu 24 stündlichen Prognosewerten. Expliziter Abruf mit gerundetem Punkt und Cache; keine erfundenen Messwerte.
- Private IFC-Auswahl und direkt bedienbarer Stundenregler für illustrative Oberflächenfarben. Wetterdaten samt Quelle und Abrufzeit stehen dem privaten KI-Chat und bewusst gestarteter Live-Sprache zur Verfügung.
- Weiße mobile Modellumgebung mit Schatten, etwa 100 × 100 m neue Kartenausschnitte und Plausibilitätsprüfung von IFC-GPS und Grundriss. Keine blind automatische, vermessungsgerechte Georeferenzierung.
- Signierter App-Build 1.0.96 (96), 117 Backend-Tests und fünf native Viewer-Tests. Sommer-/Winterfarben und weißer Hintergrund mit einem synthetischen IFC sichtbar geprüft; tatsächlicher Wetterabruf für öffentlichen Darmstadt-Punkt erfolgreich.

[Anleitung, Datenschutz und Prüfgrenzen](docs/iphone-heatmap-wetter.md)

## 4. November 2026

### Zuletzt · Lampenassistent und natürliche Raumnamen · PR #90

- Kurze Raumnamen wie „Wintergarten“ trotz IFC-Bezeichnung mit Raumnummer erkennen.
- Verschachtelte Werkzeugparameter für ElevenLabs beschreiben; Konfiguration vom verwalteten D21-Agenten angenommen, Authentifizierung weiterhin aktiv.
- Gezielte Tests für explizite Wünsche, unklare Fragen und kurze Raumnamen bestanden. Keine echten Lampen durch automatische Tests geschaltet.

[Pull Request #90](../../pull/90)

### App 1.0.89 (89) · Echte Daten und vereinfachte Bedienung · PR #89

- Start bei den echten Gebäuden; lokale fiktive Werte nur unter Profil → Darstellung → Vorstellungsmodus. Standard: aus.
- Echte IFC-Vorschauen auf Gebäudekarten: dunkelblau bei hellem, hellblau bei dunklem Erscheinungsbild.
- Eigener Geräte-Tab entfernt; Geräte über das jeweilige Gebäude öffnen. Kontakte und Mitteilungen unter Team zusammengeführt.
- Einmalige kontoweite Freigabe für KI, Sprache und zugeordnete private Lampen. Bestehende KI-Freigaben gewähren standardmäßig keinen neuen Hardwarezugriff.
- Gemini-Chat und ElevenLabs-Livegespräch können autorisierte Lampen schalten, dimmen und färben. Serverseitige Prüfung, dauerhafter Wiederholungsschutz und tatsächliche Zustandsrückmeldung bleiben erhalten.
- Auf Felix’ Wunsch ausdrücklich markierte Demo-Messdaten, alte Mitteilungen und einen modelllosen Platzhalter samt separat bestätigtem KI-Chat bereinigt; echte Modelle erhalten. Geschützte Sicherung vorher erstellt.
- 107 Backend-Tests, fünf Viewer-Tests, Web-Build und signierter iPhone-Build bestanden. App auf Felix’ iPhone installiert; Server veröffentlicht und lesend geprüft. Vollständige reale Sprachvorführung noch gemeinsam erproben.

[Pull Request #89](../../pull/89) · [Dokumentation](docs/app-echte-daten-lampenassistent.md)

### Web-Viewer laden · PR #88

- Leserechte der ausgelieferten statischen nginx-Dateien beim Image-Bau vereinheitlicht; 403-Fehler beim Laden des Viewers behoben.

[Pull Request #88](../../pull/88)

### Geräte, IFC-Räume, RGB und Karten · PR #87

- Echte private Lampen nachträglich Gebäuden und vorhandenen IFC-Räumen zuordnen.
- RGB/Helligkeit prüfen und bestätigte Lampenfarben vereinfacht im Raum anzeigen; keine physikalische Lichtsimulation.
- Schatten im mobilen Viewer; Modellstandort, Ausrichtung und Maßstab manuell wählbar.
- OSM-Straßen, Nachbargebäude und Grünflächen ausdrücklich laden und in BIM-Optik darstellen. Quellenangabe und begrenzte Abfragen; keine automatisch behauptete Georeferenzierung.

[Pull Request #87](../../pull/87) · [Dokumentation](docs/geraete-raeume-rgb-karten.md)

### Erste echte Home-Assistant-Lampe · PR #86

- Private, kontogeschützte Lampenanbindung mit fester Freigabeliste, Zustandsprüfung und begrenzten Aufträgen.
- Später um drei Wintergarten-Deckenleuchten und deren IFC-Raumzuordnung ergänzt. Private Demonstration, keine D21-Gebäudeautomation.

[Pull Request #86](../../pull/86) · [Technischer Erststand](docs/homeassistant-lampen-demo.md)

### Kontoweite KI und Live-Sprache · PR #85

- KI-Freigabe einmal pro Konto auf dem Server speichern.
- ElevenLabs-Livegespräche mit direkter Antwort, Unterbrechen, Wellenanimation und begrenzter Gesprächsdauer.
- Mikrofon beim Verlassen/Hintergrundwechsel beenden. Damals bestätigte Geräte-Simulationen; echte Lampensteuerung später in #89 ergänzt.

[Pull Request #85](../../pull/85) · [Technischer Erststand](docs/iphone-live-sprachassistent.md)

## 3./4. November 2026 · Ausbau von App und Website

- **#83:** Aufnahme-/Wiedergabeabläufe beim Ansichtswechsel abgesichert. [PR](../../pull/83)
- **#82:** Gebäudekarten, eigene Chatnachrichten löschen und erste ElevenLabs-Funktionen. [PR](../../pull/82)
- **#81:** iPhone-Dashboard, Sensorik, Energie, lokale Demo, CSV-Messwertimport und abgegrenzte Gemini-Auswertung. Demo-Zugänge später durch #89 vereinfacht. [PR](../../pull/81)
- **#79:** Web-BIM-Oberfläche mit Geschossen, Beschriftungen und Beispielcampus. Der Beispielcampus ist kein D21-Modell. [PR](../../pull/79)
- **#78/#77:** Ladeabläufe und geführte Geräteanlage; damalige Simulationen und vorgemerkte Anbindungen nicht mit echter Hardware verwechseln. Navigation später durch #89 ersetzt. [PR #78](../../pull/78) · [PR #77](../../pull/77)
- **#76/#75:** geschütztes Server-Verwaltungsportal, Kapazitäts-/Nutzungsübersicht und Zugriffsschutz. [PR #76](../../pull/76) · [PR #75](../../pull/75)
- **#69/#68/#66:** Vincents Projektseite unter `/projekt/`, Teamvorstellung und README-Einstieg. [PR #69](../../pull/69) · [PR #68](../../pull/68) · [PR #66](../../pull/66)
- **#67/#65:** aktualisierter Base44-Export und Portierung des Web-Gebäudeassistenten. Ein Export oder Merge allein belegt keinen vollständigen Produktivtest. [PR #67](../../pull/67) · [PR #65](../../pull/65)

[Arbeitsberichte](docs/protokolle/README.md)

## 2. November 2026

- Gemeinsame Modellzustände und privater KI-Chat; bestätigbare IFC-Modellbefehle und Gemini-Gebäudeassistent. [PR #61](../../pull/61) · [PR #60](../../pull/60) · [PR #59](../../pull/59) · [PR #58](../../pull/58)
- Kontakte, Gebäudefreigaben, Mitteilungen und Gebäudechat. [PR #57](../../pull/57)
- Private Projektdateien mit RVT/IFC und sechs PDF-Plänen im separaten Datei-Repository bereitgestellt; keine automatische App-Übernahme. [Privater Download](https://github.com/felixdoering05-prog/D21-Projektdateien/releases/latest)
- n8n für lesende GitHub-/Erreichbarkeitsprotokolle; WhatsApp-Bot als vorbereiteter Prototyp, nicht als fertiger Nachrichtendienst. [n8n](docs/protokolle/2026-11-02-n8n-automatisierungen.md) · [WhatsApp-Prototyp](docs/protokolle/2026-11-02-whatsapp-bot-prototyp.md)
- Benjamins Gaming-PC entfällt; Uni-/Cloud-Rechner bleibt offen. h_da-Netzzugang und mögliche Claude-Zugänge nicht als produktiv abgeschlossen darstellen.

## 30. Oktober 2026

- Web-BIM-Viewer mit Zugriff auf dieselbe Modellbibliothek wie die iPhone-App. [PR #47](../../pull/47) · [Arbeitsbericht](docs/protokolle/2026-10-30-web-bim-viewer.md)

## 29. Oktober 2026

- Lokaler unvollständiger Revit-EG-Arbeitsstand: 50 Wände, 28 Räume; offene Flächenabweichungen und fehlende Räume dokumentiert. Keine fachliche Modellabnahme. [PR #44](../../pull/44) · [Arbeitsnachweis](docs/revit-planrekonstruktion.md)
- IFC-Bauteilinteraktion und erstes simuliertes Raumlicht. [PR #42](../../pull/42) · [Arbeitsbericht](docs/protokolle/2026-10-29-ifc-interaktion-smart-home.md)
- Rückmeldung zu Claude-Zugängen und möglicher Campus-Heatmap dokumentiert; damalige Planung nicht mit eingerichteten Zugängen verwechseln. [Projektstandsbericht](docs/protokolle/2026-10-29-projektstand-claude-heatmap.md)

## 28. Oktober 2026

- IFC-Viewer und Modellbibliothek mit Suche, Ladezuständen und Wiederholung. [PR #39](../../pull/39) · [Arbeitsbericht](docs/protokolle/2026-10-28-ifc-modellbibliothek.md)
- Geführte Gebäudeanlage, Dokumentverwaltung, Startbildschirm und App-Symbol. [Gebäudemappe](docs/protokolle/2026-10-28-gebaeudemappe.md) · [Startbildschirm](docs/protokolle/2026-10-28-entwicklung-startbildschirm.md) · [App-Symbol](docs/protokolle/2026-10-28-app-symbol.md)
- Passwort-Rücksetzung technisch vorbereitet; Projekt-Absenderkonto fehlt weiterhin. [Arbeitsbericht](docs/protokolle/2026-10-28-passwort-mail.md)

## 27. Oktober 2026

- GitHub als zentrale Codequelle, Server-Klon und Deployment-Weg dokumentiert. [Technischer Arbeitsbericht](docs/protokoll-2026-10-27.md)

## Neue Änderungen dokumentieren

Neue Einträge oben unter dem aktuellen Datum ergänzen: **Was hat sich geändert? Welcher Pull Request gehört dazu? Was wurde tatsächlich geprüft, was bleibt offen?** App-Version nur bei nachgewiesenem Build/Installation nennen. Keine Zugangsdaten oder privaten Kontaktinformationen aufnehmen. Teamtermine separat im [Protokollverzeichnis](docs/protokolle/README.md) erfassen.
