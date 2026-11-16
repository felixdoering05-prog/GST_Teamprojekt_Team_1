# Historische Projektpflege: 13.–14. November 2026

Diese datierten Notizen aus PR #153 sind archivierte Momentaufnahmen, keine aktuellen Aufgaben- oder Freigabestände. Spätere Merges sind im aktuellen Changelog und auf GitHub dokumentiert. Dies ist kein Team-Sitzungsprotokoll.

## Projektpflege · 14. November 2026, morgens

**Seit der Abendprüfung zusätzlich in `main` bestätigt:** [PR #152](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/152) (strukturierte Gemini-Planerkennung, 151 Backendtests; Genauigkeit an echten Plänen **nicht** nachgewiesen), [#154](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/154) (geprüfte IFC-Raumanzahlen im Sprachkontext, ohne Raumlisten) und [#155](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/155) (gemeinsame begrenzte IFC-Fakten für Text und Sprache; 154 Backendtests und gezielter Integrationstest). Die Zahlen beschreiben Softwaretests laut PR, **keine** Abnahme am echten D21-Modell oder realen Sensoren. Die Funktionen sind gemergt; erneute Live-/Geräteprüfung bleibt getrennt.

**P1 – überfällig seit 13.11.:** [#74](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/74) erster echter D21-Messwert mit Quelle, Einheit, Zeitstempel, Zugriff und Demo; weiterhin offen. Daneben [#102](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/102) Sensorzugang, [#105](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/105) Datenschutzfreigaben und [#101](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/101) Hochschul-KI-Infrastruktur. **P2:** [#73](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/73) Revit→IFC→Server und echte Modell-/Gerätetests nach #144/#150/#151; Protokoll vom 10.11. gegenprüfen. **P3:** [#135](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/135) akustische Überwachung und [#136](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/136) weiterführende AR-Raumerkennung. Prototypen ersetzen nicht die Abnahmekriterien.

**Sitzungsprotokolle:** [03.11. freigegeben; 10.11. Entwurf](README.md), Review weiterhin offen. Kein weiterer belegter Teamtermin im Index. Keine Inhalte oder Anwesenheiten ergänzt.

**Dokumentationsstand:** [PR #153](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/153) enthält diese Aktualisierung und wartet auf Review/Merge. [PR #156](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/156) ist eine separate offene Marktforschungsänderung. Historische Abschnitte unten sind ausdrücklich datierte Momentaufnahmen; die früheren Aussagen zu #134 als „offen“ sind überholt (seit 13.11. gemergt). **Projektboard:** Spalten über die verfügbare GitHub-Schnittstelle nicht verifizierbar, daher keine Board-Änderungen.

---

## Projektpflege · 13. November 2026, abends

**Neu seit der letzten Prüfung (nachweislich in `main` gemergt):**

| PR | Nachgewiesene Änderung / Grenze |
| :--- | :--- |
| [#142](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/142) | iOS 1.0.114: ARKit/LiDAR-gestützter Prototyp „Wo bin ich?“ mit **manueller Zweipunkt-Kalibrierung** und IFC-Raumindex. Keine belegte automatische D21-Raumerkennung ohne Kalibrierung. |
| [#143](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/143) | iOS 1.0.116: AR-Raumtafeln mit **ausdrücklich simulierten** Temperatur-, CO₂- und Feuchtewerten. Keine realen D21-Sensorwerte. |
| [#144](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/144) | iOS 1.0.117: LiDAR-/RoomPlan-Raumscan als IFC-Upload-Vorbereitung; Geräte- und Scanqualität müssen praktisch geprüft werden. |
| [#145](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/145) | iOS 1.0.119: Gebäudeanlage mit MapKit-Adresssuche und überarbeitetem Ablauf. |
| [#146](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/146) | iOS 1.0.120: Kartenboden, Schatten, Ausrichtung im 3D-Viewer und direkte Gebäudelöschung. |
| [#134](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/134) | **Emirs Web-Heatmap und IFC-/Geländedarstellung sind inzwischen gemergt.** Frühere Angaben „offen“ weiter unten sind historisch. |
| [#148](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/148) | Web-Datenschutzseite auf vorherigen Stand zurückgesetzt; formale Datenschutzfreigabe [#105](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/105) bleibt offen. |
| [#149](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/149) | Heatmap-3D-Absturz wegen fehlender DOM-Elemente behoben; laut PR 8 Viewer-Tests erfolgreich und iOS 1.0.124 auf Gerät installiert. |
| [#150](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/150) | iOS 1.0.125: serverseitige IFC-Hintergrundanalyse mit Schema-/IDS-Basisprüfung und Raumindex; IfcClash/IfcDiff **noch nicht automatisch ausgeführt**. |
| [#151](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/151) | IFC-Analysegrenze auf bis zu 500.000 Einträge angehoben; **drei synthetische Tests**, erneute Prüfung am realen Campusmodell nach Deployment noch ausstehend. |

**Prioritäten am Abend:** **P1 überfällig/ohne Abnahmenachweis:** [#74 – echter D21-Datenpunkt](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/74) (Frist 13.11., Issue offen), [#102 – D21-Sensorzugriff](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/102), [#105 – Datenschutzfreigaben](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/105), [#101 – Hochschul-KI-Infrastruktur](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/101). **P2:** [#73 – Revit/IFC-Serverprozess](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/73), reale Geräte-/Campusmodelltests nach #144/#150/#151 und Review des [Teamprotokollentwurfs 10.11.](README.md). **P3:** [#135 – akustische Zustandsüberwachung](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/135), [#136 – Spatial Intelligence](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/136); #142/#143 liefern Teilprototypen, erfüllen aber nicht alle Abnahmekriterien von #136 (insbesondere echte Sensor-Overlays).

**Protokolle:** [03.11. freigegeben, 10.11. Entwurf](README.md); keine neu belegten Teamtermine und keine erfundenen Anwesenheiten. [#99](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/issues/99) ist geschlossen. **Projektboard:** Spalten und Zuordnungen konnten über die verfügbare Schnittstelle nicht eigenständig geprüft oder geändert werden.

---
