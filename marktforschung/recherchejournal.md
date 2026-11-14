# Recherchejournal

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
