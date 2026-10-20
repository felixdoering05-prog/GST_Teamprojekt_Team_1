# Zusammenarbeit im Team

[← Zur Startseite](README.md)

## Kleine, nachvollziehbare Änderungen

1. Aufgabe im Aufgabenplan oder als GitHub-Issue beschreiben.
2. Einen eigenen Branch anlegen, zum Beispiel `docs/projektziel` oder `ki/pilotversuch`.
3. Eine zusammenhängende Änderung bearbeiten und prüfen.
4. Einen Pull Request mit Ergebnis und Prüfnachweis öffnen.
5. Ein anderes Teammitglied prüft die Änderung vor dem Zusammenführen.

Das ist eine Arbeitsvereinbarung als Vorschlag; technische Branch-Schutzregeln sind noch nicht eingerichtet.

## Dateien benennen

- Kurze, beschreibende Namen ohne Leerzeichen verwenden.
- Experimente: `EXP-001-kurzbeschreibung.md`
- Prompts: `PR-001-kurzbeschreibung.md`
- Datierte Protokolle: `JJJJ-MM-TT-teamtermin.md`
- Bestehende Experimente nicht nachträglich überschreiben, wenn sich Eingaben oder Versuchsbedingungen wesentlich ändern.

## Revit-Modelle und große Dateien

Revit-Dateien und große Austauschdateien werden durch die mitgelieferte `.gitignore` zunächst ausgeschlossen. Das Repository enthält stattdessen Angaben zur gemeinsamen Ablage und zum verwendeten Modellstand. Eine spätere Nutzung von Git LFS muss das Team separat einrichten.

- Modellablage und Revit-Version gemeinsam festlegen.
- In jedem Versuch den genauen Modellstand angeben.
- Modelländerungen koordinieren: Binärdateien lassen sich nicht wie Text zusammenführen.
- Exporte auf vertrauliche oder personenbezogene Informationen prüfen.

## KI-Ergebnisse prüfen

Für jeden Versuch Eingaben, vollständigen Prompt, Werkzeug bzw. Modell, Datum und Ausgabe dokumentieren. Fachliche Aussagen anhand einer geeigneten Referenz prüfen und Fehler sichtbar festhalten. Aufwand für Nachbearbeitung mitzählen.

Zugangsdaten gehören nicht ins Repository. Nur Daten verwenden, deren Nutzung und Weitergabe für das Projekt geklärt sind.

## Vor dem Review

- [ ] Änderung verständlich beschrieben
- [ ] Links und Dateipfade geprüft
- [ ] Fachliche Aussagen belegt oder als Annahme markiert
- [ ] Eingaben und Ergebnis reproduzierbar dokumentiert, soweit möglich
- [ ] Keine Zugangsdaten oder nicht freigegebenen Daten enthalten
