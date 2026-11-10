# Externe TestFlight-Version 1.0.100 (100)

Stand: 10. November 2026. Bundle-ID `de.kitrifftgebaeude.d21team1`, Hochschul-Team `95A5TC5H7R`. Dies ist eine technische Vorbereitung, keine Zusicherung einer Apple-Freigabe, vollständigen Sicherheitsprüfung oder datenschutzrechtlichen Hochschulfreigabe.

## Bewusste Änderung für diese Testrunde

Felix hat eine erste externe Version **ohne Live-Sprache** gewählt. ElevenLabs, LiveKit und WebRTC sind aus den Xcode-Paketabhängigkeiten entfernt. Der bisherige Sprachcode bleibt hinter `canImport(ElevenLabs)` im Quellbestand für einen später gesondert geprüften Wiedereinbau; im Archiv fehlt er einschließlich Mikrofonfreigabe. Die Sprachansicht verweist auf den weiterhin funktionierenden Textassistenten. Der Projektserver und andere App-Versionen werden dadurch nicht ihrer Sprachfunktion beraubt.

Das Archiv verlinkt nur System-Frameworks. CryptoKit-/Security-Nutzung und HTTPS bleiben erhalten. `ITSAppUsesNonExemptEncryption=NO` gilt für diesen **geprüften SDK-freien Build**, nicht pauschal für ältere oder spätere Versionen mit Fremd-Verschlüsselungsbibliotheken. Die neue Version muss korrekt verarbeitet werden; die Verschlüsselungsantwort eines früheren Builds wird dadurch nicht rückwirkend geändert.

## Datenschutz und Benutzerkontrolle

- Datenschutzhinweise vor Anmeldung und im Profil, zusätzlich `/datenschutz.html` auf dem Webserver.
- Von Felix bestätigter Betreiber/Support: Felix Döring, `felix.doering@stud.h-da.de`.
- Privacy-Manifest mit den tatsächlich verwendeten UserDefaults und Gründen, Datenarten für Konten, Inhalte und Gebäudestandorte, ohne Werbetracking.
- Text-KI nur nach Konto-Freigabe; vollständige Planübertragung separat je Gebäude freizugeben. Hinweise unterscheiden die beiden Übertragungen. Keine Behauptung, dass Google-Zugriffe automatisch Hochschul-Datenschutzfreigaben erfüllen.
- Konto im Profil mit Passwort und zweiter ausdrücklicher Bestätigung löschbar. Aktive Datenbank: eigene Kontodaten, eigene Gebäude/Dateien, Kontakte, Nachrichten und verknüpfte Vorschauen werden entfernt; fremde Gebäude bleiben erhalten. Bereits an Anbieter gesendete Daten/historische Backups brauchen ggf. separate Löschanfragen.

## Gezielte Sicherheitskorrekturen

- Website-Zugang und Kontositzung sind an normalisierten HTTPS-Origin inklusive effektivem Port gebunden. Alte Einträge ohne Herkunft werden nicht übernommen. Bei Wechsel Zugangsdaten neu eingeben; Benutzer-/Gebäudedaten auf dem Server bleiben erhalten. Verzögerte Antworten werden anhand einer Verbindungsrevision abgewiesen.
- JSON- und Dateianfragen nutzen dieselbe Header-Grenze. Fremde Origins/Ports bekommen keine alten Authentifizierungsheader; Redirects bleiben gesperrt.
- Die alte anonyme `/api/buildings`-Schnittstelle antwortet nur noch 410. Legacy-Zeilen werden nicht gelöscht und keinem Benutzer automatisch zugeordnet. Die aktive `/api/v1`-App bleibt verfügbar.

## Prüfstand

138 Backend-Tests einschließlich eigener/anderer Konten, Passwortbestätigung, Sitzungswiderruf, Kontodaten-Kaskaden, fremder Gebäude und abgebrochener Passwortarbeit. Native CredentialScope-Prüfungen für Normalisierung und echte URLRequest-Header bestehen. Archiv mit Hochschul-Signierung erstellt, Paket-/Frameworkfreiheit, Datenschutzressourcen und Verschlüsselungsflag kontrolliert. Web-Build erfolgreich. Zusätzlich bestehen zehn Laufzeitprüfungen in einem neuen isolierten Simulator: echte Keychain-Migration, erfolgreiche Anmeldung, JSON-/Dateianfragen, fremder Server/Port, A→B→A mit verzögerter Login-Antwort und legitime Wiederherstellung derselben Server-Sitzung. Der temporäre Test-Harness wird nicht in Release aufgenommen. Der erste unsignierte Simulatorversuch konnte erwartungsgemäß nicht auf den Schlüsselbund zugreifen; die erfolgreiche Wiederholung verwendet Xcodes Simulator-Signierung.

## Upload und externe Tests

Export über `app-store-connect`, `destination=upload`, `testFlightInternalTestingOnly=false`. Kein „Internal Only“-Build. Nach Verarbeitung in App Store Connect den neuen Build auswählen. Für externe Tester benötigt Apple Testinformationen, einen erreichbaren Testserver und ggf. einen gesonderten Review-Zugang. Keine persönlichen Team-Konten oder privaten Hauspläne als Review-Beispiele weitergeben. Erst nach Beta-App-Review werden externe Einladungen möglich.

Die früheren weiteren Server-Sicherheitsbefunde (u.a. E-Mail-Besitznachweis, Proxy-Limits, IFC-Arbeitsgrenzen, Twin-Mengenoperationen und übrige Abhängigkeiten) sind **nicht vollständig Teil dieser Änderung**. Bestehende unfertige Änderungen im separaten Security-Arbeitszweig wurden nicht ungeprüft übernommen. Für eine breite öffentliche Nutzung müssen diese Punkte separat abgeschlossen werden. Im externen Test zunächst nur berechtigte Tester und nicht sensible Testdaten verwenden.
