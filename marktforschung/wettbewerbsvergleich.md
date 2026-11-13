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
