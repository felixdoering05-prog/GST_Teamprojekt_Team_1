# Wettbewerbsvergleich – KI trifft Gebäude

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


## Ergänzung 16.11.2026 – Siemens Lifecycle Twin: Lizenz- und Datenresidenzrisiko

**Neue Präzisierung (kein neuer Anbieter):** Siemens unterscheidet bei Lifecycle Twin **Cloud- und On-Premises-Abonnements**. Die Base-Pakete staffeln sich nach **benannten Nutzern und Speicher**: 10/20 GB, 25/50 GB, 50/100 GB, 100/200 GB, 250/500 GB. Laut offiziellem Datenblatt (26.03.2025) beträgt die Laufzeit **ein Jahr**, die Abrechnung erfolgt jährlich im Voraus. Zusätzliche API-Integrationen werden **pro Integration und Jahr**, ein On-Premises-CAD-Server **pro Server** lizenziert. **Kein verifizierter öffentlicher EUR-Preis**. Die Wahl der Cloud-Region bei Erstbestellung ist laut Datenblatt nicht reversibel; bei geplanten Building-X-/IoT-Integrationen verweist Siemens auf die EU-(Irland)-Bereitstellung. Diese Aussagen sind **Hersteller-/Vertragsangaben**, kein unabhängiger Funktionstest.

**Zielgruppe:** Gebäudeeigentümer, Betreiber, Facility Management und technische Teams. Siemens bietet Revit-Integration, BIM-Viewer, Dokumentenmanagement, Wartungs-/Issue-Prozesse. Ein **Mängelmelder im 3D-Modell ist damit kein exklusives Merkmal** unserer App. Quellen (geprüft 16.11.2026): [Siemens Produktseite](https://www.siemens.com/de-de/products/building-x/applications/lifecycle-twin/), [Siemens Lifecycle-Twin-Datenblatt vom 26.03.2025](https://assets.new.siemens.com/siemens/assets/api/uuid%3A0251ec0c-76db-46ae-97f3-eddc38f4271a/BuildingX-Data-Sheet-Lifecycle-Twin-2025-03-26_original.pdf).

**Projektabgleich 16.11.2026:** GitHub-README beschreibt IFC-/Web-/iPhone-Prototyp mit Gemini-/Sprachfunktionen und privater Home-Assistant-Anbindung. Die PRs [#169](../../pull/169) (Vektorplanvermessung) und [#171](../../pull/171) (Widget/Siri) sind **offen** und nicht als ausgeliefert zu werten. Ein echter D21-Sensordatenpunkt, geprüfte Vollkosten, gleichwertige Rechte-/Datenresidenzprüfung und ein kommerzieller Vorteil sind **nicht bestätigt**. **Chance (Hypothese):** Ein kleiner, transparent kalkulierbarer Pilot ohne jährliche Mindestnutzerpakete; **Risiko:** Siemens hat bereits BIM, Revit und Issue-Workflows. Test: identisches D21-IFC-Modell mit echtem Messwert, Rollen und dokumentierten Betriebs-/API-Kosten vergleichen.
