# Marktforschung – KI trifft Gebäude

## 28.11.2026, morgens – Know My Building, Metrikus und Spacewell

Quellenabruf 28.11.2026; neu im geprüften Vergleich, keine heutige Markteinführung oder Preisänderung belegt. Anbieterangaben, keine eigenen Produkttests.

- [Know My Building – Preisrechner](https://www.knowmybuilding.co.uk/pricing/): Gebäudebetreiber, insbesondere Schul-/Estate-Teams; digitale Gebäudeabbilder, Grundrisse, Anlagenregister und physische Asset-Tags. Einrichtung ab 3.500 GBP, Software ab 100 GBP je Gebäude/Monat, zehn Tags inklusive, weitere 10 GBP je Tag. Ein Gebäude/12 Monate rechnerisch ab 4.700 GBP ohne zusätzliche Modellvermessung; deren Preis ist flächenabhängig. Native IFC-/Revit-Funktionen, Live-GA und KI-Sprache nicht bestätigt. Keine Anbieter-Einsparprognosen übernommen.
- [Metrikus API](https://www.metrikus.io/solutions/metrikus-api) und [Plattform](https://www.metrikus.io/why-metrikus): Workplace-Teams, Entwickler und Beratungen; vereinheitlichte Belegungs-, Raumklima-, Strom-, Gas- und Wasserdaten, KI-gestützte Erkenntnisse. Öffentlicher Preis und Lizenzumfang in diesen Quellen nicht bestätigt; IFC-/Revit-Viewer und Sprachsteuerung ebenfalls nicht bestätigt.
- [Spacewell MCS](https://spacewell.com/company/news/spacewell-achieves-vision-of-bim-enabled-fm/) (Ankündigung 31.08.2020): OpenBIM, IoT, Bimplus-Integration und Arbeitsaufträge für FM. [Spacewell Energy im britischen G-Cloud-14-Katalog](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/368612606860260): KI-Energieanalyse, Prognosen, Alarme, Baselines; 1.750–5.000 GBP je Lizenz/Monat, Bildungspreise verfügbar, Betrag nicht genannt. Kein deutscher Preis und kein Gesamtpreis für BIM plus Energie; Sprachsteuerung nicht bestätigt.

**Nala-Abgleich:** [README/main](../README.md) (Stand 26.11., Blob f05c38f) und am 28.11. erneut direkt als gemergt geprüfte [#295](../../pull/295), [#299](../../pull/299), [#300](../../pull/300): mobile Raumkarten mit Messwertquelle/Zeitpunkt, QR-Link, Foto-Mängelmeldung und KI-Raumkontext; HA-Live-Energie, fällige Aufgaben und Rollen. Simulator-/Vorschautests laut PRs, nicht selbst wiederholt; echter Server-/Kameratest, gezielter iPhone-3D-Raumfokus, freigegebene D21-Livedaten und reproduzierbare Revit-Synchronisation nicht nachgewiesen. Keine belegte gleichwertige Energieprognose oder IPMVP-Einsparvalidierung.

**Chance:** Hochschulpilot mit transparenten Einrichtungskosten und messbarer Zeit bis zum ersten realen Raum-Messwert; Vergleich von Modellpflege, Datenintegration, KI-Kosten und Support. **Risiko:** etablierte Anbieter decken BIM+IoT+FM bzw. KI-Energieanalyse bereits ab; kein exklusiver USP oder Preisvorteil nachgewiesen. Preise verschiedener Leistungsumfänge und Länder nicht direkt gleichsetzen.

---

## 27.11.2026, abends – Mobile Betriebsprozesse und Live-Zwillinge

Quellenabruf 27.11.2026; Anbieterangaben, keine eigenen Produkttests. FotoEstate ist neu im dokumentierten Vergleich, Dalux bereits seit 21.11. enthalten. Keine heutige Markteinführung oder Preisänderung bestätigt.

- [FotoEstate – IoT-Integration](https://fotoestate.de/leistungen/iot-smart-building-integration): projektbezogene Dienstleistung für Gebäudebetreiber und FM; verknüpft 3D-/BIM-Modelle mit IoT-Daten, MQTT/REST, Raumklima, Belegung und Energie sowie CAFM. Einstieg **999 EUR pro Projekt zzgl. MwSt.**; Umfang, laufende Kosten, native IFC-/Revit-Bearbeitung und KI-Sprachfunktionen nicht bestätigt. Kein vergleichbarer SaaS-Tarif.
- [Dalux FM](https://www.dalux.com/de-ch/produkte/dalux-fm/) und [BIM-Dokumentation](https://www.dalux.com/de-at/produkte/dalux-fm/bim-dokumentation/): Cloud-CAFM für Betreiber, FM und Dienstleister, Web/iOS/Android, IFC/Revit, QR-Meldungen, Wartung und Lieferantenportal; 14 Tage Test, regulärer Preis nicht bestätigt. [Release 2026.6 vom 29.09.2026](https://support.dalux.com/hc/de/articles/29797937108892-FM-Versionshinweise-2026-5-und-2026-6): zusätzliche SLA-Kennzahlen für Reaktionszeit, Bearbeitungsdauer und Fristeinhaltung sowie standortbasierter Lieferanten-Check-in. Keine bestätigte native KI-Sprachsteuerung oder Live-GA in diesen Quellen.

**Nala-Abgleich:** Haupt-README auf main (Stand 26.11.) und direkt als gemergt geprüfte [#295](../../pull/295), [#299](../../pull/299), [#300](../../pull/300) vom 27.11.: iPhone-Raumkarte mit QR-Link, Foto-Mängelmeldung, Raumkontext für KI und Messwert-Herkunft; Live-Energie mit HA, Dokumente, Adminübersicht; fällige Aufgaben und gemeinsame Rollen. Laut PRs Simulator-/Vorschautests, nicht selbst wiederholt; echter Kamerascan, produktive Universal Links, gezielter 3D-Raumfokus auf iPhone und echter Servertest offen. D21-Livewert und reproduzierbare Revit-Synchronisation nicht nachgewiesen. Dalux-gleichwertiger SLA-/Lieferantenprozess nicht belegt.

**Chance:** mobiler Ablauf QR → Raum → Messwert mit Herkunft → KI-Abfrage → Mängelmeldung; Zeitbedarf, Datenqualität und Rechte mit identischem Referenzfall messen. **Risiko:** mobile BIM-Wartung und räumliche Live-Daten sind etablierte Angebote; weder USP noch Preisvorteil nachgewiesen. Für Kostenvergleich einmalige Einrichtung, Modellpflege, Hosting, KI, Hardware und Support getrennt erfassen.

---


## 26.11.2026, 19:00 MEZ – Energiemanagement: evcc und HEMSight

Neu im geprüften Vergleich, keine bestätigte heutige Markteinführung. Anbieter-/Projektquellen, Abruf 26.11.2026:

| Angebot / Zielgruppe | Funktionen laut Projekt | Preis / Lizenz |
| --- | --- | --- |
| [evcc](https://docs.evcc.io/) – Haushalte, PV-/Wallbox-Betreiber, Integratoren | PV-Überschussladen, dynamische Tarife, Speicherkoordination, Lastmanagement, Home Assistant, REST/MQTT und MCP für KI-Assistenten; lokaler Betrieb | Selbsthosting möglich; konkrete Sponsorbedingungen und Preise nicht in dieser Quelle bestätigt |
| [HEMSight](https://hemsight.de/en/) – Smart-Home-/PV-Haushalte | Prognosebasierte Planung für PV, Speicher, Wallbox und Verbraucher; lokale Docker-/HA-Installation, Freigaben und Rücklesung vor Schaltaktionen | Laut Anbieter kostenlos, frühe Beta; konkrete Lizenzbedingungen und Hardwarekosten nicht bestätigt |

**Nala-Abgleich:** [PR #291](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/291) direkt als gemergt geprüft: Strom-/Wasseransichten, HA-Livewerte, PV-Plan/3D, Speicherstand, rechnerische Notstromreserve, Tarife, Abrechnung und CSV. Laut PR 56 Viewer-, 33 Backend-, acht HA- und zwei lokale Browsertests (synthetische Werte); nicht selbst ausgeführt. Haupt-README auf main weiterhin 20.11.; IFC, Gemini, ElevenLabs und private HA-Anbindung dokumentiert. Echte D21-Daten, produktive Revit-Synchronisation und automatische tarifoptimierte Speichersteuerung nicht nachgewiesen. Bei beiden Energieangeboten nativer IFC-/Revit-Viewer und BIM-Sprachkontext nicht aus den geprüften Quellen belegt.

**Chance:** BIM-gebundene Energie- und Anlagenübersicht mit nachvollziehbarer Datenherkunft; evcc als mögliche Integrationsschicht prüfen. **Risiko:** PV-Flüsse, Tarife, lokale Steuerung und KI-Schnittstellen sind keine exklusiven Funktionen; Visualisierung ist keine Optimierung. **Test:** identische 24h-Messreihe mit Netzbezug/Einspeisung, Speicherstand, Tarifwechsel und fehlenden Werten; Kostenrechnung gegen Referenz prüfen. Keine Einsparung oder USP nachgewiesen.

---

**Beginn:** 13. November 2026 · **Pflege:** zweimal täglich (09:00 und 19:00 Uhr, Europe/Berlin).

Dieser Ordner dokumentiert nachvollziehbar, welche bestehenden Produkte mit unserem Projekt **KI trifft Gebäude** konkurrieren oder ähnliche Funktionen anbieten. Neue Erkenntnisse werden mit Datum, Quellen und Abgrenzung zum tatsächlich implementierten Projektstand festgehalten.

## Fragestellung

Welche am Markt angebotenen Lösungen verbinden digitale Gebäudemappen, BIM/IFC-Modelle, Sensordaten, Gebäudeautomation, KI-Assistenz und mobile Bedienung? Welche Funktionen, Lizenzmodelle und Zielgruppen unterscheiden sich von unserem Prototyp?

## Untersuchungsfelder

| Marktsegment | Zu vergleichende Merkmale |
| :--- | :--- |
| BIM- und IFC-Viewer | IFC-Import, Bauteilauswahl, Geschosse, Mobilgeräte, Zusammenarbeit |
| Digitale Zwillinge / CAFM | Gebäudedaten, Anlagenstruktur, Betriebsprozesse, Schnittstellen |
| Gebäudeautomation / Smart Home | KNX, Home Assistant, MQTT, Gerätesteuerung, Berechtigungen |
| Energie- und Sensordaten | Live-Messwerte, Zeitreihen, Dashboards, Analyse, Datenexport |
| KI- und Sprachassistenten | Datenfreigabe, Kontext, Aktionsbestätigung, Datenschutz |
| Revit-/BIM-Integration | Import/Export, Synchronisierung, Änderungsmanagement |

## Recherchestandard

1. Für jede Lösung **Anbieter, Produkt, offizielle URL, Abrufdatum, Zielgruppe, Funktionen und Preis-/Lizenzangaben** festhalten.
2. Fakten von Werbeversprechen und eigener Bewertung trennen; fehlende Preise als **nicht öffentlich bestätigt** kennzeichnen.
3. Nur Funktionen mit konkreten Quellen vergleichen. Beim eigenen Projekt zwischen **implementiert**, **getestet**, **simuliert** und **geplant** unterscheiden.
4. Neue Erkenntnisse in [Wettbewerbsvergleich](wettbewerbsvergleich.md) und [Recherchejournal](recherchejournal.md) dokumentieren; neue Einträge im Journal oben.
5. Bei Änderungen eigene Branches und Pull Requests nutzen; keine ungeprüften Produktbehauptungen oder fiktiven Preise eintragen.

**Projektquellen:** [Haupt-README](../README.md) · [Issues](../../issues) · [Pull Requests](../../pulls).

> Dieser Startstand ist die Recherche-Struktur, noch **keine abgeschlossene Marktanalyse**.

## Aktueller Kurzüberblick · 15.11.2026

**Neu beobachtet:** [Twiniti Lexi](https://lexi.twiniti.ai/) (kostenloser KI-Chat über 3D-Modell, bezahlte Plus-Stufe auf Warteliste) und [Scope3D](https://scope3d.com/) (Anbieter wirbt mit IFC/Revit/PDF → 3D-Twin, KI-Copilot und Betrieb; veröffentlichter Einstieg ab 750 USD einmalig + 59 USD/Monat). Beides sind **Herstellerangaben**, keine unabhängigen Produkt- oder Preisprüfungen. Weitere Details und Projektabgleich im [Wettbewerbsvergleich](wettbewerbsvergleich.md).

**Aktueller Projektabgleich:** [README](../README.md) nennt IFC-/Web-/iPhone-Prototyp, Gemini- und Sprachfunktionen sowie private Home-Assistant-Lampen. [PR #165](../../pull/165) (README) und [#166](../../pull/166) (Marktforschung) sind inzwischen in `main` gemergt. [#163](../../pull/163) (Mängelmelder) ist offen und nicht als ausgeliefertes Feature zu werten; ein echter D21-Sensordatenpunkt ist nicht belegt. Einzigartigkeit oder Preisvorteil sind **nicht nachgewiesen**.

## Ergänzung · 15.11.2026, 19:00 MEZ

**Weitere relevante Bestandsanbieter:** [Archibus Digital Twins](https://help.archibus.com/user_en/Subsystems/webc/Content/web_user/bim_viewer/bim_viewer.htm) (Revit-/Autodesk-Construction-Cloud-BIM-Viewer, SaaS und Non-SaaS; kostenpflichtige Digital-Twins-Lizenz) sowie [BuildingMinds](https://buildingminds.com/de/daten) (Digital Building Twin, API-Konnektoren für BMS, IoT und Energiemanagement). Für beide wurde **kein belastbarer öffentlicher EUR-Listenpreis** gefunden. Neu in dieser Vergleichsrunde, nicht zwingend neu am Markt. Quellen und Projektgrenzen stehen im [Wettbewerbsvergleich](wettbewerbsvergleich.md) und [Journal](recherchejournal.md).

## Ergänzung · 16.11.2026 – KI-Betriebsassistent und Lizenzmigration

**Neu im Wettbewerbsradar:** [Tacit Twin](https://tacitwin.ai/) (UCL-Spinout) bewirbt einen natürlichsprachlichen Gebäudeassistenten, gemeinsame BMS-/BIM-/IoT-Daten, erklärbare Fehlerdiagnosen und priorisierte Energiekosten. Öffentlich belastbarer Listenpreis und unabhängige Produktvalidierung fehlen. [realvirtual.io](https://realvirtual.io/en) bietet einen KI-gestützten industriellen Digital-Twin-Editor mit MCP-Server und AGPL-3.0-Kern; eher angrenzender Technologieanbieter als direkter Gebäudebetriebs-SaaS-Wettbewerber.

**Lizenzrisiko Autodesk:** Autodesk dokumentiert seit **09.02.2026** den Übergang auf kapazitätsbasierte Tandem-Abos. Legacy-Free-Konten wurden nicht automatisch migriert; laut Autodesk-Support konnten alte Konten gesperrt und Datenpipelines deaktiviert werden. [Nutzungsbedingungen](https://www.autodesk.com/company/terms-of-use/de/offering-types-and-benefits), [Support 19.05.2026](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Autodesk-Tandem-Moves-to-Capacity-Based-Subscription-Model-Prompting-Account-Action.html), [Support 22.08.2026](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/This-account-is-no-longer-supported-and-is-locked-when-accessing-Tandem-connect.html). **Kein neues Ereignis vom 16.11.**, sondern neu aufgenommene, offiziell belegte Migrationsfolgen.

## 25.11.2026, 19:00 MEZ – Kamerafreie Raumbelegung als Wettbewerbsfeld

Neu im Vergleich, nicht als neue Markteinführung bestätigt. Herstellerquellen geprüft am 25.11.2026:

| Angebot / Zielgruppe | Funktionen laut Anbieter | Preis / Lizenz |
| --- | --- | --- |
| [Aqusense](https://aqusense.com/) – Gebäudeeigentümer, FM, Campus, Integratoren | WLAN-basierte Raum-/Zonenbelegung und Bewegung, PoE-Sensoren, Dashboards, APIs und Gebäudeintegrationen | Kein öffentlicher Preis auf geprüfter Seite; Vertragsmodell nicht bestätigt |
| [Origin Wireless](https://www.originwirelessai.com/wifi-sensing/) – Netzwerk- und IoT-Anbieter | CSI-basierte Bewegungs- und Belegungserkennung auf kompatibler Netzwerktechnik, konfigurierbare Haltezeit, eingebettete/hybride/cloudgestützte Architektur | Kein öffentlicher Lizenzpreis bestätigt |
| [Aqara FP2](https://www.aqara.com/de/product/presence-sensor-fp2/) – Smart Home | mmWave-Radar (nicht WLAN-CSI), bis 40 m², bis 30 Zonen, bis fünf Personen laut Hersteller, beste Ergebnisse bis drei; Home Assistant über HomeKit | [EU-Shop](https://eu.aqara.com/de-eu/products/aqara-presence-sensor-fp2) zeigt 82,99 EUR je Gerät; mögliche Zusatzabos für neue Funktionen laut [Produktseite](https://www.aqara.com/en/product/presence-sensor-fp2) |

**Projektabgleich:** RuView experimentell dokumentiert; Hardwarevalidierung und D21-Freigabe offen. Details im [Vergleich](wettbewerbsvergleich.md) und [Journal](recherchejournal.md).
