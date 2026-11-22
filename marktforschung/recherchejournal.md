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

## 20.11.2026 – dTwin, Twinview und ioFM (Quellenabruf 20.11.2026)

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


| Anbieter / Zielgruppe | Herstellerseitig belegte Funktionen | Lizenz / Preis |
| --- | --- | --- |
| [Nemetschek dTwin](https://www.nemetschek-dtwin.com/pricing) – Betreiber und Asset-Management | BIM, GIS, 2D, Reality Capture, Dashboards; höherer Tarif mit Echtzeitdaten und FM/ERP/BMS/IoT-Anbindung | View & Explore ab 3.500 EUR/Jahr; View, Connect & Operate ab 5.000 EUR/Jahr, jährliche Abrechnung; Enterprise individuell. Endpreis abhängig u.a. von Fläche und Speicher. |
| [Twinview](https://www.twinview.com/platform) – FM-Teams und Portfolioverantwortliche | Assetregister, Lebenszyklus, Anomaliehinweise, Audit-Trails, Rollen/SSO; [Integrationen](https://www.twinview.com/integrations) nennen IFC, Revit, MQTT, BACnet, Modbus und REST | Demo/Vertrieb; kein öffentlicher Betrag in geprüften Seiten. |
| [ioLabs ioFM](https://www.siemens.com/en-us/products/iolabs-ag-iofm-fast-and-cost-effective-way-to-digital-twin/) – Betreiber heterogen dokumentierter Bestandsportfolios | Minimal-BIM, Modellierung als Dienstleistung aus CAD, PDF, IFC und weiteren Bestandsunterlagen, Webviewer | Raumbezogenes Abo laut Produktseite; konkreter Betrag nicht bestätigt. |

Keine datierte November-Neueinführung bestätigt; neu im Vergleich erfasste Angebote, keine unabhängigen Leistungstests. Sprachassistenten oder konkrete KI-Geräteaktionen bei diesen drei Angeboten nicht anhand dieser Quellen bestätigt (kein Nachweis ihres Fehlens).

**Nala-Abgleich:** README/main nennt noch 1.0.152, während gemergte #238 und #240 den neueren iPhone-Stand einschließlich Rollen/Gebäudegruppen und IFC-Licht dokumentieren; #244 überarbeitet Webnavigation. README dokumentiert ESP32/BME280, private Home-Assistant-Anbindung und Sensor-Raum-Zuordnung mit Rückfrage. Echter D21-Datenpunkt, reproduzierbare Revit-Anbindung, produktive Installation und Kalender-Datenintegrität (#243) nicht nachgewiesen. Kein neuer Anwendungscode-PR seit #244 in der aktuellen PR-Suche festgestellt. [README](../README.md), [#238](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/238), [#240](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/240), [#244](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/244), [#243](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/243).

**Chance:** Einstieg für kleine Gebäude mit bestehenden IFC-Dateien und nachvollziehbaren Sensor-/Sprachaktionen. **Risiko:** dTwin bietet bereits einen konkreten EUR-Preisanker, Twinview breite Standardprotokolle und ioFM senkt die Modellierungshürde. Kein belegter USP oder Kostenvorteil. Pilot: ein IFC-Raum, echter Messwert, Rechteprüfung, dokumentierte Geräteaktion, Export und Vollkosten einschließlich Hosting/LLM/Integration.

---

## 17. November 2026, 19:00 MEZ – Tandem-Lizenzgrenzen, LiteLLM und Nala 1.0.149

- **Präzisierung, kein neues Produkt:** Autodesk Tandem Free: 500 Assets, 3 Facilities, 100 Mio. Datenpunkte, 500 MB und 10 Modellimporte je Facility. Paid: bis 10.000 Assets und 1 Mrd. Datenpunkte; Tandem Connect Free **0 Produktionsplugins**, Paid **10**. Kapazitätsmodell seit Februar 2026; kein verifizierter EUR-Betrag auf dynamischer Kaufseite. [Nutzungsbedingungen](https://app.learn-one.autodesk.com/content/autodesk/global/en/company/terms-of-use/en/subscription-benefits) · [Tandem](https://www.autodesk.com/sg/products/Tandem/buy) · [Connect](https://www.autodesk.com/sg/products/tandem-connect/buy).
- **Beobachtung:** Home Assistant dokumentiert einen LiteLLM-Proxy als Sprach-/Konversationsintegration. Veröffentlichungsdatum nicht verifiziert; keine behauptete Neuerscheinung. [Offizielle Dokumentation](https://www.home-assistant.io/integrations/litellm) · [Assist](https://www.home-assistant.io/voice_control/). Siemens Fault Triage bleibt belegter September-2026-Stand ([Release Notes](https://www.siemens.com/de-de/products/building-x/release-notes/)).
- **GitHub/main:** [#217](../../pull/217) und [#219](../../pull/219) bringen Home-Assistant-Lampen in die iOS-Geräteansicht und einheitliche Karten (Quellstand Nala 1.0.149); [#218](../../pull/218) verbessert Raum-/Geschosserkennung. [#222](../../pull/222) zur README ist noch offen. Echter D21-Sensor, automatische Sensor-IFC-Zuordnung und produktive KI-Fehler-/Energieanalyse **nicht nachgewiesen**.
- **Chance (Hypothese):** niedrige Einrichtungshürde und erklärbare IFC-Raum-/Geräteverknüpfung; **Risiko:** starke bestehende BIM-/IoT- und LLM-Angebote. Kein belegter Preis- oder Qualitätsvorteil. **Nächster Test:** D21-Livemesswert mit Quelle/Einheit/Zeitstempel und kontrollierter 1:1-Vergleich.
- **Quellenprüfung:** 17.11.2026, offizielle Herstellerseiten und Repository. Anbieterangaben nicht unabhängig praktisch validiert.

---

## 16. November 2026, 19:05 MEZ – KI-Fehleranalyse und Wettbewerbsabgleich

**Siemens Building X Operations Manager:** [Release Notes September 2026](https://www.siemens.com/de-de/products/building-x/release-notes/) bestätigen den optionalen **Fault Triage Agent** für KI-gestützte Untersuchung von Störungen, wahrscheinliche Ursachen und mögliche Lösungswege. [Produktseite](https://www.siemens.com/de-ch/products/building-x/applications/operations-manager/). Zielgruppe: technische Gebäudebetreiber. **Kein bestätigter EUR-Preis, keine unabhängige Validierung der Diagnosequalität; kein neues November-Release.**

**Autodesk Tandem Connect:** [Produktdetails](https://www.autodesk.com/products/tandem-connect/product-details) nennen vorgefertigte Integrationen, nahezu Echtzeit-Datenübertragung, bidirektionale Synchronisierung und ereignisgesteuerte Workflows (Alarme/Wartungsaufträge). **Öffentlicher Betrag nicht verifizierbar** (dynamischer Preisplatzhalter). [Tandem Free](https://www.autodesk.com/sg/products/Tandem/buy): 500 Assets, 100 Mio. Datenpunkte, 3 Gebäude; keine Add-ons.

**Home Assistant Assist:** [Offizielle Dokumentation](https://www.home-assistant.io/voice_control/) und [LLM-Anbindung](https://www.home-assistant.io/voice_control/assist_create_open_ai_personality/) belegen lokale bzw. LLM-gestützte Sprache und Smart-Home-Aktionen. Kein Alleinstellungsmerkmal für Voice/LLM-Steuerung; Software Open Source, Betriebskosten separat.

**Projektabgleich (README/main, 16.11.):** IFC-Webviewer, SwiftUI, Gemini-Lesewerkzeuge, Home-Assistant-Testlampen und ESP32-/BME280-API mit gemeinsamer Raumzuordnung sind dokumentiert. [#189](../../issues/189) nennt offene Hardware-/24h-Tests; [#74](../../issues/74) und [#102](../../issues/102) weiterhin ohne bestätigten echten D21-Datenpunkt. Automatische Sensor-IFC-Zuordnung, KI-Ursachendiagnose und Energie-Anomalieerkennung **nicht als produktiv nachgewiesen**; vorhandene Raumzuordnung nicht als automatische KI-Zuordnung ausgeben.

**Chance (Hypothese):** überprüfbare Sensor-IFC-Raum-Verknüpfung mit Datenherkunft und Rechteprüfung für kleinere Teams. **Risiko:** Siemens besetzt KI-Fehlerdiagnose, Autodesk Integrationsworkflows und Home Assistant Sprachsteuerung. Weder Preis- noch Qualitätsvorteil belegt.

**Nächster Test:** Freigegebener echter D21-Messwert mit Einheit/Zeitstempel/IFC-Raum, 24h-Dauerlauf, dokumentierte Fehlerfälle, Datenschutzprüfung und einheitlicher Vollkostenvergleich. Quellenabruf: **16.11.2026**, ausschließlich Herstellerangaben.

---

# Recherchejournal

## 16. November 2026, ca. 09:41 MEZ – Tacit Twin und Autodesk-Lizenzmigration

- **Neu im Radar:** [Tacit Twin](https://tacitwin.ai/): KI-Abfragen über BMS/BIM/IoT, Kostenpriorisierung von Störungen; Preis, IFC-Viewer und reale Breite der Implementierung nicht unabhängig bestätigt. [realvirtual.io](https://realvirtual.io/en): industrieller Twin-Editor mit MCP/AI, Public Demo und AGPL-3.0-Kern, nur angrenzender Wettbewerber.
- **Neue belegte Risikoanalyse:** Autodesk-Tandem-Kapazitätslizenzen gelten ab 09.02.2026; [Autodesk Support 19.05.](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Tandem-Moves-to-Capacity-Based-Subscription-Model-Prompting-Account-Action.html) und [22.08.](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/This-account-is-no-longer-supported-and-is-locked-when-accessing-Tandem-connect.html) dokumentieren Migration alter Free-Konten und gesperrte Legacy-Konten. Keine aktuelle November-Produktänderung behauptet.
- **Abgleich:** README/main bestätigt IFC/Gemini/Home Assistant; #169/#171 sind offene PRs; echter D21-Messwert und Preis-/USP-Vorteil unbestätigt. Prüfpunkte: reproduzierbarer IFC-Sensor-Test, Datenschutz, Datenexport, Gesamtkosten.
- **Quellenabruf:** 16.11.2026; Herstellerseiten und Autodesk-Support, keine unabhängigen Benchmarks.

## 16. November 2026, ca. 09:30 MEZ – Siemens-Lizenz- und Datenresidenzprüfung

**Kein neuer Wettbewerber**, aber eine für den Kosten- und Datenschutzvergleich relevante Lizenzpräzisierung: Siemens Lifecycle Twin bietet Cloud- und On-Premises-Abos mit benannten Nutzern/Speicher (10/20 GB bis 250/500 GB), Jahreslaufzeit, jährlicher Vorauszahlung und separater API-/CAD-Server-Lizenzmetrik. Laut Datenblatt muss die Cloud-Region bei Erstbestellung gewählt werden; die Wahl ist nicht reversibel. EU (Irland) ist für spätere Building-X-/IoT-Integration relevant. **Kein belastbarer öffentlicher EUR-Listenpreis**. Siemens dokumentiert auch Issue-Workflows direkt am BIM-Modell; daher ist ein 3D-Mängelmelder allein kein USP.

**GitHub-Abgleich (historischer Recherchezeitpunkt):** Die damaligen PR-Statusangaben sind keine aktuelle Freigabeübersicht. Aktuelle Merges stehen im Changelog und auf GitHub. Echter D21-Messwert und End-to-End-Vergleich unbestätigt. **Chance (Hypothese):** schlanker, nachvollziehbar kalkulierter Pilot für kleine Gebäudeteams. **Risiko:** Siemens bietet bereits Campus-, BIM- und Instandhaltungsprozesse. **Nächster Schritt:** reale D21-Daten, Rollen und Vollkosten gegen Siemens-Tarifangebot testen.

**Quellen, geprüft 16.11.2026:** [Siemens Lifecycle Twin](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/); [Siemens Datenblatt (Stand 26.03.2025)](https://assets.new.siemens.com/siemens/assets/api/uuid%3A0251ec0c-76db-46ae-97f3-eddc38f4271a/BuildingX-Data-Sheet-Lifecycle-Twin-2025-03-26_original.pdf). Herstellerangaben, kein unabhängiger Produkttest.

---


## 15. November 2026, ca. 19:00 MEZ – Archibus und BuildingMinds im Betriebsvergleich

**Neue Wettbewerber in dieser Vergleichsrunde (nicht als neue Produkteinführung behauptet):** Archibus Digital Twins mit Revit-Modellen aus Autodesk Construction Cloud/Build, Autodesk-APS-basiertem BIM-Viewer und Verknüpfung von Assets; sowohl SaaS als auch Non-SaaS, jedoch nur mit kostenpflichtiger Digital-Twins-Lizenz. BuildingMinds mit Digital Building Twin und API-Integration für BMS, IoT, Smart Meter, CAFM und Energiemanagement sowie KI-gestützter Nachrüstplanung. Hersteller kennzeichnet einzelne Szenarienvergleiche und Wirkungsnachweise als noch nicht verfügbar. **Keine verifizierten EUR-Listenpreise** für diese Angebote. Aussagen beruhen auf Anbieterquellen, nicht auf unabhängigen Produkttests.

**Quellen (Abruf 15.11.2026):** [Archibus BIM Viewer](https://help.archibus.com/user_en/Subsystems/webc/Content/web_user/bim_viewer/bim_viewer.htm), [Archibus BIM-Viewer-Definition](https://help.archibus.com/user_en/Subsystems/webc/Content/shared_gloss/bim_viewer_def.htm), [BuildingMinds Daten](https://buildingminds.com/de/daten), [BuildingMinds KI-Nachrüstung](https://buildingminds.com/de/digital-twin2/).

**Projektabgleich:** Hauptbranch-README beschreibt IFC-/Web-/iPhone-Prototyp, Gemini-/ElevenLabs-Funktionen und private Home-Assistant-Geräte. PR #167 ergänzt Marktanalyse; PR #163 Mängelmelder ist noch offen. Echtes D21-Telemetrie-zu-IFC-End-to-End-Szenario und Preisvorteil **nicht bestätigt**.

**Chance:** Niedrigschwellige Bedienung für kleine Gebäudeteams und verifizierbare Raum-Sensor-Zuordnung; **Risiko:** Archibus verbindet bereits BIM und Assetmanagement, BuildingMinds IoT und Energiedaten. **Nächster Test:** Revit/IFC-Raum, reale Messwerte, Rollenrechte und Implementierungskosten mit gleicher Testaufgabe vergleichen.

---

## 15. November 2026, ca. 09:00 MEZ – Neue Anbieter Lexi und Scope3D; Autodesk-Lizenzmodelle getrennt

**Neue direkte Wettbewerber:** [Twiniti Lexi](https://lexi.twiniti.ai/) bietet laut offizieller Produktseite **Lexi Lite kostenlos** als 3D-Viewer (APS/Fragments) mit KI-Modellchat; **Lexi Plus** kostenpflichtig und auf Warteliste, ohne verifizierten Preis. [Scope3D](https://scope3d.com/) bewirbt IFC/Revit/PDF-zu-3D-Twin, KI-Copilot, IFC-Export und Betriebsfunktionen. Veröffentlichte Einstiegspreise **ab 750 USD einmalig pro Gebäude plus ab 59 USD/Monat**; tatsächlicher Vertrag, Steuer, Funktionsumfang und Praxistauglichkeit **nicht unabhängig bestätigt**. Zielgruppen: BIM/AEC-Teams beziehungsweise Gebäudeeigentümer und Betreiber.

**Lizenzpräzisierung:** [Autodesk Tandem Terms](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) unterscheiden *Capacity-based*-Stufen (Free: 500 Assets/3 Facilities/100 Mio. Datenpunkte) von *Tagged-Assets/Streams*-Stufen (Free: 1.000 Tagged Assets/200 Streams/14 Tage). Nicht zu einem einzigen Paket vermischen. [Bentley iTwin](https://developer.bentley.com/pricing/) unverändert 199 bzw. 499 USD/Monat für Entwicklerplattform; Free nur nicht kommerziell.

**Projektabgleich:** Die [README auf main](../README.md) beschreibt den IFC-/KI-/Sprach-Prototyp mit LiDAR→IFC, Gemini-Lesewerkzeugen und privaten Home-Assistant-Lampen. [PR #165](../../pull/165) und [#166](../../pull/166) sind inzwischen gemergt. [PR #163](../../pull/163) Mängelmelder weiterhin offen; echter D21-Messwert, produktive Revit-Liveanbindung, unabhängige KI-/Sprachtests und Preisvorteil nicht nachgewiesen.

**Chance:** transparente Raum-Sensor-Rechte-Nutzerführung für kleinere Gebäudeteams (Hypothese). **Risiko:** kostenlose KI-3D-Viewer und kommerzielle Plan-zu-Twin-Angebote verkleinern die vermeintliche Differenzierung. **Nächster Schritt:** Vergleichstest mit echtem D21-Datenpunkt und identischen Modell-/Rollenbedingungen. Alle Quellen abgerufen am **15.11.2026**; Anbieterangaben sind keine unabhängigen Tests.

---


## 14. November 2026, ca. 19:00 MEZ – Abendprüfung: Tandem Connect und Siemens-Campusreferenz

**Offizielle Quellen erneut geprüft:** Autodesk Tandem [Produktvergleich](https://www.autodesk.com/products/tandem/compare) und [Nutzungsbedingungen](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits); [Siemens Lifecycle Twin](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/); [Bentley-Preise](https://developer.bentley.com/pricing/). Abrufdatum **14.11.2026**. Die Angaben sind Herstellerangaben, keine unabhängigen Funktionstests.

**Neue Erkenntnis:** Tandem Connect Free hat keine Produktions-Pipelines; Standard nennt 10 Produktions-Plugins je Paket und MQTT-Broker als Zusatzpaket. Tandem Free ist in den Nutzungsbedingungen auf interne geschäftliche Zwecke begrenzt. Siemens nennt die University of Wollongong als konkreten Campus-Anwendungsfall mit Lifecycle Twin, Energy Manager und Operations Manager. **Kein neuer, bislang unbekannter Anbieter** in diesem Lauf; neue verifizierte Produkt-/Lizenzdetails.

**Preise:** Bentley Community kostenlos nur nicht kommerziell/nicht produktiv; Standard 199 USD/Monat, Premium 499 USD/Monat (Plattformtarife). Autodesk Tandem Free kostenlos, bezahlter deutscher EUR-Preis und Tandem-Connect-Zusatzkosten weiterhin nicht verifiziert; Siemens EUR-Preis nicht verifiziert. Widersprüchliche Sandbox-Plugin-Zahlen zwischen Autodesk-Vergleich und Terms vor Vertragsentscheidung klären.

**GitHub-Abgleich:** README auf main beschreibt IFC-/Web-/iPhone-Prototyp und private Home-Assistant-Integration. Neuere PRs #160, #161, #162, #164 betreffen LiDAR→IFC, Gemini-Lesewerkzeuge und IFC-Geometrieanalyse. PR #163 (Mängelmelder) und #165 (README) waren bei der Prüfung offen. **Echter D21-Messwert, vollständige produktive Sprachsteuerung, unabhängiger D21-IFC-Praxistest nicht nachgewiesen.**

**Chance:** belegbarer, schlanker Raum→Sensor→Rechte-Workflow statt Featurelisten-USP. **Risiko:** Campuspositionierung durch Siemens und günstiger Einstieg durch Tandem bereits besetzt. **Nächster Schritt:** Vergleichsversuch mit identischer Messwert-/Raum-/Rechte-Aufgabe und dokumentierten Vollkosten.

---


## 14. November 2026, ca. 09:00 MEZ – Bentley iTwin und Freemium-Preise

**Neuer Wettbewerber:** Bentley iTwin Platform, offizielle APIs für digitale Zwillinge mit Sensor- und Engineering-Daten. Offizielle Entwicklerpreise: Community kostenlos (nur privat/nicht kommerziell/nicht produktiv, 100 Credits/Monat), Standard **199 USD/Monat**, Premium **499 USD/Monat**, Zusatzcredits **1,20 USD**. Kein Endkundenproduktpreis.

**Autodesk Tandem Free präzisiert:** Kostenloser Einstieg mit 500 Assets, 100 Mio. Datenpunkten und drei Facilities. Bezahlstufe mit 10.000 Assets und bis zu 1 Mrd. Datenpunkten; **kein verifizierter EUR-Preis** auf der geprüften Seite.

**Projektabgleich:** Letzter gefundener Merge in main: [#155](../../pull/155), davor [#154](../../pull/154) und [#152](../../pull/152). [README-PR #153](../../pull/153) und [Marktforschungs-PR #156](../../pull/156) offen. Keine nachgewiesenen produktiven D21-Echtmesswerte oder Marktpreisvorteile.

**Chance:** einfacher, raumbezogener IFC-zu-Sensor-Workflow für kleine Campus-/Gebäudeteams, **noch ungetestete Positionierung**. **Risiko:** Freemium-Angebote und etablierte API-Plattformen decken bereits wesentliche Teilfunktionen ab.

**Quellen (Abruf 14.11.2026):** [Bentley Plattform](https://developer.bentley.com/), [Bentley Preise](https://developer.bentley.com/pricing/), [Autodesk Tandem Tarife](https://www.autodesk.com/sg/products/Tandem/buy), [Tandem Free Hilfe](https://help.autodesk.com/cloudhelp/ENU/Tandem-About/files/Tandem_About_access_tandem_free_html.html).

**Nächster Test:** Tandem Free, Bentley und eigene App mit gleicher Aufgabe vergleichen: IFC-Raum öffnen, echten Sensorwert mit Quelle und Zeitstempel zeigen; Einrichtungsschritte, Rechte und Gesamtkosten erfassen.

---


## 13. November 2026, ca. 19:00 MEZ – Abendabgleich

**Neu / präzisiert:** Autodesk **Tandem** als direkten Wettbewerber ergänzt (IFC-/Revit-Import, BMS-/IoT-Streams, raumbezogene Heatmaps); bisher war nur BIM Collaborate Pro erfasst. Siemens-Lizenzbedingungen konkretisiert (Cloud-Angebot laut Datenblatt ab 10 Nutzern/20 GB, 12 Monate; kein EUR-Preis). BuildingMinds beschreibt KI-gestützte Nachrüstungsplanung, kennzeichnet bestimmte Szenarienvergleiche aber als noch nicht verfügbar. Dies sind **Anbieterangaben, keine unabhängigen Praxistests**.

**Projektänderungen seit der Morgenrecherche:** [PR #154](../../pull/154) und [PR #155](../../pull/155) sind gemergt; der KI-/Sprachkontext verwendet nun begrenzte geprüfte IFC-Zählungen statt umfangreicher freier Raumlisten. [PR #153](../../pull/153) (README-Abendstand) ist offen. Keine unabhängige Bestätigung von D21-Livemesswerten oder End-to-End-Sprachfunktion.

**Chancen:** Einfaches Onboarding, überprüfbare Datenherkunft, verständliche Zuordnung IFC-Raum → Sensor und klarer Preis könnten eine Nische sein, müssen aber getestet werden. **Risiken:** Tandem bietet wesentliche Kernfunktionen bereits; Anbieterpreise und reale Gesamtbetriebskosten sind nicht vergleichbar belegt.

**Quellen, abgerufen am 13.11.2026:** [Autodesk Tandem](https://help.autodesk.com/cloudhelp/ENU/Tandem-About/files/Tandem_About_about_tandem_html.html), [Tandem for AEC](https://app.learn-one.autodesk.com/uk/products/bim-collaborate/features/digital-twin), [Tandem Connect](https://www.autodesk.com/dk/products/tandem-connect/buy), [Siemens Lifecycle Twin](https://sid.siemens.com/r/A6V13989089/23513708683_26912673931__de-DE_22822305163), [Siemens-Lizenzdatenblatt](https://assets.new.siemens.com/siemens/assets/api/uuid%3A0251ec0c-76db-46ae-97f3-eddc38f4271a/BuildingX-Data-Sheet-Lifecycle-Twin-2025-03-26_original.pdf), [BuildingMinds KI](https://buildingminds.com/de/digital-twin2/).

**Nächste Prüfung:** verifizierte Preisangebote und direkte Praxisvergleiche (Tandem vs. eigener IFC-Raum/Sensor-Workflow); keine Preise erfinden.


Neue Rechercheläufe werden **oben** eingetragen.

## 13. November 2026, ca. 09:10 MEZ – Erste verifizierte Wettbewerbsübersicht

**Neu erfasst:** Siemens Building X Lifecycle Twin, BuildingMinds, Autodesk BIM Collaborate Pro, Home Assistant/Assist, openHAB und xBIM Toolkit/Xplorer. Anbieterfunktionen anhand offizieller Produkt-/Dokumentationsseiten geprüft; keine unabhängigen Praxistests.

**Wesentliche Ergebnisse:**
- Siemens kombiniert bereits BIM-Visualisierung und Gebäudebetriebsdaten; Preis nur auf Anfrage.
- BuildingMinds positioniert den digitalen Gebäudezwilling inklusive Zähler-/Verbrauchsdaten und Portfoliomanagement.
- Autodesk bietet umfassende BIM-Kollaboration; kein 1:1-Vergleich mit dem Betrieb eines kleinen Gebäudes.
- Home Assistant hat bereits lokale Sprachsteuerung und Energie-/Geräteintegration; **Sprache oder Smart Home allein sind kein USP**.
- openHAB ist eine herstellerneutrale Open-Source-Alternative; xBIM bietet freie IFC-Bibliotheken und Viewer.
- Preisanker: **Home Assistant Green UVP 179 € Hardware** laut offizieller Seite, nicht mit Software-Abonnements vergleichbar.

**Chancen:** Benutzerführung für Campus-/kleine Betreiberteams, raumbezogene Verknüpfung von IFC und echten Messdaten, nachvollziehbare Datenherkunft.

**Risiken:** Etablierte Wettbewerber decken wesentliche Einzelfunktionen ab. D21-Echtmesswerte, Ende-zu-Ende-Sprachfunktion und Datenschutzfreigaben nicht ungeprüft als fertig ausgeben. Keine verifizierte Aussage zu Preisvorteilen.

**Projektabgleich:** [README auf main](../README.md) (teils älter als neue PRs), [PR #133](../../pull/133), [PR #137](../../pull/137), [PR #139](../../pull/139), [Issue #74](../../issues/74). [Ordner-PR #140](../../pull/140) bleibt offen; diese Recherche ergänzt denselben PR statt einen Duplikat-PR zu erstellen.

**Quellen (Abruf 13.11.2026):** [Siemens](https://www.siemens.com/fi-fi/products/building-x/applications/lifecycle-twin/), [BuildingMinds](https://buildingminds.com/de/portfoliomanagement/), [Autodesk](https://www.autodesk.com/de/products/bim-collaborate/overview), [Home Assistant Green](https://www.home-assistant.io/green), [Assist](https://www.home-assistant.io/voice_control), [openHAB](https://www.openhab.org/), [xBIM](https://docs.xbim.net/).

**Nächster Lauf:** Änderungen an Produktangeboten/Preisen und neue belegte Wettbewerber gegen diese Basis prüfen; nur neue Erkenntnisse ergänzen.

## 13. November 2026 – Struktur angelegt

- Ordner und Vergleichsvorlage für die regelmäßige Wettbewerbsbeobachtung vorbereitet.
- Zum Zeitpunkt der Ordneranlage waren noch keine Produkt- oder Preisbehauptungen verifiziert.


## 19. November 2026, 19:04 MEZ – Bentley-Tarife und Tandem-Connect-EUR-Preis

**Neue belegte Preisdetails:** [Bentley iTwin Platform Pricing](https://developer.bentley.com/pricing/) zeigt Community kostenlos nur für nichtkommerziellen, nichtproduktiven Einsatz (100 Credits/Monat), Standard 199 USD/Monat (200 Credits), Premium 499 USD/Monat (500 Credits), Zusatzcredit 1,20 USD. Dies sind **Entwicklerplattformtarife**, keine fertigen Gebäudebetriebs-App-Lizenzen. [Bentley iTwin Experience](https://www.bentley.com/products/itwin-experience/) und [iTwin IoT](https://www.bentley.com/products/itwin-iot) bieten BIM-/IoT-/Rollenfunktionen beziehungsweise Monitoring und laut Hersteller KI-Anomaliehinweise; Preise nur auf Anfrage.

**Neue Preisquelle:** [Autodesk Tandem Connect Niederlande](https://www.autodesk.com/nl/products/tandem-connect/buy) zeigt **666 EUR/Monat** (monatlich bezahlt) für Paid mit zehn Produktionsplugins, Free ohne Produktionsplugins. Preis für deutsche Rechnungsadresse/Steuern nicht verifiziert. Dies ist **nicht** der Preis von Autodesk Tandem. [Tandem Terms](https://www.autodesk.com/company/terms-of-use/en/offering-types-and-benefits) bestätigen Capacity-based Free 500, Essentials 5.000 und Paid 10.000 Assets, getrennt vom älteren Tagged-Assets-Modell. Keine bestätigte neue November-Einführung.

**GitHub-Stand:** [PR #244](../../pull/244) betrifft Dashboard-Navigation; [#238](../../pull/238) iPhone 1.0.153 mit Teams/Rollen, [#239](../../pull/239) Wartungskalender, [#240](../../pull/240) IFC-Licht. Nach Kalenderentfernung/-wiederherstellung [#241](../../pull/241)/[#242](../../pull/242) ist [#243](../../issues/243) ein Datenintegritätsrisiko, kein bewiesener Datenverlust. Echter D21-Live-Praxistest und belegter Preis-/Qualitätsvorsprung fehlen weiterhin. **Chance:** einfacher Raum–Sensor–Rechte–Wartungs-Pilot; **Risiko:** Bentley/Autodesk decken wesentliche Bestandteile ab. Nächster Schritt: identische Demo und Gesamtbetriebskostenvergleich. Quellenabruf **19.11.2026**; keine eigenen Produktivtests.
