# Revit-Rekonstruktion: EG-Arbeitsstand 29.10.2026

**Tatsächlich erzeugt: neue lokale RVT und IFC4 mit 50 nativen Wänden und 28 geschlossenen Räumen. Der Arbeitsstand ist unvollständig und fachlich nicht abgenommen.**

## Ergebnis

Der erste Teilprototyp umfasste drei Räume; ihre Flächen weichen jeweils weniger als 0,002 m² vom Planstempel ab. Nach dieser Kontrolle wurden weitere EG-Wandkonturen und Räume ergänzt. Der gespeicherte EG-Arbeitsstand enthält 50 native Wände und 28 Räume mit Originalnummern/-namen.

Bei 11 Räumen liegt die Flächendifferenz innerhalb des technischen Prüfwerts von 0,03 m². Bei 17 bestehen Abweichungen, teilweise deutlich, besonders in Flur-, Treppen- und Sanitärbereichen. Nischen, Stützen und Raumunterteilungen sind noch nicht vollständig rekonstruiert. Die Abweichungen stehen lokal je Raum im Prüfbericht und in Revit-Raumkommentaren. Eine native Raumliste und ein deutlicher Hinweistext sind im RVT gespeichert. Fünf Planräume fehlen: vier wurden noch nicht bearbeitet, ein weiterer Beschriftungspunkt konnte nicht als gültiger geschlossener Raum übernommen werden.

**Noch nicht modelliert:** Türen, Fenster, Geschossdecken, Dach, Anbauten und weitere Geschosse. Die Wände haben noch keine eingesetzten Öffnungen. Dies ist weder ein vollständiges Geschoss noch ein freigegebenes Lichtsimulationsmodell. Die offenen Konturfehler werden nicht auf weitere Geschosse fortgeschrieben.

## Freigaben und Annahmen

- Der Auftraggeber hat die Kombination der Planstände und die grafische Ableitung fehlender Zwischenhöhen aus den Nord-/Südansichten ausdrücklich erlaubt.
- Die aktuelle EG-Raumobergrenze von 3,80 m ist aus dem Fassadenraster grafisch abgeleitet und im Modell ausdrücklich vorläufig gekennzeichnet. Sie ist keine bestätigte OKFF des nächsten Geschosses und keine gesicherte lichte Raumhöhe. Deckenunterkanten und Bauteilstärken bleiben offen.
- Wandtypen bilden nur die belegte geometrische Gesamtdicke ab und heißen ausdrücklich „Aufbau unbekannt“. Materialien und physische Schichtfolgen werden nicht behauptet.
- 0,03 m² ist ein technischer Prüfwert dieses Versuchs, keine vereinbarte Bautoleranz. Planstempel werden nicht durch willkürliches Verschieben passend gemacht.
- Die Freigabe zur Kombination der Pläne und grafischen Höhenermittlung ist keine Uploadfreigabe. Baupläne und Modelle bleiben lokal.

## Quellen und Ausführung

Sechs lokale PDFs wurden gefunden, gerendert und visuell geprüft: UG, EG, 1.–3. OG und Nord-/Südansicht. EG/1. OG: Ausführungsplanung vom 20.11.2025, 1:50; B-Grundrisse: 26.02.2025, 1:100; B-04: 1:100. Quellenhashes, Prüfbilder und detaillierte Raum-/Maßtranskriptionen bleiben lokal. Die Originaldateien wurden nicht verändert. Ein älterer, nicht zu diesen Quellen gehörender Hausmodellversuch wurde nicht übernommen.

Die PDFs enthalten Vektordaten. Raumstempel und Wandkanten wurden lokal aus den Inhaltsströmen gelesen und mit bemaßten Raumbreiten kontrolliert. Eine vollständige Transkription aller Maßketten und Bauteile steht aus.

Revit 2027.3, Build 27.3.0.28, Deutsch, antwortet über MCP. Über die Revit-Oberfläche wurde ein separates Projekt aus der installierten Architekturvorlage erstellt; das vorher ungespeicherte „Projekt2“ wurde nicht verändert. Vorlagenebenen sind keine bestätigten Gebäudehöhen; das EG und seine vorläufige Raumobergrenze haben eigene GST-Ebenen.

Die native Modellierung, SaveAs, Raumprüfung und IFC-Ausgabe wurden mit selbst verfasstem C#-Code aus dem vorhandenen Dynamo/PythonNet3 ausgeführt. Ein zusätzliches Add-in oder Revit-Neustart war nicht erforderlich. Die allgemeinen ExternalCommands bleiben als alternativer Ausführungsweg vorbereitet.

## Dateien und Prüfnachweise

