# App-Design auffrischen – 12. November 2026

Kandidat 1.0.104 (104). Rein gestalterische Überarbeitung von Startseite und Gebäude-Dashboard; keine Änderung an API, Rechten, Datenquellen oder Texten zu Datenschutz und Datenherkunft.

- Gemeinsame Kartenoberfläche (`d21Card`): gruppierter Hintergrund, kontinuierliche Ecken, im hellen Modus ein sehr leichter Schatten, im Dark Mode ohne Schatten.
- Übersichtskarte auf der Startseite: größere Gebäudezahl, Modelle und Mitteilungen als Chips mit korrektem Singular/Plural, deutlicher „Neu“-/„Fortsetzen“-Knopf, dezentes Gebäudesymbol im Hintergrund (für VoiceOver ausgeblendet).
- Gebäudekarte: etwas höhere Vorschau, Statusabzeichen als kleine Kapsel, Name/Adresse mit Öffnen-Hinweis rechts.
- Gebäude-Dashboard: „3D-Modell hinzufügen“ mit kurzer Erklärung; ruhiger Ladezustand als Karte; Werkzeugkarten kompakt (Symbol und Titel in einer Zeile), alle sechs Werkzeuge passen ohne Scrollen auf einen Bildschirm.
- Messwert-Diagramme: monotone Linienglättung (keine Überschwinger über reale Werte hinaus), dezente Fläche unter der Kurve, Punkt nur am letzten Messwert, Achse beschränkt auf den Bereich der geladenen Werte, Zeitachse als Uhrzeit. Es werden keine zusätzlichen Werte erzeugt; Sensorauswahl, Kennzeichnung fiktiver Vorschauwerte und der Hinweis „nicht unabhängig verifiziert“ bleiben unverändert.
- Gedrückt-Effekt der Karten respektiert weiterhin „Bewegung reduzieren“.

## Prüfstand

Simulator-Build (Debug) mit ausschließlich lokalen, synthetischen Vorschaudaten (`-D21WorkflowPreview`), visuell geprüft in hellem und dunklem Erscheinungsbild. Kein KI-Aufruf, keine Geräteschaltung, keine Serveranfrage für die Gestaltung.

Signierter Release-Build mit persönlicher Signierung nur als lokale Build-Überschreibung (Team 4Q7V2BW44C, Bundle-ID `de.felixdoering.kitrifftgebaeude`); die Hochschul-Konfiguration im Projekt bleibt unverändert. Version 1.0.104 (104) auf Felix' iPhone installiert. Kein TestFlight-Upload.
