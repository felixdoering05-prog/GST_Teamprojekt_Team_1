# iPhone-Karten, Chatlöschung und ElevenLabs

03.11.2026 · Felix beauftragt die Übernahme von Emirs Gebäudekarten, löschbare Nachrichten und einen Sprachassistenten mit ElevenLabs-API. Der aktuelle GitHub-Stand enthält Gebäudekarten, keine neue geografische Karte.

Umgesetzt: Gebäudekarten mit aufklappbarer Schnellwahl; eigene Chattexte nach Bestätigung löschen und neue Mitteilungsvorschauen ersetzen; Aufnahme, Freigabe, ElevenLabs-Transkription, Textprüfung, Vorschau/Bestätigung für Gerätesimulationen, Übergabe an Gemini und bewusst freigegebene Sprachausgabe. Keine echte Hardwareanbindung und keine unbestätigte Modellaktion.

Validierung: 83 Backendtests sowie Debug-/Release-Simulator-Build erfolgreich. Sichtbare Bedienungsprüfung offen. API-Key wird vom Nutzer über einen separaten lokalen Helfer geschützt auf dem Server hinterlegt. Anbieterprüfung und Live-Aktivierung werden getrennt bewertet; Tests mit simuliertem Anbieter sind kein Nachweis einer funktionierenden Live-Stimme.

[Bedienung, Datenschutz, API und Grenzen](../iphone-karten-chat-sprache.md).

Live-Anbieterprüfung: Vollständiger Key mit Speech-to-Text/Text-to-Speech funktioniert. Stimmenliste ist wegen eingeschränkter Rechte nicht lesbar; die offizielle Standardstimme (Roger) wurde direkt erfolgreich geprüft. Ein neutraler Testsatz wurde synthetisch gesprochen und durch Scribe wieder erkannt (beide HTTP 200). Keine echte Nutzeraufnahme oder Gebäudedaten hierfür versandt.
