# App-Design, Kontakte und Sprachchat – 12. November 2026

Kandidat 1.0.105 (105); 1.0.104 war der erste Designschritt. Rein gestalterische Überarbeitung von Startseite und Gebäude-Dashboard; keine Änderung an API, Rechten, Datenquellen oder Texten zu Datenschutz und Datenherkunft.

- Gemeinsame Kartenoberfläche (`d21Card`): gruppierter Hintergrund, kontinuierliche Ecken, im hellen Modus ein sehr leichter Schatten, im Dark Mode ohne Schatten.
- Übersichtskarte auf der Startseite: größere Gebäudezahl, Modelle und Mitteilungen als Chips mit korrektem Singular/Plural, deutlicher „Neu“-/„Fortsetzen“-Knopf, dezentes Gebäudesymbol im Hintergrund (für VoiceOver ausgeblendet).
- Gebäudekarte: etwas höhere Vorschau, Statusabzeichen als kleine Kapsel, Name/Adresse mit Öffnen-Hinweis rechts.
- Gebäude-Dashboard: „3D-Modell hinzufügen“ mit kurzer Erklärung; ruhiger Ladezustand als Karte; Werkzeugkarten kompakt (Symbol und Titel in einer Zeile), alle sechs Werkzeuge passen ohne Scrollen auf einen Bildschirm.
- Messwert-Diagramme: monotone Linienglättung (keine Überschwinger über reale Werte hinaus), dezente Fläche unter der Kurve, Punkt nur am letzten Messwert, Achse beschränkt auf den Bereich der geladenen Werte, Zeitachse als Uhrzeit. Es werden keine zusätzlichen Werte erzeugt; Sensorauswahl, Kennzeichnung fiktiver Vorschauwerte und der Hinweis „nicht unabhängig verifiziert“ bleiben unverändert.
- Gedrückt-Effekt der Karten respektiert weiterhin „Bewegung reduzieren“.

## Prüfstand

Simulator-Build (Debug) mit ausschließlich lokalen, synthetischen Vorschaudaten (`-D21WorkflowPreview`), visuell geprüft in hellem und dunklem Erscheinungsbild. Kein KI-Aufruf, keine Geräteschaltung, keine Serveranfrage für die Gestaltung.

Signierter Release-Build mit persönlicher Signierung nur als lokale Build-Überschreibung (Team 4Q7V2BW44C, Bundle-ID `de.felixdoering.kitrifftgebaeude`); die Hochschul-Konfiguration im Projekt bleibt unverändert. Version 1.0.104 (104) auf Felix' iPhone installiert. Kein TestFlight-Upload.

## Kontakte und Mitteilungen (1.0.105)

- Team → Kontakte: Kopfkarte mit Kontaktanzahl, offenen Anfragen und „Hinzufügen“; Anfragen als Karten mit Annehmen/Ablehnen; Kontaktliste mit farbigen Initialen (Farbe aus der Konto-ID, kein Profilbild nötig), Optionsmenü zum Entfernen mit unveränderter Rückfrage; Suche ab sechs Kontakten.
- „Kontakt hinzufügen“ als eigenes Blatt mit E-Mail-Feld. Server-Endpunkte, Bestätigungspflicht und Hinweis, dass eine Anfrage keinen Gebäudezugriff freigibt, bleiben unverändert.
- Mitteilungen: farbige Symbolkacheln je Art (Chat, Datei, Planentwurf, Einladung, Kontakt).

## Sprachchat ohne Fremd-SDK (1.0.105)

Die frühere Live-Sprache (ElevenLabs-/LiveKit-/WebRTC-SDK) bleibt entfernt. Neu ist ein TestFlight-tauglicher Sprachchat nur mit Apple-Frameworks:

1. Tippen startet die Aufnahme (AVAudioEngine), erneutes Tippen sendet; automatischer Stopp nach 30 Sekunden.
2. Die Aufnahme wird im Arbeitsspeicher als PCM-WAV (16 kHz, mono, 16 Bit) erzeugt, nie auf dem Gerät gespeichert, und per HTTPS an `/voice/transcribe` gesendet.
3. Der erkannte Text geht über den bestehenden Gebäude-Assistenten (`chat: true`, gleiche KI-Freigabe und Kontextprüfung) und erscheint auch im KI-Chat.
4. Optional („Antworten vorlesen“) liest `/voice/speak` die Antwort vor (höchstens 1200 Zeichen).

Vor der ersten Aufnahme erklärt ein Blatt den Datenfluss (Projektserver, ElevenLabs serverseitig, Google Gemini, Kontingent). Ohne KI-Freigabe oder ohne eingerichteten Sprachdienst auf dem Server erscheint ein Hinweis statt des Mikrofons. Verlassen der Ansicht oder App-Wechsel bricht Aufnahme, Anfragen und Wiedergabe sofort ab; kein Hintergrund-Audio.

Animation: Größe und Wellen der Kugel folgen dem echten Mikrofon- bzw. Wiedergabepegel. Während auf den Server gewartet wird, zeigt sie nur einen neutralen drehenden Ring – kein vorgetäuschtes Sprechen oder Streaming. Bei „Bewegung reduzieren“ bleibt sie statisch.

Einstieg: Karte „Mit deinem Gebäude sprechen“ im Gebäude-Dashboard und Wellen-Symbol oben im KI-Bereich.

## TestFlight, Datenschutz und Verschlüsselung

- `NSMicrophoneUsageDescription` ergänzt (Pflicht für Mikrofonzugriff).
- Privacy-Manifest: Datentyp Audiodaten (mit Konto verknüpft, App-Funktion, kein Tracking).
- Datenschutzhinweis in der App: Abschnitt „Keine Live-Sprache in Build 100“ durch „Sprachchat (ab Version 1.0.104)“ ersetzt. **Die Server-Seite `/datenschutz.html` muss Felix entsprechend anpassen.**
- Verschlüsselung: Die App nutzt weiterhin nur HTTPS über URLSession und Systemkryptografie; keine eingebetteten Fremd-Frameworks (geprüft mit `otool -L` und Bundle-Inhalt). `ITSAppUsesNonExemptEncryption = NO` bleibt für diesen Build zutreffend.
- Für die App-Store-Connect-Angaben (App-Datenschutz) zusätzlich „Audiodaten – App-Funktionalität – mit Identität verknüpft – kein Tracking“ eintragen.

## Prüfstand 1.0.105

Simulator-Build mit lokalen Vorschaudaten: Kontakte, Kontakt-Blatt, Sprachchat-Ansicht (KI aus / Dienst nicht verfügbar) und Datenfluss-Erklärung geprüft. Der WAV-Encoder wurde gegen den Server-Validator `wavDuration` getestet (akzeptiert). Signierter Release-Build (persönliche Signierung nur als lokale Überschreibung) als 1.0.105 (105) auf Felix' iPhone installiert und gestartet. Eine echte Sprachanfrage gegen den Projektserver wurde nicht ausgeführt (keine beiläufigen produktiven KI-/Sprachaufrufe); sie muss auf dem Gerät mit aktivierter KI-Freigabe geprüft werden.
