# Zusammenarbeit im Team

[← Zur Startseite](README.md)

## Kleine, nachvollziehbare Änderungen

1. Aufgabe im Aufgabenplan oder als GitHub-Issue beschreiben.
2. Einen eigenen Branch anlegen, zum Beispiel `docs/projektziel` oder `ki/pilotversuch`.
3. Eine zusammenhängende Änderung bearbeiten und prüfen.
4. Einen Pull Request mit Ergebnis und Prüfnachweis öffnen.
5. Die Änderung vor dem Zusammenführen prüfen. Für von Felix beauftragte und erfolgreich geprüfte eigene KI-Änderungen gilt die dauerhafte Freigabe in [AGENTS.md](AGENTS.md): Codex und Claude dürfen den Pull Request ohne erneute Bestätigungsfrage zusammenführen und über den vorgesehenen Weg deployen. Für andere Änderungen bleibt die Gegenprüfung durch ein Teammitglied vorgesehen.

Das ist eine Arbeitsvereinbarung als Vorschlag; technische Branch-Schutzregeln sind noch nicht eingerichtet.

## Automatische Prüfungen (GitHub Actions)

Jeder Pull Request nach `main` und jeder Push auf `main` startet automatisch die Tests. Das Ergebnis steht im Pull Request unter „Checks“ oder per `gh pr checks <Nummer>`. Es gibt keinen Deploy-Schritt und keine Geheimnisse in den Workflows.

| Workflow | Job | Was läuft |
|---|---|---|
| [Backend](.github/workflows/backend.yml) | Node-Tests | `dashboard/backend`: `npm ci` + `npm test` (Node 22, Datenbank per PGlite im Speicher). Liegt `plan-extract/requirements.txt` vor, wird der Planextraktor installiert und der Ende-zu-Ende-Test mit `PLAN_PYTHON` ausgeführt. |
| [Backend](.github/workflows/backend.yml) | Python-Tests | Jeder Ordner unter `dashboard/backend` mit `requirements.txt` (z. B. `ifc-analysis`, `plan-extract`) bekommt eine eigene Python-3.12-Umgebung; danach `python -m unittest discover` im Ordner bzw. in `tests/`. |
| [iOS](.github/workflows/ios.yml) | IFC-Viewer | `ios/ifc-viewer`: `npm ci`, `npm test`, `node build.mjs` auf macOS. Danach muss `IFCAssets` in der App unverändert sein – wer den Viewer ändert, muss den Build mitcommitten. |
| [iOS](.github/workflows/ios.yml) | iOS-App | Simulator-Build der App mit Xcode 27.2 ohne Signatur (`CODE_SIGNING_ALLOWED=NO`), Runner-Image `xcode-27` (Vorschau-Image von GitHub, kann Wartezeiten haben). |

Nicht automatisch geprüft werden die Web-App `dashboard/base44-frontend` und die Swift-Prüfprogramme unter `ios/tests` und `ios/ifc-viewer/tests`.

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

## Projektorganisation pflegen

Sitzungen mit der [Protokollvorlage](docs/protokolle/VORLAGE.md) dokumentieren und im [Verzeichnis](docs/protokolle/README.md) verlinken. Den [Projektablauf](docs/projektablauf.md), die [Rollenvereinbarung](docs/verantwortlichkeiten.md) und [Leistungsnachweise](docs/leistungsnachweise.md) bei der Aufgabenbearbeitung mitführen. Ein Protokoll ist erst nach dokumentierter Gegenprüfung freigegeben.
