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
