# Recherchejournal

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
