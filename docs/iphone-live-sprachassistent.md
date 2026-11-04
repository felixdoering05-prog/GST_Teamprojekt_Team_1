# Kontoweite KI-Einstellung und Live-Sprachassistent

Stand: 04.11.2026. Technischer Arbeitsnachweis; kein Team-Sitzungsprotokoll.

## Bedienung

Unter **Profil → KI-Einstellungen** einmal „KI und Sprachassistent“ aktivieren. Dieselbe Kontoeinstellung steht im Web unter **Daten & Einstellungen**. Standardmäßig bleibt sie aus; bestehende Konten werden nicht automatisch freigeschaltet. Die Einstellung wird in PostgreSQL gespeichert, gilt geräteübergreifend und ersetzt die einzelnen Übertragungshaken bei Text-KI, Messwertanalyse und Sprache. Anbieter und übertragene Daten werden dort erklärt. Modell- und Geräteänderungen benötigen weiterhin eine ausdrückliche Bestätigung.

Im Gebäude den Bereich **Sprache** öffnen und **Gespräch starten** wählen. Nach der iOS-Mikrofonfreigabe entsteht eine echte ElevenLabs-Agents-Verbindung über das offizielle Swift-SDK 3.4.0 und WebRTC: sprechen, direkt gesprochene Antworten erhalten und Antworten unterbrechen. Ein optionaler aufklappbarer Verlauf zeigt die aktuelle Unterhaltung im Arbeitsspeicher. Die bisherigen Aufnahme-erkennen-Prüfen-Weiterleiten- und Vorleseansichten wurden entfernt; alte Serverendpunkte bleiben für installierte ältere App-Versionen geschützt verfügbar.

