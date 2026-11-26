# Ideen-Backlog

Nur belegte, deduplizierte Ideen aus den Berichten aufnehmen. Eine Empfehlung ist keine beschlossene Umsetzung.

| ID | Idee | Bereich | Entscheidung | Nutzen | Testaufwand | Lizenz | Bericht / Quelle | Umsetzung / Issue |
|---|---|---|---|---|---|---|---|---|

| RADAR-001 | IfcTester: Raumnamen per IDS prüfen | IFC-Qualität | Jetzt testen | Fehler vor Modellübernahme erkennen | 2–4 h geschätzt | LGPL laut Projektübersicht; Paket prüfen | [Erste Sichtung](berichte/2026-11-12-1339.md) | Noch keine Umsetzung beauftragt |
| RADAR-002 | SVG-Geschossvorschauen mit IfcConvert | Modellkarten | Beobachten | Leichtere Vorschau prüfen | ½ Tag geschätzt | Konkrete Binärlizenz ungeklärt | [Erste Sichtung](berichte/2026-11-12-1339.md) | Lizenz/Geschossfilterung zuerst klären |
| RADAR-003 | Fehlende Sensordaten von 0 °C unterscheiden | Sensorik und Heatmaps | Jetzt testen | Ausfälle sichtbar machen | 1 h geschätzt | Home Assistant Core Apache-2.0 | [Abendbericht](berichte/2026-11-12-1718.md) | Testvorschlag für #134 |
| RADAR-004 | IFC-Viewer bei Kachelausfall prüfen | BIM und Serverbetrieb | Jetzt testen | Vorführung bei Kartenstörung ermöglichen | 45 min geschätzt | OSM-Daten ODbL, separate Dienstregeln | [Bericht](berichte/2026-11-13-1700.md) | Web und PR #146 |
| RADAR-005 | IFC-Raum eines Mangels per BCF wiederfinden | BIM und iPhone | Jetzt testen | Eindeutige Übergabe an anderen Viewer prüfen | 2 h geschätzt | BCF-Werk CC BY-ND 4.0 | [Abendbericht](berichte/2026-11-15-2143.md) | Versuch zu #163 |
| RADAR-006 | Sichtbare Gebäudedaten bei gesperrtem iPhone prüfen | Widget und Datenschutz | Jetzt testen | Privatsphäre auf gemeinsam einsehbaren Displays | 30 min geschätzt | Apple-SDK | [Morgenbericht](berichte/2026-11-16-0901.md) | Test zu #171 |
| RADAR-007 | Raum- und Türzuordnung bei PDF-Seitendrehung prüfen | Grundriss zu IFC | Jetzt testen | Verdrehte Zuordnung erkennen | 1 h geschätzt | Bestehender Leser MIT | [Bericht](berichte/2026-11-16-1657.md) | Synthetischer Vergleich |
| RADAR-008 | Feuchtealarm bei Neustart und bestehender Überschreitung | Sensorik und Automationen | Jetzt testen | Doppelte oder ausbleibende Hinweise erkennen | 45 min geschätzt | Quellenlizenz ungeprüft, eigener Verhaltenstest | [Bericht](berichte/2026-11-18-0915.md) | Test zu #225 |
| RADAR-009 | Energiezähler nach Rücksetzung auswerten | Energie und Sensorik | Jetzt testen | Fehlende Verbrauchsanteile erkennen | 1 h geschätzt | Quellenlizenz ungeklärt, eigener Test | [Bericht](berichte/2026-11-18-1659.md) | Entscheidung zu Rücksetzungsmetadaten |

| RADAR-010 | Haupt- und Unterzähler getrennt ausweisen | Sensorik und SwiftUI | Jetzt testen | Doppelzählung und unklare Summen erkennen | 60–90 min plus 20 min VoiceOver, geschätzt | HA Core Apache-2.0; Apple-SDK proprietär; eigener Test | [Bericht](berichte/2026-11-23-0855.md) | Noch keine Umsetzung beauftragt |

| RADAR-011 | BIMCraft 0.12 vor Upgrade vergleichen | Plan zu IFC und BIM | Beobachten | Export- und Formatkompatibilität klären | 2–4 h geschätzt | MIT/Apache laut Repository; Binärumfang ungeprüft | [Bericht](berichte/2026-11-24-0901.md) | Keine Upgrade-Freigabe |

| RADAR-012 | Energiekacheln bei großer Schrift prüfen | SwiftUI/UX | Jetzt testen | Lesbare Werte, Einheiten und Zeiträume | 30–45 min geschätzt | Apple-SDK proprietär | [Bericht](berichte/2026-11-25-0903.md) | Keine Umsetzung beauftragt |

Entscheidungen sind Rechercheempfehlungen, keine verbindlich beauftragte Umsetzung.

Abgleich vom 13.11.2026, 09:11 Uhr: [SwiftUI und Sprachassistent](berichte/2026-11-13-0911.md), kein neuer Eintrag.

[14.11.2026 · Datensicherung beim Hochschulserverumzug](berichte/2026-11-14-0904.md): im Projektplan bereits berücksichtigt.

[17.11.2026 · Doppelte Sprachanfragen](berichte/2026-11-17-0915.md): Die serverseitige Prüfung ist bereits vorhanden.

[17.11.2026 abends · Lampenstatus](berichte/2026-11-17-1704.md): vorhandenen Adapter abgeglichen, kein neuer Eintrag.

[19.11.2026 09:04 · Eingeschränkter Quellenabgleich](berichte/2026-11-19-0904.md) – keine neue Empfehlung, vollständiger Projektabgleich offen.

[20.11.2026 · Verzögerter Quellenabgleich](berichte/2026-11-20-0902.md) – Fortsetzung des Abendlaufs, keine neue Empfehlung.

[23.11.2026 17:11 · APNs und Hochschulserver: keine neue Empfehlung](berichte/2026-11-23-1711.md).

[24.11.2026 17:00 · Wetter und Gebäude-KI: keine neue Empfehlung](berichte/2026-11-24-1700.md).

RADAR-003: [25.11.2026 · Ergänzender Null-/Nullwertvergleich in der Energie-Zählerliste](berichte/2026-11-25-0903.md), kein neuer Eintrag.

[25.11.2026 17:04 · Serverbetrieb und Auth: keine neue Empfehlung](berichte/2026-11-25-1704.md).

[26.11.2026 09:11 · IFC und Gebäude-KI: keine neue Empfehlung](berichte/2026-11-26-0911.md).
