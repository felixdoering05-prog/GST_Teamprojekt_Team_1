# Gebäudekarten, eigene Nachrichten löschen, ElevenLabs

03.11.2026. Grundlage ist der geprüfte Web-Stand aus PR #79 (Gebäudekarten). Im aktuellen `main` ist keine neue geografische Karte vorhanden. Die native App übernimmt Karten mit Gebäudename, Adresse und Zugriffskennzeichnung. Antippen öffnet ein Blatt mit Einstieg in Übersicht, Dashboard, 3D, Dateien, Geräte, Sprache, KI und Team. Keine erfundenen Standorte oder Kartenkoordinaten.

## Chat

Eigene Nachricht lange drücken → **Nachricht löschen** → bestätigen. Nur der Verfasser darf löschen; eine Eigentümer-/Mitgliedschaft am Gebäude allein erlaubt nicht das Löschen fremder Nachrichten. Die API prüft weiterhin den aktuellen Gebäudezugriff. `DELETE /api/v1/buildings/:id/messages/:messageId` ersetzt den Inhalt durch `Nachricht gelöscht` und setzt `deleted_at`. Anfrage-ID und Zeitpunkt bleiben bestehen: Wiederholungen alter Sendeaufrufe dürfen die Nachricht nicht wiederherstellen und gelöschte Zeilen bleiben Teil der Sendebegrenzung.

Neue Chat-Mitteilungen erhalten `message_id`; beim Löschen wird ihr Vorschautext ebenfalls ersetzt. Ältere Mitteilungen ohne Zuordnung werden nicht pauschal verändert. Bereits gelesene Kopien, vorhandene Serverbackups oder extern angefertigte Screenshots werden dadurch nicht entfernt.

Die App aktualisiert sichtbare/geöffnete Chats etwa alle zehn Sekunden, auch schon nachgeladene Nachrichten. Dafür unterstützt GET `messages?ids=1,2,...` maximal 500 IDs im zugänglichen Gebäude. Es werden bis zu 500 Nachrichten lokal dargestellt. Ohne Netzwerk kann ein zuvor geladener Text bis zur nächsten erfolgreichen Aktualisierung sichtbar sein. Die Chatansicht bietet keine Wiederherstellung gelöschter Inhalte.

## Sprachablauf

Gebäude → **Sprache**:

1. Bewusst starten und bis zu 30 Sekunden aufnehmen. Mikrofonberechtigung wird erst beim Start gefragt. Kein dauerhaftes Zuhören.
2. Vor Übertragung an ElevenLabs gesondert freigeben und **Aufnahme erkennen lassen** drücken. Die Transkription bleibt editierbar. Auch getippter Text ist möglich.
3. Für Simulation: z. B. **Schalte Deckenlicht ein** → Vorschau → bestätigen. Nur eindeutig benannte simulierte Lampen und Steckdosen dieses Gebäudes. Es wird weder echte Hardware geschaltet noch automatisch ein IFC-Raumlicht geändert.
4. Für Fragen: **Frage an Gemini vorbereiten** öffnet den bestehenden KI-Chat mit dem Text. Die Google-Freigabe bleibt separat. Modellbefehle werden weiterhin über den bestehenden IFC-Modus geprüft und bestätigt.
5. Antworten können über **Mit ElevenLabs vorlesen** nach sichtbarer Textvorschau und gesonderter Freigabe gesprochen werden. Maximal 1200 UTF-16-Zeichen; gekürzte Texte sind gekennzeichnet. Bereits geladene Audioantworten können ohne neue Anbieteranfrage erneut abgespielt werden.

Keine automatische Ausführung aus einer Erkennung oder KI-Antwort. Die Vorschau verändert keinen Zustand; erst der bestehende Geräte-PATCH mit aktueller Revision schaltet die Simulation. Mehrdeutige Namen, Negationen oder Mehrfachbefehle werden nicht als freie Werkzeuge ausgeführt. Keine Conversational-Agent-Werkzeuge, Türen, Heizung, Sicherheitsfunktionen oder echte Gebäudeautomation.

## Server und Datenschutz

- API-Key nur in `/etc/d21/voice/elevenlabs-api-key`, geschützt für Root; read-only Mount in den API-Container. Nie im iPhone-Bundle, Browser, Repository oder Chat.
- `.env`: `D21_VOICE_CONFIG_DIR=/etc/d21/voice`, `ELEVENLABS_ENABLED=true`, `ELEVENLABS_VOICE_ID=<freigegebene Stimme>`. Aktivieren erst nach erfolgreicher Anbieterprüfung.
- Neue App-Routen `GET .../voice`, `POST .../voice/transcribe`, `.../voice/speak`, `.../voice/intent`. Alle benötigen persönliche Anmeldung und aktuellen Gebäudezugriff. Provider-Aufrufe verlangen zusätzlich `X-D21-Voice-Consent: yes` und eine UUID in `X-Request-ID`.
- Aufnahmen werden als PCM-WAV (16 kHz, mono, 16 Bit) begrenzt auf 0,1–30 Sekunden und 1 MB serverseitig geprüft. Keine frei übergebenen Cloud-URLs oder Netzwerkziele. Native Aufnahme wird beim Verlassen verworfen und bei Hintergrundwechsel gestoppt. Es erfolgt kein automatischer Upload.
- ElevenLabs erhält die freigegebene Aufnahme oder den angezeigten Text. Laut Anbieter ist die Option ohne Anbieteraufbewahrung Enterprise vorbehalten; hier wird keine vollständige Löschung beim Anbieter versprochen. Verarbeitung richtet sich nach dessen Bedingungen.
- Der Projektserver speichert weder Audio noch Transkripte für diesen Dienst. `app_voice_usage` speichert nur Konto, Gebäudeverweis, Art, UUID, Zeitpunkt und Status. 20 angenommene Aufrufe je Konto/Art/rollierende 24 h, 100 projektweit, höchstens zwei aktuelle Verarbeitungen. Auch gescheiterte angenommene Aufrufe zählen. Das sind App-Limits, keine Kosten- oder Abrechnungsgarantie des Anbieters.
- Keine automatische Wiederholung bei unklarem Timeout. Dieselbe angenommene UUID wird mit 409 abgewiesen, weil keine Audioantworten auf dem Server gecacht werden. Eine neue Anbieteranfrage muss ausdrücklich neu vorbereitet werden.

Offizielle Grundlagen: [Spracherkennung](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [Sprachausgabe](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). Verwendet werden `scribe_v2` und `eleven_multilingual_v2`. API-Modelle und Anbieterkontingente sind gesondert zu prüfen.

## Validierung und Veröffentlichung

83 Backendtests und Debug-/Release-iPhone-Simulator-Build erfolgreich. Die sieben neuen Tests prüfen eigene Löschrechte, Benachrichtigungsvorschauen, Anfrage-Wiederholung, WAV-Dauer, Zustimmung, feste Providerziele, Vorschaubefehle, Anbieterlimit und Rechteentzug. Anbieterantworten sind in Unit-Tests simuliert. Zusätzlich wurden Sprachausgabe und Spracherkennung beim Anbieter mit einem neutralen synthetischen Testsatz erfolgreich geprüft. Sichtbare Bedienungsprüfung weiterhin offen.

Code nur über Branch/PR. Nach Datenbanksicherung Backend mit `d21-deploy`, Datenbankcontainer/Volume erhalten. Native App separat bauen/installieren. Bei eingeschränktem ElevenLabs-Key Speech-to-Text und Text-to-Speech freigeben; Voices-Lesezugriff ist nur für die automatische Stimmenauswahl erforderlich.