Die SwiftUI-Wellengeometrie ist aus [SpeechWaveAnimation](https://github.com/mvolpato/SpeechWaveAnimation) (MIT, Michele Volpato) angepasst. Zuhören folgt dem VAD-Wert des SDK; die Sprechbewegung ist eine Zustandsanimation und kein Lautstärkemesser. „Bewegung reduzieren“ hält sie ruhig. Lizenzen von Animation, ElevenLabs, LiveKit und WebRTC stehen gebündelt in `ThirdPartyNotices.txt` und sind in den KI-Einstellungen lesbar. Direkte SDK-Version und transitive Auflösungen stehen in `Package.resolved`.

## Berechtigungen und Daten

- `GET/PATCH /api/v1/profile/ai`: nur das eigene angemeldete Konto; aktivierte Richtlinienversion 1, Änderung mit Revision und Konfliktprüfung. Keine clientseitig wählbare Nutzer-ID.
- Text-KI, Modellsprache, Messwertanalyse und alte Audioendpunkte prüfen die kontoweite Einstellung serverseitig. Gemini erhält weiterhin nur den jeweils begrenzten Kontext; keine automatische Übertragung ganzer Dateien oder IFC-Geometrie. Kontext-Hashes, Kontingente und Gebäudezugang bleiben verbindlich.
- `POST /api/v1/buildings/:id/voice/live`: leere Anfrage, neue UUID, aktivierte Einstellung und eigener/angenommener Gebäudezugang. Liefert eine flüchtige Gesprächsberechtigung; **nie den ElevenLabs-API-Key**. Keine automatische Wiederholung.
- Sprachkontext: Gebäudename, bis zu 50 simulierte Lampen/Steckdosen mit Namen und Zustand, bis zu zehn aktuelle Dateinamen mit Typ. Keine Adresse, E-Mails, Kontakte, Teamnachrichten, Dateiinhalte, Sensormessungen oder Geometrie.
- Live-Audio läuft vom iPhone zu ElevenLabs/LiveKit. Die Stimme nutzt das im ElevenLabs-Agenten konfigurierte Gemini-Modell; dessen Nutzung wird über ElevenLabs abgerechnet, nicht über den separaten Projekt-Gemini-Key. Kein eigenes Modelltraining.
- Ein eigener **privater** ElevenLabs-Agent ist eingerichtet; vorhandene andere Agenten werden nicht geändert. Agentenkonfiguration ohne Geheimnisse: `dashboard/ops/voice/live-agent.json`. Authentifizierung aktiv, keine Audioaufzeichnung, Anbieter-Verlauf ein Tag Aufbewahrung. Anbieterbedingungen und mögliche andere rechtliche Aufbewahrungen bleiben maßgeblich.

## Grenzen und Lebenszyklus

Maximal 120 Sekunden pro Gespräch (zusätzlich anbieterfest konfiguriert), zehn angenommene Live-Starts pro Konto und rollierenden 24 Stunden, 100 Sprachanfragen im Projekt, zwei gleichzeitige Vorgänge, höchstens ein Live-Gespräch je Konto. Fehlgeschlagene angenommene Starts zählen mit. Diese App-Grenzen ersetzen keine Anbieterabrechnung oder Anbieterlimits.

Ansicht verlassen, App inaktiv, Sperren, Logout, lokales Deaktivieren, Verbindungsfehler oder Zeitablauf beenden die Audioverbindung. Abgebrochene Mikrofonfreigaben oder verspätete Verbindungen öffnen das Mikrofon nicht neu. Die App prüft die Server-Sitzung etwa alle fünf Sekunden; bei Fehler wird geschlossen. Abschalten auf einem anderen Gerät sperrt neue Anfragen sofort, die laufende App beendet bei der nächsten Prüfung. Das ist **kein sofortiger serverseitiger Entzug bereits ausgestellter Anbieter-Tokens** und kann keine bereits übertragenen Daten zurückholen. Der Anbieter begrenzt jedes Gespräch unabhängig auf 120 Sekunden. Nur bewusster Neustart; kein Hintergrundmikrofon und kein automatischer Neuaufbau.

Der Client-Toolaufruf `request_device_change` stellt lediglich einen Vorschlag. Exakter Gerätename, Simulationstyp und Berechtigung werden vom Projektserver geprüft. Die App zeigt eine zeitlich begrenzte Bestätigung; erst danach folgen die Geräteänderung mit Revision und das Erfolgsergebnis an den Sprachagenten. Bei Ablehnung oder Fehler meldet die App keinen Erfolg. Echte Hardware, Heizungen, Türen und Sicherheitstechnik sind nicht angebunden.

## Betrieb

`ELEVENLABS_AGENT_ID` in der geschützten Server-`.env` setzen; Compose reicht es an die API weiter. `ELEVENLABS_ENABLED=true` und der schreibgeschützte Key-Mount bleiben erforderlich. Der Key benötigt Agents-Lese- und Schreibrechte zum Einrichten; zur Laufzeit die Conversation-Rechte. Key niemals ins Repository oder die App. Änderungen über Branch → Pull Request → `main`, Deployment ausschließlich mit `d21-deploy`. Neue Tabellen sind additiv: `app_ai_preferences`, `app_live_voice_sessions`; bestehende Daten bleiben erhalten.

## Nachweise und offene Prüfung

- Backend: bestehende 83 Tests und sechs neue Tests für Standard-Aus, Kontotrennung, Richtlinie/Revision, fehlenden Gebäudezugang, UUID-Wiederholungen, Ablauf/Widerruf, Anbieterfehler und dauerhafte Kontingente erfolgreich.
- Debug-Simulator-Build inklusive SDK und Web-Produktionsbuild erfolgreich.
- Echter neutraler Anbieter-Test: privater Agent und WebRTC-Token geprüft, drei Agentenantworten und sieben Audioereignisse empfangen; Geräte-Client-Tool ausgelöst und bewusst als abgebrochen beantwortet. Keine echten Projektdateien, Kontaktdaten oder Nutzerstimmen dafür übertragen.
- Sichtbarer vollständiger iPhone-Test mit echtem Mikrofon, Unterbrechen, großer Schrift und Sperren bleibt offen. Felix wünscht die Installation später; keine aktuelle Installation behaupten.
