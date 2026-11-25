# Marktforschung – KI trifft Gebäude

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
