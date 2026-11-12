# TestFlight-Version 1.0.112 (112)

Stand: 12. November 2026. Bundle-ID `de.kitrifftgebaeude.d21team1`, Hochschul-Team `95A5TC5H7R`. Technische Vorbereitung, keine Zusicherung einer Apple-Freigabe oder datenschutzrechtlichen Hochschulfreigabe.

## Inhalt gegenüber 1.0.100

- Überarbeitetes Design (Startseite, Gebäude-Dashboard, Diagramme), Kontakte, Team-Chat und Gerätesteuerung
- **Sprachgespräch** mit dem „sprechenden Gebäude“ in Echtzeit (ElevenLabs-Agent per signierter WebSocket-Verbindung) und Fallback „Tippen statt Gespräch“
- Neues App-Icon mit der Gebäude-Figur

## Geprüft vor dem Upload

- Archiv mit Hochschul-Konfiguration aus dem Repository (keine persönliche Signierung)
- `ITSAppUsesNonExemptEncryption = NO`: nur HTTPS/TLS über URLSession und Systemkryptografie, keine eingebetteten Frameworks (Bundle und `otool -L` geprüft)
- `NSMicrophoneUsageDescription` vorhanden, Privacy-Manifest mit Audiodaten, aktueller Datenschutzhinweis im Bundle
- Upload über `xcodebuild -exportArchive` mit `app-store-connect`/`upload`, nicht „Internal Only“

## In App Store Connect von Felix zu erledigen

### 1. App-Datenschutz (App → App-Datenschutz → Bearbeiten)

Zusätzlich zu den bisherigen Angaben (Kontaktinfos, Nutzerkennung, Fotos, sonstige Inhalte, genauer Standort):

| Datentyp | Zweck | Mit Identität verknüpft | Tracking |
|---|---|---|---|
| **Audiodaten** (Benutzerinhalte → Audiodaten) | App-Funktionalität | Ja | Nein |

Danach „Veröffentlichen“, damit die Angabe gilt.

### 2. Exportkonformität

Mit `ITSAppUsesNonExemptEncryption = NO` im Build sollte App Store Connect nicht erneut fragen. Falls doch: Die App nutzt ausschließlich die vom Betriebssystem bereitgestellte Standardverschlüsselung (HTTPS/TLS).

### 3. TestFlight → Build 112 → Testinformationen („Was zu testen ist“)

> Neu: Sprachgespräch mit deinem Gebäude. Öffne ein Gebäude, tippe auf „Mit deinem Gebäude sprechen“ und dann auf die Gebäude-Figur. Voraussetzung: KI-Freigabe im Profil. Außerdem neu gestaltet: Startseite, Team-Chat, Kontakte und Gerätesteuerung. Bitte keine vertraulichen Gebäude- oder Personendaten verwenden.

### 4. Beta-App-Review

Für externe Tester braucht der neue Build eine Beta-App-Review. Im Prüfhinweis erwähnen, dass das Sprachgespräch eine KI-Freigabe im Profil voraussetzt und ein Testkonto ohne private Gebäudedaten verwendet werden soll. Keine persönlichen Team-Konten oder privaten Hauspläne als Review-Zugang weitergeben.

## Offene Grenzen

- Externe Freigabe durch Apple ist nicht bestätigt.
- Frühere Sicherheitsbefunde sind nicht vollständig behoben; keine Produktionsreife oder Datenschutzfreigabe behaupten.
- Die öffentliche Seite `/datenschutz.html` ist erst nach Merge von PR #131 und einem Deployment aktuell.
