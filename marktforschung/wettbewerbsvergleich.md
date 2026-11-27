# Wettbewerbsvergleich – KI trifft Gebäude

## 26.11.2026, 19:00 MEZ – Energiemanagement: evcc und HEMSight

Neu im geprüften Vergleich, keine bestätigte heutige Markteinführung. Anbieter-/Projektquellen, Abruf 26.11.2026:

| Angebot / Zielgruppe | Funktionen laut Projekt | Preis / Lizenz |
| --- | --- | --- |
| [evcc](https://docs.evcc.io/) – Haushalte, PV-/Wallbox-Betreiber, Integratoren | PV-Überschussladen, dynamische Tarife, Speicherkoordination, Lastmanagement, Home Assistant, REST/MQTT und MCP für KI-Assistenten; lokaler Betrieb | Selbsthosting möglich; konkrete Sponsorbedingungen und Preise nicht in dieser Quelle bestätigt |
| [HEMSight](https://hemsight.de/en/) – Smart-Home-/PV-Haushalte | Prognosebasierte Planung für PV, Speicher, Wallbox und Verbraucher; lokale Docker-/HA-Installation, Freigaben und Rücklesung vor Schaltaktionen | Laut Anbieter kostenlos, frühe Beta; konkrete Lizenzbedingungen und Hardwarekosten nicht bestätigt |

**Nala-Abgleich:** [PR #291](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/291) direkt als gemergt geprüft: Strom-/Wasseransichten, HA-Livewerte, PV-Plan/3D, Speicherstand, rechnerische Notstromreserve, Tarife, Abrechnung und CSV. Laut PR 56 Viewer-, 33 Backend-, acht HA- und zwei lokale Browsertests (synthetische Werte); nicht selbst ausgeführt. Haupt-README auf main weiterhin 20.11.; IFC, Gemini, ElevenLabs und private HA-Anbindung dokumentiert. Echte D21-Daten, produktive Revit-Synchronisation und automatische tarifoptimierte Speichersteuerung nicht nachgewiesen. Bei beiden Energieangeboten nativer IFC-/Revit-Viewer und BIM-Sprachkontext nicht aus den geprüften Quellen belegt.

**Chance:** BIM-gebundene Energie- und Anlagenübersicht mit nachvollziehbarer Datenherkunft; evcc als mögliche Integrationsschicht prüfen. **Risiko:** PV-Flüsse, Tarife, lokale Steuerung und KI-Schnittstellen sind keine exklusiven Funktionen; Visualisierung ist keine Optimierung. **Test:** identische 24h-Messreihe mit Netzbezug/Einspeisung, Speicherstand, Tarifwechsel und fehlenden Werten; Kostenrechnung gegen Referenz prüfen. Keine Einsparung oder USP nachgewiesen.

---

## 25.11.2026, 19:00 MEZ – Kamerafreie Raumbelegung als Wettbewerbsfeld

Neu im Vergleich, nicht als neue Markteinführung bestätigt. Herstellerquellen geprüft am 25.11.2026:

| Angebot / Zielgruppe | Funktionen laut Anbieter | Preis / Lizenz |
| --- | --- | --- |
| [Aqusense](https://aqusense.com/) – Gebäudeeigentümer, FM, Campus, Integratoren | WLAN-basierte Raum-/Zonenbelegung und Bewegung, PoE-Sensoren, Dashboards, APIs und Gebäudeintegrationen | Kein öffentlicher Preis auf geprüfter Seite; Vertragsmodell nicht bestätigt |
| [Origin Wireless](https://www.originwirelessai.com/wifi-sensing/) – Netzwerk- und IoT-Anbieter | CSI-basierte Bewegungs- und Belegungserkennung auf kompatibler Netzwerktechnik, konfigurierbare Haltezeit, eingebettete/hybride/cloudgestützte Architektur | Kein öffentlicher Lizenzpreis bestätigt |
| [Aqara FP2](https://www.aqara.com/de/product/presence-sensor-fp2/) – Smart Home | mmWave-Radar (nicht WLAN-CSI), bis 40 m², bis 30 Zonen, bis fünf Personen laut Hersteller, beste Ergebnisse bis drei; Home Assistant über HomeKit | [EU-Shop](https://eu.aqara.com/de-eu/products/aqara-presence-sensor-fp2) zeigt 82,99 EUR je Gerät; mögliche Zusatzabos für neue Funktionen laut [Produktseite](https://www.aqara.com/en/product/presence-sensor-fp2) |

**Projektabgleich:** [RuView-Brücke auf main](../sensorik/ruview-bridge/README.md) dokumentiert ESP32-S3/CSI, lokale Rohdaten, Ergebnisübertragung alle zehn Sekunden, Raumzuordnung, Belegungsschätzung, standardmäßig deaktivierte Funktion und 24-Stunden-Verlauf. Atemfrequenz ist eine grobe Schätzung, kein medizinischer Nachweis. Hardwaregenauigkeit, reale D21-Daten und produktive RLT-Regelung nicht bestätigt; Tests nicht selbst ausgeführt. [Haupt-README](../README.md) ist noch auf 20.11. datiert; IFC, Gemini, ElevenLabs und private Home-Assistant-Anbindung dokumentiert, reproduzierbare Revit-Anbindung offen. Kein nativer IFC-/Revit-Viewer oder Sprachassistent bei den drei Sensoranbietern aus diesen Quellen nachgewiesen; keine Aussage über deren vollständiges Portfolio.

**Chance:** Belegung mit IFC-Räumen, CO₂ und Energie verknüpfen; herstellerunabhängige Sensorik. **Risiko:** Kamerafreiheit und Belegungserkennung sind keine Alleinstellungsmerkmale; auch lokale Rohdaten garantieren keine Anonymität. Vor Campus-Einsatz Freigaben, Zweckbindung und Datenminimierung prüfen; Atemfrequenz für FM möglichst nicht erfassen. Vergleichstest mit freiwilligen Teilnehmenden, manueller Referenz, Fehlalarmrate, Zählfehler, Latenz und Gesamtkosten; zunächst keine automatische Anlagensteuerung. Keine neue Preisänderung oder Markteinführung bestätigt.

---


## 23.11.2026, 19:00 MEZ – Home Assistant 2026.11: KI-Diagnose, KNX und Sprachrechte

**Neue belegte Produktänderung (Release 04.11.2026, nicht erst heute erschienen):** [Home Assistant Core 2026.11](https://www.home-assistant.io/blog/2026/11/04/release-202611/) führt laut offizieller Release-Note einen integrierten Marketplace (HACS), zusätzliche LLM-API-Werkzeuge zur System-/Loganalyse, Aktionen und Integrationsverwaltung sowie KNX-spezifische LLM-Werkzeuge für Telegrammspeicher, Projektdatei und Datenpunkttypen ein. Ein MCP-Server kann auf lesende Werkzeuge beschränkt werden; die Freigabe einer LLM-API erfolgt durch Administratoren. Außerdem wurden Energie-Dashboard und Kalenderdarstellung erweitert. **Zielgruppe:** Smart-Home-Nutzer, Integratoren, Automatisierungsentwickler; professionelle KNX-Anwender als angrenzende Zielgruppe. **Preis/Lizenz:** Open-Source-Software; keine belastbare neue Monatsgebühr aus dieser Release-Note; Hardware, Cloud-LLM, Hosting und Integrationsaufwand sind getrennte Kosten. Keine unabhängigen Praxis- oder Sicherheitsbenchmarks.

**Wettbewerbsfolge:** Sprach-/LLM-gesteuerte Geräteaktionen, Energie-Dashboard und KI-gestützte technische Fehlerrecherche sind keine nachgewiesenen Alleinstellungsmerkmale von Nala. Neu relevant ist die **feingranulare Rechtevergabe an KI-Werkzeuge** und das sichere Trennen lesender Diagnose von schreibenden Gebäudeaktionen. Home Assistant 2026.11 belegt **keinen nativen IFC-/Revit-Gebäudezwilling** in dieser Quelle; fehlender Nachweis ist kein Beweis des Fehlens.

**Nala-Abgleich, [README/main](../README.md) und [offener PR #245](../../pull/245), geprüft 23.11.:** gemergter iOS-Quellstand 1.0.154, IFC-/Webviewer, Gemini-/ElevenLabs-Funktionen, private Home-Assistant-Lampen und ESP32-Schnittstellen dokumentiert. Ein echter freigegebener D21-Messwert ([#74](../../issues/74), [#102](../../issues/102)), produktive KNX-/BACnet-Anbindung, durchgängig geprüfte Sprach-Aktor-Rechte, reproduzierbarer Revit-Server-Prozess und Kalender-Datenintegrität ([#243](../../issues/243)) **nicht bestätigt**. Kein nachgewiesener Preis-, Qualitäts- oder Funktionsvorsprung.

**Chance (Hypothese):** IFC-Bauteil/Raum → reale Sensordaten → erklärbare Diagnose → bestätigte, rollenbegrenzte Aktion mit Auditprotokoll. **Risiko:** Wettbewerber bieten schon KI-Aktionen und KNX-Diagnose; unkontrollierte Schreibaktionen an Gebäudeanlagen sind sicherheitskritisch. **Prüfplan:** nur lesender D21-Test, Herkunft/Einheit/Zeitstempel, Rollen-/Tool-Whitelist, Freigabe vor Aktoraktionen und identischer Kosten-/Zeitvergleich.

**Quellen und Daten:** Hersteller-Release [Home Assistant 2026.11, 04.11.2026](https://www.home-assistant.io/blog/2026/11/04/release-202611/); [Assist-Dokumentation](https://www.home-assistant.io/voice_control); Repository [README](../README.md), [PR #245](../../pull/245). Abruf **23.11.2026, ca. 19:00 MEZ**. Keine neuen Preise und keine neue Markteinführung behauptet; alle Funktionsangaben sind Herstellerangaben.

---

## 23.11.2026, 09:00 MEZ – Autodesk Tandem und Siemens Lifecycle Twin: direkte Funktionsüberschneidung

**Quellenprüfung 23.11.2026, Herstellerseiten; keine neue Produkteinführung nachgewiesen.**

| Produkt / Zielgruppe | Belegte Funktionen | Lizenz / Preis und Grenzen |
| --- | --- | --- |
| [Autodesk Tandem](https://www.autodesk.com/products/tandem/buy) – Facility-Betreiber, BIM-/AEC-Teams | BIM-basierter 3D-Zwilling mit Anlagen, Dokumenten, historischen und nahezu Echtzeit-Daten; [Tandem Connect](https://www.autodesk.com/products/tandem-connect/buy) verbindet Gebäudesysteme über Low-Code | **Kapazitätsbasiert statt pro Nutzer**; [regionale Angebotsseite](https://www.autodesk.com/sg/products/Tandem/buy) nennt Tandem Free mit 500 Assets, 100 Mio. Datenpunkten und drei Gebäuden; kostenpflichtige Stufe 10.000 Assets und 1 Mrd. Datenpunkte. **Kein belastbarer deutscher EUR-Preis** auf der geprüften Seite (dynamischer Platzhalter). Tandem Connect Free: 25 Sandbox-Plug-ins, 100 Nachrichten je Deployment, **keine** Produktions-Plug-ins; bezahlt: 10 Produktions-Plug-ins und unbegrenzte Nachrichten. |
| [Siemens Building X – Lifecycle Twin](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/) – Gebäudeeigentümer und Betreiber | 2D-/3D-Twin, Anlagen, Dokumente, Inspektion und präventive Wartung, **Revit-Integration zur automatischen Anlagenerkennung**; [Building X](https://www.siemens.com/de-de/products/building-x/) ergänzt Echtzeitdaten, Energie und Betriebs-Apps | Lifecycle Twin Base in Paketen **10 Nutzer/20 GB, 25/50, 50/100, 100/200, 250/500**; Zusatz-CAD-Server und API-Integration gesondert. **Preisbeträge auf Anfrage**, keine verifizierte öffentliche EUR-Liste. Building X: App-/API-Abonnements. |

**Nala-Abgleich:** [README auf main](../README.md) (Dokumentationsstand 20.11.; Quellstand iOS 1.0.154) beschreibt IFC-Viewer, Gebäudepass, Wartungsplan, Gemini/ElevenLabs und private Home-Assistant-Anbindung. Echter D21-Messwert ([#74](../../issues/74), [#102](../../issues/102)), reproduzierbarer Revit-Prozess und produktiver Gesamttest **nicht belegt**. Autodesk und Siemens widerlegen eine pauschale Einzigartigkeit von BIM + Sensorik + Wartung. **Hypothese statt USP:** schnell einrichtbarer, preislich transparenter IFC-Raum–Sensor–Sprach-Workflow für kleinere Betreiber; messbar erst nach D21-Pilot und TCO-Vergleich.

**Technischer Standard:** [buildingSMART](https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-%20%20classes/) nennt IFC 4.3.2.0 (ISO 16739-1:2024) als aktuelle offizielle IFC-Version; Kompatibilität der Nala-Importpipeline damit ist nicht geprüft.


## 22.11.2026, abends – CONTEXUS und OpenRemote: modulare Konkurrenz und Lizenzgrenzen

Quellenabruf 22.11.2026. Neu im Vergleich, kein belegtes November-Release; Herstellerangaben, keine eigenen Produkttests.

| Angebot / Zielgruppe | Funktionen | Preis / Lizenz |
| --- | --- | --- |
| [CONTEXUS](https://contexus.io/) – Systemintegratoren, FM, Campusbetreiber | Anbieter beschreibt IFC-/Revit-Modelle, 7D-FM, Sensordaten im Modell, BACnet/Modbus/MQTT/LoRaWAN, KI-Abfragen und Energieoptimierung; [BIM-Details](https://contexus.io/products/7d-bim) | [Lizenzseite](https://contexus.io/licensing): sechs offene Module ohne Lizenzgebühr für Eigenbetrieb/Anpassung; Partner-White-Label und proprietäre Erweiterungen separat, Beträge nicht bestätigt. [Öffentliches IoTHub-Repo](https://github.com/Contexus/contexus) nennt MIT; Lizenz und tatsächliche Verfügbarkeit jedes weiteren Moduls separat prüfen. |
| [OpenRemote](https://openremote.io/) – Hersteller, Integratoren, IoT-/Energiemanagement | Geräte-/Assetverwaltung, Regeln, Echtzeit-Dashboards, Karten, APIs und eigene Oberflächen | [AGPLv3](https://openremote.io/open-source/), Eigenbetrieb ohne Softwarelizenzgebühr; Hosting, Support und alternative kommerzielle Lizenz kostenpflichtig, Beträge nicht bestätigt. |

**Evidenzgrenzen:** CONTEXUS beschreibt seine Module als produktionsreif; das öffentliche IoTHub-README führt mobile App und ML-Integration als Roadmap. Das belegt weder Auslieferung aller BIM-/KI-Module noch deren gemeinsame Produktivreife. Keine Einsparversprechen übernommen. [EULA vom 17.04.2026](https://contexus.io/eula) und jeweilige Codelizenzen vor Weitervertrieb prüfen. Sprachassistent/privates Smart Home bei beiden nicht bestätigt; nativer IFC-Viewer bei OpenRemote nicht bestätigt.

**Nala-Abgleich:** [README auf main](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/blob/main/README.md) am 22.11. erneut gelesen (Blob e5b02a1): gemergter iOS-Quellstand 1.0.154, IFC/Pass, ESP32, private HA-Lampen, Gemini/ElevenLabs, Rollen und Wartungskalender. D21-Livewert (#74/#102), Revit-Server-Prozess und Kalenderintegrität (#243) nicht nachgewiesen. CONTEXUS ist wegen beanspruchter BIM+IoT+KI-Kombination ein direkter funktionaler Vergleich, OpenRemote eine mögliche Integrationsschicht. Kombination allein kein belegter USP. Chance: messbar einfache Einrichtung und sichere mobile sprachgestützte Raumabfrage für kleine Betreiber. Pilotvergleich: Zeit bis zum ersten freigegebenen Livewert, IFC-Raumzuordnung, Datenherkunft, Rollenprüfung, Ausfallverhalten und Gesamtbetriebskosten inkl. Hosting/KI/Support. Keine AGPL-Codeübernahme ohne Lizenzprüfung; API-Kopplung separat bewerten.

## 22.11.2026, morgens – Normal Software, BuiltLayer und Trigrr: GA-Integration und Preisstruktur

Quellenabruf 22.11.2026; Herstellerangaben, nicht unabhängig getestet. Neu im Vergleich, kein belegtes Neueinführungsdatum.

| Angebot / Zielgruppe | Funktionen | Preis / Lizenz |
| --- | --- | --- |
| [Normal Software](https://www.normal.dev/pricing.html) – GA-Integratoren und Betreiber | BACnet (inkl. SC), Modbus, Niagara Fox, Sparkplug B, REST, PostgreSQL, Zeitpläne, Schreibschutzregeln, MCP-KI-Zugang | Erste aktive Anlage kostenlos je Nutzer; weitere Gebäude 2.000 USD einmalig, optional Wartung 20 % jährlich; Volumenpreise ab zehn Gebäuden, bis zu 300 USD/Gebäude bei entsprechendem Umfang |
| [BuiltLayer](https://builtlayer.com/pricing/) – OT/IT-Integratoren | BACnet/IP, Modbus/TCP, SNMP, HTTP als Eingänge; strukturierte Daten und KI-Modellconnector im Intelligence-Tarif; BACnet-Ausgang erst angekündigt | Intelligence selbstgehostet: kostenlos bis 50 Punkte, 29 USD/Monat bis 500, 99 USD bis 5.000. Proto ohne KI-Connector: 99 USD einmalig bis 500 Punkte, 499 bis 5.000, 999 bis 20.000 |
| [Trigrr](https://www.trigrr.io/pricing) – gewerbliche Betreiber, Integratoren, Bildungsgebäude | BOS für vorhandene Systeme, bidirektionale Integration, Automatisierungseditor, Advanced mit KI-Automation und 2D-Monitoring | Mini unter 3.000 m², Festpreis, 50 Geräte/5 Nutzer; Core/Advanced flächenbasiert; konkrete Beträge nicht veröffentlicht |

**Abgleich:** [README/main](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/blob/main/README.md) am 22.11. gelesen: Nala 1.0.154, IFC, Gebäudepass, ESP32, private Home-Assistant-Lampen, Gemini/ElevenLabs, Rollen und Wartungskalender im dokumentierten Quellstand. Kein nachgewiesener D21-Livewert (#74/#102), produktiver Revit-Prozess oder Kalenderintegritätsnachweis (#243). Nativer IFC/Revit-Viewer und Sprachassistent bei den drei GA-Angeboten in diesen Quellen nicht bestätigt; keine Aussage über generelle Abwesenheit.

**Chance/Risiko:** Normal als Ein-Gebäude-Pilot und BuiltLayer als günstige Protokollschicht prüfen; keine Produktentscheidung ohne IT-/OT-Freigabe. KI plus GA ist bereits am Markt, kein USP. BuiltLayer 500 Punkte kosten bei monatlicher Zahlung rechnerisch 348 USD/Jahr (Intelligence) oder 99 USD einmalig (Proto, anderer Umfang); Hosting, KI, Steuern, Support und Integrationsaufwand separat. Normal-Lizenz für weitere Gebäude plus optionale Wartung rechnerisch 400 USD/Jahr pro 2.000-USD-Lizenz. Kein belegter Preisvorteil Nalas. Nächster Test: freigegebener read-only D21-Datenpunkt mit Quelle, Einheit, Zeitstempel und IFC-Raum; Rollen, Export und Ausfallverhalten prüfen. Schreibzugriffe erst nach expliziter Freigabe.

## 21.11.2026, abends – ThingsBoard: IoT-Preisanker und Lizenzrisiko

Quellenabruf 21.11.2026; Herstellerangaben, keine eigenen Produkttests. Neu in diesem Vergleich, keine bestätigte heutige Produkteinführung.

- [ThingsBoard Cloud EU](https://thingsboard.io/docs/paas/eu/reference/subscriptions/) / [Preise](https://thingsboard.io/pricing/): Free 0 EUR/Monat (5 Geräte, 5 Assets, 1 Mio. Datenpunkte/Monat); Prototype 45 EUR (50/50, 10 Mio.); Pilot 145 EUR (100/100, 100 Mio.). Zielgruppe: IoT-Entwickler, Integratoren und Betreiber. Tarife seit 20.01.2026 laut Dokumentation; White Label ab Pilot. Steuer-/Vertragsdetails separat prüfen.
- [On-premises](https://thingsboard.io/products/thingsboard-pe/): kostenloser Einstieg mit 100 Geräten, laut Anbieter 1.000 für nichtkommerzielle Projekte; bezahlte Abos ab 99 USD/Monat; Dauerlizenz ab 4.999 USD für 5.000 Geräte. Hosting selbst zu tragen.
- [Lizenzvertrag](https://thingsboard.io/legal/license-agreement/): aktuelle Bedingungen nennen Business Source License 1.1 und Additional Use Grant für unentgeltliche Nutzung. Nicht pauschal als uneingeschränktes Open Source oder frei weiterverteilbar einstufen; konkrete Version, Nutzungsart und Bedingungen prüfen.
- [Plattform](https://thingsboard.io/): Geräteverwaltung, Telemetrie, Dashboards, Alarme, Rollen und APIs. Nativer IFC/Revit-Viewer und gebäudebezogener Sprachassistent in diesen Quellen nicht bestätigt (keine Aussage über generelle Abwesenheit).

**Projektabgleich:** [README/main](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/blob/main/README.md), letzter gefundener Hauptbranch-Merge [eb0a5a4](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/commit/eb0a5a4d1c604d11e26dfa2fd3a4e06f9e09c625), 20.11.: Nala 1.0.154, IFC, ESP32-Serverbasis, private Home-Assistant-Anbindung, Gemini und ElevenLabs dokumentiert; kein nachgewiesener D21-Livewert (#74/#102), Hardware-Dauertest (#189), reproduzierbarer Revit-Prozess oder Kalender-Datenintegritätsnachweis (#243). Kein belegter USP oder Preisvorteil.

**Chance/Risiko:** ThingsBoard als optionale Telemetrie-Schicht evaluieren, nicht voreilig integrieren. 50 Geräte × 1 Messgröße × 1/min × 30 Tage = 2,16 Mio. Datenpunkte; unter Prototype-Kontingent, bei 5 Messgrößen 10,8 Mio. und damit darüber. Modell-/Asset-Zuordnung, Rollen, Datenexport, Ausfallsicherheit und Lizenz separat prüfen. Nala-TCO einschließlich Hosting, KI/Sprache und Betrieb gegen den gleichen Pilot rechnen; keine direkte Gleichsetzung mit vollständiger FM-/BIM-Lizenz.

## 21.11.2026 – Dalux FM und BIMcollab: mobile Betriebsprozesse und Nutzerpreise

Quellenabruf 21.11.2026; Herstellerangaben, keine unabhängigen Produkttests. Neu im Vergleich, nicht als November-Neueinführung belegt.

| Angebot / Zielgruppe | Belegte Funktionen | Preis / Lizenz |
| --- | --- | --- |
| [Dalux FM](https://www.dalux.com/de-at/produkte/dalux-fm/) – FM-Teams, Betreiber und Dienstleister | Web/iOS/Android, 2D/3D-BIM, Arbeitsaufträge, geplante Wartung, Helpdesk, QR-Assets, Lieferantenportal; [Revit und IFC](https://www.dalux.com/de/produkte/dalux-fm/bim-dokumentation/) | 14-tägiger Test; produktiver Lizenzpreis nicht öffentlich bestätigt |
| [BIMcollab Platform](https://www.bimcollab.com/de/plans/bimcollab-platform/) – BIM-Koordination und Projektteams | Dokumentenmanagement, Modellkoordination, Zusammenarbeit; drei Nutzerabos | Basic 12,50 / 19 EUR, Advanced 18,75 / 29 EUR, Enterprise 25 / 39 EUR je Nutzer/Monat bei jährlicher bzw. monatlicher Bindung; Modellprüfung separat betrachten |

**Preisanker:** Sechs Nutzer kosten bei Jahresbindung rechnerisch 75 / 112,50 / 150 EUR pro Monat (900 / 1.350 / 1.800 EUR pro Jahr); keine Aussage zu Steuern, Zusatzleistungen oder Nala-Gesamtkosten. BIMcollab ist primär Koordinationssoftware, kein nachgewiesener Ersatz für Gebäudeautomation. Bei Dalux sind KI-Sprachsteuerung und Live-Gebäudeautomation in den geprüften Quellen nicht nachgewiesen; daraus folgt keine bestätigte Abwesenheit.

**Projektabgleich:** [README/main](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/blob/main/README.md) (Stand 20.11.) bestätigt iPhone-Quellstand 1.0.154, IFC-Viewer, Dokumente, Rollen, Wartungskalender und private Home-Assistant-Testanbindung. Dalux belegt, dass mobile BIM-Wartung allein kein USP ist. Nala hat keinen belegten gleichwertigen Arbeitsauftrags-/Lieferantenworkflow; echte D21-Messwerte, reproduzierbare Revit-Anbindung und Kalenderintegrität bleiben offen (#74, #102, #243). Chance: schlanker Raum–Messwert–KI–Wartungsablauf für kleine Teams. Nächster Test: QR-/Raumzugriff, Wartungseintrag, Rechteprüfung und echter Messwert mit Herkunft; Zeitaufwand und Gesamtkosten erfassen. Kein belegter Preis- oder Leistungsvorsprung.


## 20.11.2026, abends – Qonic AI, Honeywell EBI One und ODA MCP

Quellenabruf 20.11.2026; Herstellerangaben, keine unabhängigen Praxistests.

| Angebot / Zielgruppe | Datierte Neuerung | Preis / Abgrenzung |
| --- | --- | --- |
| [Qonic](https://www.qonic.com/posts/qonic-november-2026-release) – BIM-Planer und Koordinatoren | 04.11.: IFC-basierte KI-Agenten für Abfragen, Eigenschaftsprüfung, Berichte und Modelländerungen; MCP mit rollenbegrenzten Aktionen und persönlichen Änderungen vor Veröffentlichung | Tokenpakete ab 50 EUR, bezahlte Pläne mit monatlichem Kontingent; MCP ohne Qonic-Tokenverbrauch, externe KI-Kosten separat. Kein bestätigter Gesamtpreis oder D21-artiger Live-Betriebsworkflow. |
| [Honeywell EBI One](https://www.honeywell.com/us/en/news/press-releases/2026/11/honeywell-technologies-expands-autonomous-building-operations-with-ebi-one) – gewerbliche Betreiber, Campus und Rechenzentren | Globaler Launch 10.11.: Forge Cognition, KI-Alarmklassifizierung und natürlichsprachliche Abfrage von Betriebsdaten, Alarmen, Historie und Dokumentation | Öffentlicher Preis/Lizenzumfang und IFC- oder Sprachsteuerung nicht in dieser Quelle bestätigt. |
| [Open Design Alliance](https://www.opendesign.com/blog/2026/november/devconnect26-ai-agent-real-dwg-step-and-ifc-models) – Softwareentwickler | Ankündigung 12.11. für Demos am 18./19.11.: MCP-Operationen auf IFC, Viewer-Interaktion, atomare Änderungen/Undo, lokale LLM-Option | SDK-/MCP-Preis nicht bestätigt; Revit als nächster Schritt angekündigt, nicht als ausgeliefert belegt. Kein fertiges FM-Produkt; tatsächlicher Demoablauf nicht unabhängig geprüft. |

**Nala-Abgleich:** [README/main](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/blob/main/README.md) nennt jetzt gemergten Quellstand 1.0.154 (Korrektur zur morgendlichen Momentaufnahme), Gemini-Kontext aus IFC und lesende Werkzeuge, ElevenLabs-Sprache, private HA-Lampen, ESP32 und Raumzuordnung mit Rückfrage. Echte D21-Daten, reproduzierbarer Revit-Server-Prozess, produktive Installation und Kalenderintegrität ([#243](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/243)) bleiben unbelegt. Keine neue Anwendungscode-PR-Aktivität in der heutigen PR-Suche festgestellt; kein eigener Funktionstest.

**Chance:** Kombination aus überprüfbarer IFC-Raumabfrage, realem Sensorwert und berechtigter Geräteaktion für kleine Betreiberteams. **Risiko:** KI auf IFC und natürlichsprachliche Betriebsabfragen sind bereits separat verfügbar. Kein exklusiver USP, Preis- oder Qualitätsvorteil belegt. Pilotkriterien: Quellenbezug, Rollenprüfung, Bestätigung vor Schreibaktion, Auditprotokoll, Fehlerbehandlung und Kosten je Gebäude; Modelländerungen und Geräteaktionen getrennt bewerten.

---


**Jüngste Ergänzung: 20.11.2026.**

## 20.11.2026 – dTwin, Twinview und ioFM (Quellenabruf 20.11.2026)

| Anbieter / Zielgruppe | Herstellerseitig belegte Funktionen | Lizenz / Preis |
| --- | --- | --- |
| [Nemetschek dTwin](https://www.nemetschek-dtwin.com/pricing) – Betreiber und Asset-Management | BIM, GIS, 2D, Reality Capture, Dashboards; höherer Tarif mit Echtzeitdaten und FM/ERP/BMS/IoT-Anbindung | View & Explore ab 3.500 EUR/Jahr; View, Connect & Operate ab 5.000 EUR/Jahr, jährliche Abrechnung; Enterprise individuell. Endpreis abhängig u.a. von Fläche und Speicher. |
| [Twinview](https://www.twinview.com/platform) – FM-Teams und Portfolioverantwortliche | Assetregister, Lebenszyklus, Anomaliehinweise, Audit-Trails, Rollen/SSO; [Integrationen](https://www.twinview.com/integrations) nennen IFC, Revit, MQTT, BACnet, Modbus und REST | Demo/Vertrieb; kein öffentlicher Betrag in geprüften Seiten. |
| [ioLabs ioFM](https://www.siemens.com/en-us/products/iolabs-ag-iofm-fast-and-cost-effective-way-to-digital-twin/) – Betreiber heterogen dokumentierter Bestandsportfolios | Minimal-BIM, Modellierung als Dienstleistung aus CAD, PDF, IFC und weiteren Bestandsunterlagen, Webviewer | Raumbezogenes Abo laut Produktseite; konkreter Betrag nicht bestätigt. |

Keine datierte November-Neueinführung bestätigt; neu im Vergleich erfasste Angebote, keine unabhängigen Leistungstests. Sprachassistenten oder konkrete KI-Geräteaktionen bei diesen drei Angeboten nicht anhand dieser Quellen bestätigt (kein Nachweis ihres Fehlens).

**Nala-Abgleich:** README/main nennt noch 1.0.152, während gemergte #238 und #240 den neueren iPhone-Stand einschließlich Rollen/Gebäudegruppen und IFC-Licht dokumentieren; #244 überarbeitet Webnavigation. README dokumentiert ESP32/BME280, private Home-Assistant-Anbindung und Sensor-Raum-Zuordnung mit Rückfrage. Echter D21-Datenpunkt, reproduzierbare Revit-Anbindung, produktive Installation und Kalender-Datenintegrität (#243) nicht nachgewiesen. Kein neuer Anwendungscode-PR seit #244 in der aktuellen PR-Suche festgestellt. [README](../README.md), [#238](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/238), [#240](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/240), [#244](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/244), [#243](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/243).

**Chance:** Einstieg für kleine Gebäude mit bestehenden IFC-Dateien und nachvollziehbaren Sensor-/Sprachaktionen. **Risiko:** dTwin bietet bereits einen konkreten EUR-Preisanker, Twinview breite Standardprotokolle und ioFM senkt die Modellierungshürde. Kein belegter USP oder Kostenvorteil. Pilot: ein IFC-Raum, echter Messwert, Rechteprüfung, dokumentierte Geräteaktion, Export und Vollkosten einschließlich Hosting/LLM/Integration.

---

**Quellenprüfung: 13.11.2026, ca. 09:10 Uhr MEZ.** Anbieterangaben sind keine unabhängigen Funktionstests. „Nicht bestätigt“ bedeutet nicht, dass eine Funktion fehlt.

| Anbieter / Produkt | Zielgruppe / Schwerpunkt | Belegte Funktionen | Lizenz / Preisstand | Quelle |
| :--- | :--- | :--- | :--- | :--- |
| **Siemens Building X – Lifecycle Twin** | Betreiber größerer Gebäude / Infrastruktur | BIM-basierte digitale Zwillinge, 2D-/3D-Grundrisse, Anlagenvisualisierung, Dokumentenmanagement | **Vertriebskontakt für Preis**, kein verifizierter öffentlicher EUR-Preis | [Siemens](https://www.siemens.com/fi-fi/products/building-x/applications/lifecycle-twin/) |
| **BuildingMinds** | Immobilienportfolio / ESG / Betriebsdaten | Digitaler Gebäude-/Portfoliozwilling mit Dokumenten, Anlagen, Zählern und Verbrauch; Datenkonsolidierung | **Nicht öffentlich bestätigt**; Angebot einholen | [BuildingMinds Portfolio](https://buildingminds.com/de/portfoliomanagement/) · [Datenintegration](https://buildingminds.com/it/dati) |
| **Autodesk BIM Collaborate Pro** | BIM-Planungsteams | Modellkoordination, Projektdokumentation, fachübergreifende Zusammenarbeit; Revit-Cloud-Worksharing je Abo | Abonnement; **deutscher Preis hier nicht verifiziert** (regionale Preise nicht übertragen) | [Autodesk Produkt](https://www.autodesk.com/de/products/bim-collaborate/overview) · [Abo-Abgrenzung, 07.04.2026](https://www.autodesk.com/de/support/technical/article/caas/sfdcarticles/sfdcarticles/DEU/What-are-the-differences-between-BIM-Collaborate-and-BIM-Collaborate-Pro.html) |
| **Home Assistant / Assist** | Smart Home und lokale Automation | Geräteintegration, Energie-Dashboard, lokale Datenhaltung; natürlicher Sprachassistent, lokal oder mit LLM | Software Open Source; **Home Assistant Green Hardware UVP 179 € inkl. regionaler Steuern**, kein Software-Abopreis | [Green](https://www.home-assistant.io/green) · [Assist](https://www.home-assistant.io/voice_control) |
| **openHAB** | Herstellerneutrale Gebäude-/Heimautomation | Open-Source-Automation, mehr als 400 unterstützte Technologien/Systeme, Web/iOS/Android, Sprachsteuerung, lokal betreibbar | Open Source; kein pauschaler Hardware-/Betriebskostenvergleich | [openHAB](https://www.openhab.org/) |
| **xBIM Toolkit / Xplorer** | Entwickler und BIM-Viewer-Anwender | IFC lesen, erstellen, visualisieren; freier Open-Source-Viewer, Web-Komponente | Open Source; **Lizenzbedingungen der Komponenten vor Wiederverwendung prüfen** | [Toolkit](https://docs.xbim.net/) · [Xplorer](https://xbim.net/xbim-xplorer/) · [WebUI](https://docs.xbim.net/XbimWebUI/) |

## Tatsächlicher Projektstand und Abgrenzung

Quelle: [Projekt-README](../README.md), [PR #133](../../pull/133), [PR #134](../../pull/134), [PR #137](../../pull/137) und [Dokumentations-PR #139](../../pull/139). **Hinweis:** PR #139 ist zum Recherchezeitpunkt nicht als in `main` übernommener Stand bestätigt; die README auf `main` zeigt teilweise ältere Versionen.

- **Nachweisbar als Projektentwicklung dokumentiert:** IFC-Webviewer, Gebäude-/Teamverwaltung, Heatmap-Modi, iPhone-App, KI-Chat, experimentelle Sprach-/Home-Assistant-Anbindung und Plan-zu-IFC-Entwurf. Ein PR oder dokumentierter Test ist **kein Nachweis für produktiven Einsatz**.
- **Messdaten:** Die Web-Heatmap unterscheidet echte qualitätsgeprüfte Werte, Simulation und DWD-Historie. **Erster echter D21-Sensorwert nicht als abgeschlossen bestätigt**; [Issue #74](../../issues/74) ist separat zu prüfen.
- **KI/Voice:** Gegen Home Assistant Assist **kein belegter Alleinstellungsanspruch** für Sprachsteuerung. Reale Ende-zu-Ende-Sprachtests und Sicherheitsfreigaben bleiben gesondert zu belegen.
- **BIM:** Gegen Siemens, Autodesk und xBIM **kein belegter Alleinstellungsanspruch** für 3D/IFC allein.
- **Mögliche Positionierung (Hypothese, kein Marktbeweis):** einfache Kombination aus Gebäudemappe, IFC-Raumkontext, zugriffsgeprüfter Sensorik und assistierter Bedienung für kleinere Gebäude-/Campus-Teams. Erst mit echten D21-Daten, Nutzertests und belastbaren Wettbewerbs-Featurechecks als Vorteil behaupten.

## Nächste Rechercheprioritäten

1. Siemens und BuildingMinds: Produktdemo, Preise und nachweisbare IFC-Raum-/Sensorkopplung.
2. Vergleich der Nutzeraufgabe „echten Messwert im richtigen IFC-Raum finden“ in allen Plattformen.
3. Sicherheits-/Datenschutzvergleich für KI-gesteuerte Aktoren, Rollen und Audit-Logs.
4. Kostenmodell mit gleichen Annahmen (Nutzer, Gebäude, Hosting, Hardware, Support), statt ungleicher Listenpreise.

**Bewertungsregel:** Anbieter-Funktionsangaben nur mit URL und Prüfdatum; Preise immer mit Währung, Region, Laufzeit und Preisart. Fehlende Informationen bleiben „nicht bestätigt“.


## Ergänzung 13.11.2026, 19:00 MEZ – direkter Wettbewerber Autodesk Tandem

| Anbieter / Produkt | Zielgruppe / Schwerpunkt | Belegte Funktionen | Lizenz / Preisstand | Quelle |
| :--- | :--- | :--- | :--- | :--- |
| **Autodesk Tandem / Tandem Connect** | Gebäudebetreiber, Eigentümer, AEC und Systemintegratoren | BIM-basierter digitaler Zwilling, manueller IFC-/Revit-Import, Raum-/Systemkontext; IoT-/BMS-Streams, Heatmaps und Zeitreihendiagramme; Tandem Connect überträgt Betriebsdaten | Abonnement/Produktvarianten; **kein verifizierter EUR-Betrag**. Tandem for AEC ist laut Autodesk im BIM Collaborate Pro-Abo enthalten | [Autodesk Tandem](https://help.autodesk.com/cloudhelp/ENU/Tandem-About/files/Tandem_About_about_tandem_html.html) · [Tandem for AEC](https://app.learn-one.autodesk.com/uk/products/bim-collaborate/features/digital-twin) · [Tandem Connect](https://www.autodesk.com/dk/products/tandem-connect/buy) |
| **Siemens Building X – Lifecycle Twin (Lizenzdetails)** | Gewerbliche Betreiber / Instandhaltung | 2D/3D, Asset- und Dokumentenverwaltung, Wartungsabläufe; Cloud oder lokal laut Siemens-Hilfe | **Laut Siemens-Datenblatt** Cloud-Angebot mit mindestens 10 Nutzern und 20 GB; 12 Monate Laufzeit, automatische Verlängerung. **Kein verifizierter EUR-Preis** | [Siemens-Hilfe](https://sid.siemens.com/r/A6V13989089/23513708683_26912673931__de-DE_22822305163) · [Siemens-Datenblatt](https://assets.new.siemens.com/siemens/assets/api/uuid%3A0251ec0c-76db-46ae-97f3-eddc38f4271a/BuildingX-Data-Sheet-Lifecycle-Twin-2025-03-26_original.pdf) |
| **BuildingMinds (KI-Nachrüstungsplanung)** | Immobilienportfolios / Dekarbonisierung | KI-gestützte Empfehlungen für Nachrüstungen und Energie-/CO₂-Szenarien laut Anbieter | Preis **nicht öffentlich verifiziert**; einzelne Szenarienvergleiche ausdrücklich als „demnächst verfügbar“ gekennzeichnet | [BuildingMinds Dekarbonisierung](https://buildingminds.com/de/digital-twin2/) |

**Wettbewerbsrelevanz:** Autodesk Tandem ist ein direkterer Vergleich als Autodesk BIM Collaborate Pro allein: IFC/Revit, raumbezogene Betriebsdaten und Heatmaps sind dort bereits beschrieben. Ein pauschaler USP „IFC + Sensorwerte + Heatmap“ ist daher **nicht belegbar**. Eine differenzierende Positionierung als einfaches, preislich transparentes Campus-/Kleingebäude-Werkzeug bleibt eine **ungetestete Hypothese**.

**GitHub-Abgleich, 19:00 MEZ:** [PR #154](../../pull/154) und [PR #155](../../pull/155) sind in `main` gemergt. Sie ergänzen den KI-/Sprachkontext um **geprüfte IFC-Zählungen**, ohne frei formulierte Raumlisten an den Provider zu übertragen; #155 nennt 154 bestandene Backendtests und einen zusätzlichen Textrouten-Integrationstest. Das belegt **keinen** durchgängig erfolgreichen realen Sprachdialog, keinen D21-Echtmesswert und keinen produktiven Einsatz. Die neuere [README-Änderung #153](../../pull/153) ist weiterhin ein offener PR.


## Ergänzung 14.11.2026, 09:00 MEZ – Bentley iTwin und Tandem Free

| Anbieter / Produkt | Zielgruppe / Funktionen | Lizenz / Preisstand | Offizielle Quelle |
| :--- | :--- | :--- | :--- |
| **Bentley iTwin Platform** | Entwickler und Integratoren; digitale Zwillinge mit Engineering-, Realitäts- und Sensordaten, APIs und Visualisierung | **Community kostenlos**, aber nur privat/nicht kommerziell/nicht produktiv (100 Credits/Monat, 10 GB Cloud-Daten); **Standard 199 USD/Monat** (200 Credits), **Premium 499 USD/Monat** (500 Credits), zusätzliche Credits **1,20 USD**; Enterprise auf Anfrage. Entwicklerplattform-Preise, nicht fertiges Endkundenprodukt | [Plattform](https://developer.bentley.com/) · [Preise](https://developer.bentley.com/pricing/) |
| **Autodesk Tandem Free – Konkretisierung** | Gebäude-/Betriebsteams; Free-Stufe bis 500 Assets, 100 Mio. Datenpunkte, drei Facilities; Bezahlstufe bis 10.000 Assets und 1 Mrd. Datenpunkte | Free-Stufe bestätigt; **deutscher EUR-Preis für Bezahlstufe nicht verifiziert** (dynamische Preisplatzhalter auf geprüfter Tarifseite); kommerzielle Nutzungsbedingungen gesondert prüfen | [Autodesk Tarifvergleich](https://www.autodesk.com/sg/products/Tandem/buy) · [Autodesk Tandem Free](https://help.autodesk.com/cloudhelp/ENU/Tandem-About/files/Tandem_About_access_tandem_free_html.html) |

**Wettbewerbsfolgerung:** Ein pauschaler Preisvorteil unserer App ist nicht belegt. Tandem hat eine kostenlose Einstiegsstufe; Bentleys kostenlose Community-Lizenz ist ausdrücklich nicht kommerziell/produktiv. Kosten von API-Plattform, SaaS-Produkt und selbst gehosteter App sind ohne einheitliches Nutzungsszenario nicht direkt vergleichbar.

**Projektabgleich (14.11.):** Zuletzt in main gemergt: [#152](../../pull/152) strukturiertes Gemini-Geometrieschema, [#154](../../pull/154) geprüfte IFC-Raumanzahlen für Sprache, [#155](../../pull/155) gemeinsame IFC-Fakten für KI-Text und Sprache. [README-PR #153](../../pull/153) und [Marktforschungs-PR #156](../../pull/156) bleiben offen. D21-Echtmesswert und realer Ende-zu-Ende-Vergleich sind nicht bestätigt.


## Ergänzung 14.11.2026, 19:00 MEZ – Autodesk-Nutzungsrechte und Siemens-Campusreferenz

**Neue belastbare Differenzierung gegenüber dem Vormittag:** Autodesk unterscheidet ausdrücklich die Tandem-Produktstufen und die **Tandem-Connect-Produktionsintegration**. Die Free-Stufe von Tandem ist laut Nutzungsbedingungen auf **interne geschäftliche Zwecke** und begrenzte Funktionen beschränkt; dies ist **keine pauschale Freigabe für beliebige SaaS-Weitervermarktung**. Für Tandem Connect Free gibt es **keine Produktions-Pipelines**; Standard bietet zehn Produktions-Plugins pro Paket, MQTT-Broker über ein Add-on. Das ist für den Vergleich von echten BMS-/IoT-Daten wichtiger als die bloße Anzahl gespeicherter Datenpunkte. Die offizielle Produktvergleichsseite nennt teilweise andere Sandbox-Plugin-Grenzen als die Nutzungsbedingungen; **vertraglich gültige Fassung beim Anbieter klären**.

**Siemens Building X Lifecycle Twin** nennt die **University of Wollongong** ausdrücklich als Hochschul-/Campusreferenz: Lifecycle Twin für Asset-, Raum-, Dokumentations- und BIM-Daten, zusammen mit Energy Manager und Operations Manager für Echtzeitbetrieb. Damit ist „speziell für Campus“ **kein belegbarer USP** unseres Projekts. Siemens nennt für Lifecycle Twin auf der geprüften Produktseite keinen verifizierten EUR-Listenpreis.

| Angebot | Verifizierte Funktion / Nutzungsgrenze | Preisstand / Zielgruppe | Offizielle Quelle (Abruf 14.11.2026) |
| :--- | :--- | :--- | :--- |
| Autodesk Tandem Free | 500 Assets, 3 Facilities, bis 100 Mio. Datenpunkte; 500 MB Dateigröße, 10 Modellimporte je Facility. Interne geschäftliche Nutzung laut Nutzungsbedingungen | Kostenlos; Betreiber/AEC zum Einstieg; Nutzungs- und Kapazitätsgrenzen beachten | [Autodesk Produktvergleich](https://www.autodesk.com/products/tandem/compare) · [Autodesk Terms](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) |
| Autodesk Tandem Connect | Free: keine Produktions-Pipelines. Standard: 10 Produktions-Plugins pro Paket, MQTT-Broker über Zusatzpaket | Connect-Zusatzangebot zur Tandem-Subscription; **separater EUR-Preis nicht bestätigt** | [Autodesk Terms](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) |
| Siemens Building X Lifecycle Twin | 2D/3D, Revit-Asseterkennung, Dokumente, Wartungsfälle; Campusreferenz University of Wollongong | Hochschulen, Eigentümer, Betreiber, Facility Management; **EUR-Preis nicht bestätigt** | [Siemens Lifecycle Twin](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/) |
| Bentley iTwin Platform | Community 100 Credits/Monat nur privat/nicht kommerziell/nicht produktiv; Standard 200, Premium 500 Credits/Monat | Community kostenlos; Standard 199 USD/Monat; Premium 499 USD/Monat. **Entwicklerplattform, kein Endkunden-App-Preis** | [Bentley Pricing](https://developer.bentley.com/pricing/) |

**Abgleich mit dem GitHub-Projekt (14.11., Abend):** Die aktuelle [README auf main](../README.md) beschreibt Web-/iPhone-App, IFC, Gemini-/ElevenLabs-Assistent, private Home-Assistant-Lampen und Heatmap-/Importpfade als Prototyp. [PR #160](../../pull/160) (LiDAR-Raumscan → IFC4), [#161](../../pull/161) (lesende Gemini-Werkzeuge), [#162](../../pull/162) (IFC-Raumflächen aus Geometrie) und [#164](../../pull/164) (IFC-Analyse-/Vergleichswerkzeuge) sind als jüngste Entwicklungen zu berücksichtigen; sie **belegen keine produktive D21-Sensoranbindung oder unabhängige Modellvalidierung**. [PR #163](../../pull/163) (Mängelmelder) ist noch offen und darf nicht als Bestandteil von main bezeichnet werden. Die offene [README-PR #165](../../pull/165) ist nicht automatisch der Stand von main.

**Chancen (Hypothesen):** einfacher Onboarding-Prozess für einzelne Gebäude; transparente Herkunft und Qualität realer Raumdaten; nachvollziehbare Freigaben für KI-/Aktorschaltungen; Kostenvergleich inklusive Betrieb und Integrationsaufwand. **Risiken:** Siemens adressiert bereits Hochschulcampus; Tandem bietet Free-Einstieg und Connect-Produktionsintegrationen. **Kein verifizierter Alleinstellungs- oder Preisvorteil**.

**Konkreter Vergleichstest:** dieselbe Aufgabe in unserer App und Tandem/Siemens: IFC-Raum öffnen → realen Messwert mit Zeitstempel/Quelle/Einheit anzeigen → Zugriff für zweiten Nutzer einschränken → Aufwand und Kosten erfassen. Für Bentley getrennt Entwickler-API-Integrationsaufwand erfassen. **Keine Testergebnisse behaupten, solange nicht durchgeführt.**


## Ergänzung 15.11.2026, 09:00 MEZ – KI-Viewer und Gebäudepass als direkte Konkurrenz

| Anbieter / Produkt | Zielgruppe und belegte **Anbieterangaben** | Veröffentlichtes Lizenz-/Preismodell | Offizielle Quelle (Abruf 15.11.2026) |
| :--- | :--- | :--- | :--- |
| **Twiniti – Lexi Lite / Plus** | AEC- und BIM-/Digital-Twin-Teams: Lexi Lite verbindet einen APS- oder Fragments-3D-Viewer mit Chat über Modellinhalte. Plus soll zusätzliche Asset-Logik nutzen | **Lexi Lite kostenlos und laut Anbieter verfügbar**; **Plus kostenpflichtig, Warteliste**, kein verifizierter Betrag | [Lexi Produkt und Tarife](https://lexi.twiniti.ai/) |
| **Scope3D – Studio / Desktop / Operations** | Gebäudeeigentümer und Betreiber: wirbt mit IFC-, Revit-, DXF- und PDF-Import, Browser-Zwilling, IFC-Export, KI-Copilot und Asset-/Betriebsansichten; Desktop soll lokal Revit bedienen | **Ab 750 USD einmalig je Gebäude** für Twin-Erstellung und **ab 59 USD/Monat** für Betrieb/Studio; abhängig von Gebäudetyp/-größe. Desktop laut Anbieter ohne eigene Sitzplatzlizenz, KI-Providerkosten separat. Region, Steuern und konkrete Gesamtkosten **nicht bestätigt** | [Scope3D offizielle Produkt-/Preisseite](https://scope3d.com/) |

**Wichtige Produktabgrenzung:** Lexi Lite bietet bereits *3D-Modell + KI-Chat* als kostenlose Kombination. Scope3D bewirbt *Plan/PDF → Modell → Betrieb* und einen KI-Copiloten. **Keines dieser Funktionsbündel ist allein ein belegbarer USP** von KI trifft Gebäude. Verfügbarkeit, Modellqualität, Sprach-/IoT-Funktionsumfang und Datenhoheit beider Angebote sind **nicht unabhängig getestet**. Insbesondere bei Scope3D sind die Aussagen zum automatischen Plan-Tracing, Revit-Desktop-Workflow und Betrieb Herstellerdarstellungen, keine von uns nachgewiesenen Funktionen.

**Autodesk-Lizenzpräzisierung:** Die [offiziellen Tandem-Nutzungsbedingungen](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) führen **verschiedene Angebotsmodelle** auf: *Tandem Capacity-based Free* mit bis zu **500 Assets, drei Facilities und 100 Mio. Datenpunkten**, sowie eine separat beschriebene *Tagged-Assets/Streams*-Staffel (Free bis **1.000 Tagged Assets, 200 Streams, 14 Tage Historie**). Diese Werte dürfen **nicht zu einem einzigen Free-Paket addiert** werden. Die Bedingungen nennen zudem Tandem Essentials für berechtigte BIM-Collaborate-Pro-/Forma-Model-Management-Abos. Welcher Vertrag für einen konkreten Kunden gilt, ist vor einer Preiskalkulation zu klären; deutscher EUR-Preis weiterhin unbestätigt. [Autodesk deutscher Produktvergleich](https://www.autodesk.com/de/products/tandem/product-details).

**Bentley-Preischeck:** [iTwin Platform](https://developer.bentley.com/pricing/) weiterhin Community nur privat/nicht kommerziell/nicht produktiv; Standard **199 USD/Monat**, Premium **499 USD/Monat**, **1,20 USD** pro Zusatzcredit. Es handelt sich um Plattform-/Entwicklerkosten, nicht um den Endpreis einer fertigen Gebäude-App.

**GitHub-Abgleich (15.11., 09:00 MEZ):** [README auf main](../README.md) dokumentiert LiDAR→IFC4 [#160](../../pull/160), lesende Gemini-Werkzeuge [#161](../../pull/161)/[#164](../../pull/164), IFC-Analyse [#162](../../pull/162) und private Home-Assistant-Steuerung als Prototyp. Die Dokumentations-PRs [#165](../../pull/165) und [#166](../../pull/166) wurden in `main` übernommen. Der Mängelmelder [#163](../../pull/163) ist weiterhin **offen** und darf nicht als fertig bezeichnet werden. Echter D21-Sensorwert, End-to-End-Praxistest, vollständige Revit-Livekopplung und Kostenvorteil sind **nicht nachgewiesen**.

**Chance (Hypothese):** Niedrige Einstiegshürde für kleine Campus-/FM-Teams durch nachvollziehbare Verbindung von IFC-Raum, *echtem* Messwert, Datenquelle, Zugriffsrechten und optionaler Sprachbedienung. **Risiken:** KI-Chat über BIM ist bereits kostenlos verfügbar; PDF-/Revit-zu-Twin-Workflows werden kommerziell angeboten; fehlende D21-Echtdaten verhindern belastbaren Mehrwertnachweis. **Empfohlener Test:** identisches IFC-Modell, dieselben 3 Nutzerrollen und ein echter Sensorwert; Aufwand, Rechte, Datenherkunft und Vollkosten dokumentieren.


## Ergänzung 15.11.2026, 19:00 MEZ – Archibus und BuildingMinds (offizielle Anbieterquellen)

| Produkt / Zielgruppe | Belegte Merkmale laut Anbieter | Preis-/Lizenzstand | Offizielle Quelle |
| :--- | :--- | :--- | :--- |
| **Archibus Digital Twins** · Facility-/Asset-Manager, Bestandsgebäude | BIM Viewer für Revit-Modelle in Autodesk Construction Cloud/Build über Autodesk Platform Services; Bauteile suchen, auswählen und mit Betriebs-/Assetdaten verknüpfen | **Archibus Digital Twins-Lizenz erforderlich**; Viewer nicht separat lizenziert; SaaS und Non-SaaS. **Öffentlicher EUR-Preis nicht bestätigt** | [Archibus BIM Viewer Dokumentation](https://help.archibus.com/user_en/Subsystems/webc/Content/web_user/bim_viewer/bim_viewer.htm), abgerufen 15.11.2026 |
| **BuildingMinds** · Immobilienportfolios, Asset-/ESG- und Energiemanagement | Digital Building Twin, API-Konnektoren für Zähler, BMS/Gebäudeautomation, IoT und CAFM; Datenharmonisierung. KI-gestützte Nachrüstempfehlungen werden angeboten; bestimmte Szenarienvergleiche und Wirkungsnachweise ausdrücklich als **demnächst verfügbar** gekennzeichnet | SaaS-Plattform; **öffentlicher EUR-Listenpreis nicht bestätigt**, individuelle Angebotsprüfung nötig | [BuildingMinds Datenplattform](https://buildingminds.com/de/daten), [Dekarbonisierungsplanung](https://buildingminds.com/de/digital-twin2/), abgerufen 15.11.2026 |

**Abgrenzung:** Archibus ist ein konkreter Wettbewerber bei Revit-/BIM-basiertem Facility Management, BuildingMinds vor allem bei Portfoliodaten, IoT/Energie und ESG; keine Gleichsetzung ihrer Angebote mit einer vollintegrierten IFC-Sprachsteuerungs-App. Herstellerdokumentation ist **kein unabhängiger Test**. Es ist nicht nachgewiesen, dass Archibus einen IFC-Nativviewer oder BuildingMinds eine interaktive Revit-/IFC-3D-Ansicht in exakt unserem Umfang bietet; das Fehlen solcher Funktionen ist ebenso **nicht belegt**.

**GitHub-Abgleich:** [README auf main](../README.md) dokumentiert Web/iPhone, IFC, Gemini und private Home-Assistant-Geräte; [PR #167](../../pull/167) enthält weitere Marktforschung, [PR #163](../../pull/163) Mängelmelder weiterhin offen. Ein echter D21-Sensorwert mit nachvollziehbarer Raumzuordnung ist nicht belegt. **Kein nachgewiesener USP oder Preisvorteil.** Ein fairer Vergleich braucht gleiche Gebäudedaten, Rollen, Integrationsaufwand und Vollkosten.

## 16.11.2026 – Tacit Twin, realvirtual.io und Autodesk-Migrationsrisiko

| Angebot | Belegte Anbieterangaben | Lizenz / Preis | Einordnung |
| --- | --- | --- | --- |
| [Tacit Twin](https://tacitwin.ai/) | Natürlichsprachliche Antworten auf BMS-, BIM-, IoT- und Gebäudedokumente; erklärbare Fehlerdiagnosen mit Kostenpriorisierung; UCL-Spinout, Pilotstandorte laut Anbieter | Kein öffentlich verifizierter Listenpreis | Direkter Wettbewerber für KI-gestützten Gebäudebetrieb; IFC-/Revit-Nativviewer, Spracheingabe und konkreter Rolloutumfang **nicht verifiziert** |
| [realvirtual.io](https://realvirtual.io/en) | Digital-Twin-Editor, KI-Agent mit lokalem Benutzerkontext, offener MCP-Server für Sensoren/PLC/Simulation | Public Demo kostenlos; Open-Source-Kern AGPL-3.0; Commercial-Lizenz ohne hier verifizierten Betrag | Angrenzendes industrielles Digital-Twin-/Entwicklerprodukt, kein belegter 1:1-Ersatz für den Gebäudepass |
| [Autodesk Tandem](https://www.autodesk.com/de/products/tandem/product-details) | Kapazitätsbasierte Free-Stufe: 500 Assets, 3 Gebäude, 100 Mio. Datenpunkte; Paid: 10.000 Assets, unbegrenzte Gebäude, 1 Mrd. Datenpunkte | Free kostenlos; EUR-Betrag für Paid auf öffentlich gerenderter Seite nicht belastbar auslesbar | Bereits bekannter Wettbewerber; Migration alter Free-Konten als zusätzliches Lock-in-/Datenportabilitätsrisiko |

**Lizenzwechsel (historisch, nicht heutige Produkteinführung):** [Autodesk-Nutzungsbedingungen](https://www.autodesk.com/company/terms-of-use/de/offering-types-and-benefits) unterscheiden Legacy-Tarife von Capacity-Abos ab 09.02.2026. [Support vom 19.05.2026](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Tandem-Moves-to-Capacity-Based-Subscription-Model-Prompting-Account-Action.html) und [22.08.2026](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/This-account-is-no-longer-supported-and-is-locked-when-accessing-Tandem-connect.html) dokumentieren nötige Migration und mögliche Kontosperrung/Deaktivierung von Pipelines. **Unbestätigt:** wie viele Kunden tatsächlich betroffen waren und ob Wettbewerberdaten exportiert werden konnten.

**Projektabgleich (16.11.):** Die [README auf main](../README.md) dokumentiert IFC, Gemini und Home Assistant; [PR #169](../../pull/169) Vektorpläne und [PR #171](../../pull/171) Widget/Siri sind noch nicht als gemergte Features nachgewiesen. Der echte D21-Messwert mit Raumbezug und Berechtigungen ist weiterhin **nicht belegt**. KI-Chat, MCP und Datenintegration sind somit **keine belegten Alleinstellungsmerkmale**. Potenzielle Differenzierung: offene IFC-Datenportabilität, lokaler Betrieb, einfache Installation und nachvollziehbare Berechtigungen – erst nach Praxisvergleich und Kostenmessung als Vorteil behaupten.


## Ergänzung 16.11.2026 – Siemens Lifecycle Twin: Lizenz- und Datenresidenzrisiko

**Neue Präzisierung (kein neuer Anbieter):** Siemens unterscheidet bei Lifecycle Twin **Cloud- und On-Premises-Abonnements**. Die Base-Pakete staffeln sich nach **benannten Nutzern und Speicher**: 10/20 GB, 25/50 GB, 50/100 GB, 100/200 GB, 250/500 GB. Laut offiziellem Datenblatt (26.03.2025) beträgt die Laufzeit **ein Jahr**, die Abrechnung erfolgt jährlich im Voraus. Zusätzliche API-Integrationen werden **pro Integration und Jahr**, ein On-Premises-CAD-Server **pro Server** lizenziert. **Kein verifizierter öffentlicher EUR-Preis**. Die Wahl der Cloud-Region bei Erstbestellung ist laut Datenblatt nicht reversibel; bei geplanten Building-X-/IoT-Integrationen verweist Siemens auf die EU-(Irland)-Bereitstellung. Diese Aussagen sind **Hersteller-/Vertragsangaben**, kein unabhängiger Funktionstest.

**Zielgruppe:** Gebäudeeigentümer, Betreiber, Facility Management und technische Teams. Siemens bietet Revit-Integration, BIM-Viewer, Dokumentenmanagement, Wartungs-/Issue-Prozesse. Ein **Mängelmelder im 3D-Modell ist damit kein exklusives Merkmal** unserer App. Quellen (geprüft 16.11.2026): [Siemens Produktseite](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/), [Siemens Lifecycle-Twin-Datenblatt vom 26.03.2025](https://assets.new.siemens.com/siemens/assets/api/uuid%3A0251ec0c-76db-46ae-97f3-eddc38f4271a/BuildingX-Data-Sheet-Lifecycle-Twin-2025-03-26_original.pdf).

**Projektabgleich 16.11.2026:** GitHub-README beschreibt IFC-/Web-/iPhone-Prototyp mit Gemini-/Sprachfunktionen und privater Home-Assistant-Anbindung. Der aktuelle Freigabestand der PRs [#169](../../pull/169) (Vektorplanvermessung) und [#171](../../pull/171) (Widget/Siri) ist im Changelog und auf GitHub nachzusehen; frühere Rechercheeinträge sind datierte Momentaufnahmen. Ein echter D21-Sensordatenpunkt, geprüfte Vollkosten, gleichwertige Rechte-/Datenresidenzprüfung und ein kommerzieller Vorteil sind **nicht bestätigt**. **Chance (Hypothese):** Ein kleiner, transparent kalkulierbarer Pilot ohne jährliche Mindestnutzerpakete; **Risiko:** Siemens hat bereits BIM, Revit und Issue-Workflows. Test: identisches D21-IFC-Modell mit echtem Messwert, Rollen und dokumentierten Betriebs-/API-Kosten vergleichen.

## Ergänzung 16.11.2026, 19:05 MEZ – KI-Fehlerdiagnose und Integrationsautomatisierung

| Produkt | Zielgruppe und belegte Funktionen | Preis / Lizenz | Projektabgleich | Offizielle Quelle |
| :--- | :--- | :--- | :--- | :--- |
| **Siemens Building X Operations Manager / Fault Triage Agent** | Gebäudebetreiber; optionale KI-Fehleranalyse, Hinweise auf wahrscheinliche Ursachen und Lösungswege | Optionales Modul; EUR-Preis und Paketbedingungen **nicht bestätigt** | Eigene KI-Ursachendiagnose **nicht produktiv nachgewiesen** | [Release September 2026](https://www.siemens.com/de-de/products/building-x/release-notes/) · [Operations Manager](https://www.siemens.com/de-ch/products/building-x/applications/operations-manager/) |
| **Autodesk Tandem Connect** | Betreiber/Integratoren; Konnektoren, nahezu Echtzeit-Synchronisierung, bidirektionale Datenflüsse, Alarme und Wartungsworkflows | Abo; Preis dynamisch, Betrag **nicht verifiziert** | Echt-D21-IFC-Integration und 24h-Test offen | [Produktdetails](https://www.autodesk.com/products/tandem-connect/product-details) · [Tandem-Tarife](https://www.autodesk.com/sg/products/Tandem/buy) |
| **Home Assistant Assist** | Smart Home/Integratoren; lokale oder LLM-gestützte Sprache und Geräteaktionen | Open Source; Hardware/Hosting separat | Gemini/Voice/Home-Assistant-Lampen allein **kein USP** | [Assist](https://www.home-assistant.io/voice_control/) · [LLM-Agenten](https://www.home-assistant.io/voice_control/assist_create_open_ai_personality/) |

**Eigener Stand laut README/main (16.11.2026):** IFC-Webviewer, SwiftUI, Gemini-Lesewerkzeuge, ESP32-/BME280-API und gemeinsame Raumzuordnung sind dokumentiert. [#189](../../issues/189) hält Hardwaretests offen; echter freigegebener D21-Datenpunkt nicht nachgewiesen ([#74](../../issues/74), [#102](../../issues/102)). **Automatische** Sensor-IFC-Zuordnung, KI-Fehlerdiagnose und Energie-Anomalieerkennung nicht als implementierte produktive Funktionen ausweisen. Keine unabhängigen Vergleichstests oder belastbaren Preisvorteile. Quellenabruf **16.11.2026**; Anbieterangaben.


## Ergänzung 17.11.2026, 19:00 MEZ – belastbare Tandem-Kapazitätsgrenzen und Home-Assistant-LLM

**Autodesk Tandem (Eigentümer, Betreiber, BIM-/FM-Teams):** Offizielle Nutzungsbedingungen differenzieren **Free** (max. 500 Assets, drei Facilities, 100 Mio. Datenpunkte, 500 MB Datei, zehn Modellimporte pro Facility), **Essentials** (bis 5.000 Assets, unbegrenzt Facilities; Berechtigung bei bestimmten kostenpflichtigen Autodesk-Abos) und **Paid** (bis 10.000 Assets, eine Milliarde Datenpunkte, Erweiterungen erhältlich). Abrechnung nach **Kapazität statt Nutzerzahl**; die Limits sind keine EUR-Preise. Tandem Connect Free erlaubt 25 Sandbox-Plugins, **null Produktionsplugins**, 100 Nachrichten pro Deployment; Paid 50 Sandbox- und zehn Produktionsplugins sowie unbegrenzte Nachrichten. **EUR-Preis nicht bestätigt**, da Produktseite dynamische Platzhalter ausgibt. Quellen (17.11.2026): [Autodesk Nutzungsbedingungen](https://app.learn-one.autodesk.com/content/autodesk/global/en/company/terms-of-use/en/subscription-benefits), [Tandem Kaufseite](https://www.autodesk.com/sg/products/Tandem/buy), [Tandem Connect](https://www.autodesk.com/sg/products/tandem-connect/buy). Die Umstellung begann bereits am 09.02.2026, **keine November-Neueinführung** ([Autodesk Support, 19.05.2026](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Tandem-Moves-to-Capacity-Based-Subscription-Model-Prompting-Account-Action.html)).

**Home Assistant (Privathaushalte, Integratoren, kleine Gebäude):** Assist unterstützt lokale oder LLM-gestützte Sprache; die offizielle **LiteLLM-Integration** erlaubt einen selbst betriebenen Proxy zu verschiedenen Modellanbietern für Konversation oder Sprache-zu-Text. **Veröffentlichungsdatum der Integration nicht verifiziert**, daher nicht als neue November-Funktion ausgeben. Software Open Source, Kosten für Hardware, Hosting und LLM-Dienste separat. Quellen (17.11.2026): [Assist](https://www.home-assistant.io/voice_control/), [LiteLLM](https://www.home-assistant.io/integrations/litellm).

**Siemens Building X (gewerbliche Betreiber):** Der optionale Fault Triage Agent ist in den **September-2026-Release-Notes** belegt, nicht neu im November. Preis und Diagnosegenauigkeit **nicht bestätigt**. [Siemens Release Notes](https://www.siemens.com/de-de/products/building-x/release-notes/).

**Abgleich mit main am 17.11.2026:** Gemergte [#217](../../pull/217) und [#219](../../pull/219) dokumentieren Home-Assistant-Lampen im iOS-Lichtbereich, einheitliche Karten, Deduplizierung und Raumänderung (**App 1.0.149 im Quellcode**). [#218](../../pull/218) verbessert Plan-Raumbeschriftungen und IFC-Geschosszuordnung. README/main enthält noch den älteren App-Stand 1.0.143; [README-PR #222](../../pull/222) ist offen. **Nicht belegt:** freigegebene D21-Live-Messdaten, automatisches Sensor-IFC-Mapping, produktive KI-Ursachendiagnose, Energie-Anomalieerkennung und installierter iOS-Gesamtstand. **USP-Hypothese, kein Beweis:** verständliche Raum-/Gerätezuordnung für kleine Teams bei transparenten Gesamtkosten. **Risiko:** Home Assistant bietet LLM/Voice bereits, Autodesk BIM+IoT mit klaren Free-Kapazitäten; kein belegter Preisvorteil.

**Nächste Vergleichsmessung:** Gleicher IFC-Raum und echter D21-Messpunkt, Messwert-Herkunft, Berechtigungen, Einrichtungsschritte, Datenexport und TCO (Assets, Datenpunkte, Integrationen, Nutzer, Hosting, LLM) für Nala/Tandem/Siemens vergleichen.


## Ergänzung 19.11.2026, 19:04 MEZ – Bentley-Preisanker und Autodesk Connect

| Anbieter / Zielgruppe | Belegtes Angebot | Lizenz / Preis (Herstellerangabe) | Konsequenz für Nala |
| --- | --- | --- | --- |
| [Bentley iTwin Platform](https://developer.bentley.com/pricing/) – Entwickler, Integratoren, Infrastrukturbetreiber | API-Plattform für Digital Twins einschließlich iModels, Sensor Data und Datenspeicherung | Community **kostenlos**, ausdrücklich nur nichtkommerziell/nichtproduktiv, 100 Credits/Monat; Standard **199 USD/Monat** (200 Credits), Premium **499 USD/Monat** (500 Credits), Mehrverbrauch **1,20 USD/Credit**. Enterprise auf Anfrage | Konkreter Entwicklerplattform-Preisanker, **kein** vergleichbarer Endkundenpreis und kein belegter Nala-Preisvorteil |
| [Bentley iTwin Experience](https://www.bentley.com/products/itwin-experience/) – große Asset-/Infrastrukturportfolios | Webbasierte 2D/3D-/IoT- und Betriebsdatenansicht, rollenbasierte Zugriffe | Preis auf Anfrage | Rollen und Digital-Twin-Visualisierung sind nicht exklusiv |
| [Bentley iTwin IoT](https://www.bentley.com/products/itwin-iot) – Infrastrukturmonitoring | Echtzeit-Sensordaten, Diagramme, Alarme, laut Hersteller KI-Anomalieerkennung | Preis auf Anfrage | KI-Anomalieerkennung nicht als unbesetzte Marktlücke behandeln |
| [Autodesk Tandem Connect](https://www.autodesk.com/nl/products/tandem-connect/buy) – Integratoren und Betreiber | Free ohne Produktionsplugins; Paid mit zehn Produktionsplugins | Niederländische Autodesk-Seite zeigt **666 EUR/Monat** bei monatlicher Zahlung. **Länder-, Steuer- und Vertragsgültigkeit für Deutschland nicht bestätigt** | Erstmals konkreter öffentlich angezeigter EUR-Preisanker für Connect, nicht für Tandem selbst |

**Autodesk-Lizenzabgrenzung:** [Aktuelle Nutzungsbedingungen](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) führen Capacity-based Free (500 Assets), Essentials (5.000) und Paid (10.000) neben älteren Tagged-Assets/Streams-Tarifen; Zahlen nicht vermischen. **Keines der Angebote ist als November-Neueinführung belegt.** Quellen geprüft am 19.11.2026, Anbieterangaben, keine unabhängigen Leistungstests.

**Projektabgleich:** Nach [PR #244](../../pull/244) ist die Web-Navigation überarbeitet; [#238](../../pull/238) belegt iPhone-Team-/Gebäudegruppenfunktionen, [#239](../../pull/239) Kalenderfunktionen, [#240](../../pull/240) IFC-Lichtvisualisierung. Merge-Nachweis ist kein produktiver End-to-End-Test. D21-Live-Messwert ([#74](../../issues/74), [#102](../../issues/102)), Kalender-Datenintegrität ([#243](../../issues/243)) und kommerzieller Preisvorteil sind nicht nachgewiesen. **USP-Hypothese:** schlanker IFC-Raum–Sensor–Wartungsablauf für kleine Teams, durch reproduzierbaren Pilot zu validieren.
