# Teams und Gebäudegruppen auf dem iPhone · 1.0.153

Die App verwendet die mit Lukas' PR #233 eingeführten Teams, Designs und Gebäudegruppen
sowie die bestehenden gebäudebezogenen Rollen und Zeitpläne aus PR #229. Die parallel
ergänzten Mitgliederlisten, organisatorischen Titel und optionalen Hintergründe aus PR #236
sind ebenfalls angebunden. Es entsteht
keine zweite lokale Rechteverwaltung; dieselben Serverdaten gelten für Web und iPhone.

## Wege in der App

- **Team → Teams:** Teams mit Name, Farbe, Logo und Anzahl sichtbarer Gebäude.
- **Team öffnen:** Gebäudegruppen und zugehörige Gebäude; Teamleitung kann Name,
  Farben und Logo bearbeiten sowie eigene Gebäude zuordnen.
- **Teammitglieder / Titel & Zuständigkeiten:** Jede Person einmal anzeigen; Teamleitung
  kann organisatorische Titel erstellen und bestätigten Mitgliedern zuweisen. Titel ändern keine Rechte.
- **Gruppe öffnen:** Gebäude der Gruppe und – mit passender Mitgliederverwaltung
  in jedem Gebäude – Gruppenbearbeitung und Rollenvergabe je Gebäude.
- **Gebäude öffnen → Team:** Mitglieder, Einladungen, individuelle Rollen,
  Gebäudeteamchat und Zeitplanung. Auch über das Gebäudemenü erreichbar.
- **Kontakte / Postfach:** Bisherige Kontakte, Kontaktanfragen, Gebäudeeinladungen
  und Mitteilungen bleiben erhalten.

Der Teamkontext der neuen Ansicht zeigt ausschließlich die vom Server für dieses Team
gelieferten Gebäude. Der persönliche Gebäudereiter bleibt die Gesamtübersicht aller
zugänglichen Gebäude; ein Teamfilter wird nicht unbemerkt auf andere Appbereiche übertragen.

## Rechte und Daten

Nur bestätigte Kontakte sind einladbar. Eigentümerrechte werden nicht überschrieben;
Management kann nur niedrigere Rollen und Personen verwalten. Rollenname, Funktionsrechte
und Rangfolge kann ausschließlich die Gebäudeeigentümerin bzw. der Gebäudeeigentümer ändern.
Der Gruppenauftrag zeigt eine Rolle pro Gebäude und verlangt eine Bestätigung, weil
vorhandene Einzelrollen ersetzt werden können. Neue Mitgliedschaften müssen angenommen werden.
Der Server prüft Zugriff, Kontakt, Rang und Zugehörigkeit bei jeder Änderung erneut.

Alle Daten und Logos werden über den vorhandenen kontogeschützten Account-Client geladen.
Logos werden nach bewusster Bildauswahl auf maximal 1024 Pixel verkleinert und ohne
ursprüngliche Bildmetadaten als JPEG (höchstens 2 MB) übertragen. Kein öffentlicher Logo-Link.
Bei abgelehntem Zugriff werden zuvor geladene Verwaltungsdaten und Aktionen verworfen.
Zeitpläne lassen sich gemäß `can_edit` ansehen, erstellen, bearbeiten oder nach Rückfrage löschen.
Zeitpunkte werden als ISO-Zeitpunkt gespeichert und in der jeweiligen iPhone-Zeitzone angezeigt.

## Prüfungen

- Gemeinsamer Serverstand: 259 Node-Tests erfolgreich, 2 optionale Extraktortests übersprungen.
- Web: Lint, 39 Viewer-Tests und Produktionsbuild erfolgreich.
- Native Datenverträge und Rollenanzeige: `ios/team-tests/TeamContractSmoke.swift`,
  einschließlich redigierter Rollen, Eigentümern, gleichrangigen Personen, Selbständerung,
  fehlenden Schreibrechten, Gruppen mit knappen Gebäudedaten und ISO-Datumsformaten.
- Der Vertragstest läuft im iOS-Workflow auf dem Xcode-Runner.
- Lokaler Simulator-Build ohne Signierungsänderung; lokale DEBUG-Vorschau mit
  `-D21WorkflowPreview -D21TeamsPreview`. Zusätzliche Vorschauargumente:
  `-D21TeamDetailPreview`, `-D21TeamGroupPreview`, `-D21BuildingTeamPreview`,
  `-D21TeamSchedulePreview`, `-D21TeamReadOnlyPreview`, `-D21TeamsErrorPreview`.
  Diese Daten und Einstiege sind ausschließlich in DEBUG enthalten und verwenden keine Netzwerkverbindung.

Die Installation auf einem echten iPhone ist separat erforderlich. Es wurden für diese
Änderung keine Signierungsprofile oder Apple-Berechtigungen verändert.