| Stand | Lokale Dateien | Tatsächliche Prüfung |
| --- | --- | --- |
| Dreiraum-Teilprototyp | `GST-EG-Teilprototyp.rvt`, `.ifc`, `pruefung.json`, `ifc-pruefung.json` | Native Wände/Räume; Flächenabgleich; positive Raumkörper; RVT-Prüfkopie geöffnet; drei IFC-Raumkörper analytisch gegen Revit geprüft |
| EG-Arbeitsstand | `GST-EG-Arbeitsstand.rvt`, `.ifc`, `pruefung.json`, `ifc-pruefung.json`, `raum-flaechenpruefung.csv` | 50 native Wände, 28 Räume; RVT-Prüfkopie geöffnet und Raumzahl abgeglichen; positive Raumkörper; IFC-Geometrieprüfung bestanden; 17 Planflächenabweichungen offen |

Beide Stände liegen in getrennten, zeitgestempelten lokalen Ordnern außerhalb des Repositorys. Kein früherer Modellstand wurde überschrieben. Nach Ergänzung von Hinweistext und Raumliste wurde das aktuelle RVT erneut gespeichert; Revit meldet `isModified=false`. Die zuletzt hinzugefügten Hinweise und die Bauteilliste verändern die exportierte Modellgeometrie nicht.

Der [unabhängige IFC-Prüfer](revit-api-workflow/check-ifc-spaces.mjs) hat alle 28 `IfcSpace`-Instanzen dieses Exports geprüft: eindeutige GlobalIds, Geschosszuordnung, zugewiesene Body-Geometrie, Meter als Längeneinheit, positive vertikale Extrusionskörper und Flächen-/Volumenübereinstimmung mit dem Revit-Bericht. Rechteck- und geschlossene Polygonprofile werden analytisch ausgewertet. Nicht unterstützte Geometrie führt zum Fehler. Dies ist kein universeller IFC-Validator; technische Übereinstimmung zwischen RVT und IFC beweist keine fachlich korrekte Planrekonstruktion. Der Ziel-App-Test steht aus.

## Technische Befunde

Die angebotenen MCP-Befehle haben keine eigenen Werkzeuge für neues Dokument, SaveAs und IFC-Export. Diese Lücken wurden über Dynamo/Revit-API geschlossen. Die Dateidialoge reagierten teilweise verzögert; erfolgreiche Aktionen wurden über Dokumentabfragen und vorhandene Dateien kontrolliert.

Ein erster Modellierungslauf scheiterte an einem schreibgeschützten Raumparameter und wurde zurückgerollt. Die Raumhöhe wird nun über obere Ebene und oberen Versatz gesteuert. Beim folgenden erfolgreichen Modell-/Exportlauf war ein anschließender Ansichtwechsel während der Dynamo-Auswertung unzulässig; Dateien und Prüfberichte waren bereits geschrieben. Die Ansicht wurde danach per Connector geöffnet. Der Quellcode enthält diesen unzulässigen Ansichtwechsel nicht mehr.

Der abschließende Review-Build gegen die installierte Revit-API 2027 und .NET SDK 10.0.402 ist mit **0 Warnungen und 0 Fehlern** durchgelaufen. Ein Zwischenbuild unter geändertem Assemblynamen hatte eine Dateisperr-Warnung für eine ältere, noch geladene DLL; der abschließende Build nutzt einen getrennten Ausgabeordner.

## Fortsetzung und fachliche Lücken

1. Die 17 abweichenden Konturen anhand der Nischen, Stützen, Sanitärbereiche und Treppen-/Flurzusammenhänge korrigieren; unterschiedliche Flächendefinitionen gegebenenfalls belegen. Die fünf fehlenden Planräume korrekt platzieren und begrenzen.
2. Türen/Fenster mit belegten Öffnungsmaßen ergänzen. Unbekannte Innen-Türhöhen nicht durch eine erfundene Normhöhe ersetzen. Deckenstärken, lichte Höhen und Dachaufbau sind durch die Erlaubnis zur grafischen Zwischenhöhenableitung nicht festgelegt.
3. Nach bestandenem EG-Planabgleich weitere ausreichend dokumentierte Geschosse und Dach ergänzen. Keine pauschale Geometrie- oder Höhenkopie.
4. Vollständigen Stand erneut speichern, wieder öffnen, exportieren und in der Ziel-App prüfen. Erst danach fachliche Freigabe für die Lichtsimulation.

## Repository

Arbeitsbranch `revit/planpruefung-api-workflow-2026-10-29`, [Entwurfs-PR #43](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/43). Der vollständige Repositorybaum des Ausgangsstands wurde auf `AGENTS.md` geprüft; keine solche Datei war enthalten. `CONTRIBUTING.md` und PR-Vorlage wurden berücksichtigt. Der lokale Git-Transport war nicht erreichbar; Änderungen erfolgen über den GitHub-Connector.

Der PR enthält ausschließlich allgemeine Dokumentation und selbst verfassten, datengetrennten Workflow-Code. Eingabe-JSONs, Dynamo-Dateien mit Modellpfaden, Quellenbilder, DLLs, RVTs, IFCs und detaillierte Raumprüfberichte werden nicht hochgeladen. Keine automatische Zusammenführung; fachlicher Review steht aus.
