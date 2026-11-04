# App: echte Daten und Lampenassistent

Stand 04.11.2026, App 1.0.89 (89).

Die App startet bei den Gebäuden. Geräte werden innerhalb eines Gebäudes verbunden und einem Raum zugeordnet. Der eigene Geräte-Tab entfällt. Kontakte und Mitteilungen liegen gemeinsam unter Team. Gebäudekarten rendern eine Vorschau des tatsächlich hinterlegten IFC-Modells: dunkelblau im hellen Modus, hellblau im dunklen Modus. Ohne IFC gibt es einen ehrlichen Leerzustand. Private Vorschauen bleiben lokal im begrenzten Arbeitsspeicher-Cache.

Fiktive Daten erscheinen ausschließlich im Vorstellungsmodus unter Profil → Darstellung. Der Modus ist standardmäßig aus; die kontobezogene Einstellung liegt auf dem Server. Die Vorstellung verwendet lokale fiktive Werte, keine Hardware und keine KI-Anfragen. Simulationsgeräte werden in der normalen Geräteliste nicht angezeigt.

## Einmalige Freigabe

Profil → KI-Einstellungen aktiviert KI, Sprache und ausdrücklich verbundene Lampen für das eigene Konto. Alte KI-Freigaben erhalten nicht automatisch Hardwarezugriff: `device_control_enabled` ist standardmäßig false. Die Einstellung ist versioniert; konkurrierende Änderungen werden abgewiesen. Ausschalten sperrt neue Aufträge. Zugriff auf Lampen bleibt durch die bestehende private Home-Assistant-Allowlist und die Gebäudezuordnung begrenzt. Eine Gebäudeeinladung erweitert keine private Hardwarefreigabe.

Im privaten Gebäudechat kann Gemini strukturierte Schaltvorschläge liefern. Der Server validiert sämtliche Schlüssel, Parameter und die aktuelle Freigabe, bevor er einen Auftrag sendet. Nur ausdrücklich benannte Lampen oder Räume und ein aktueller Schaltwunsch können einen Textauftrag auslösen; unklare Wünsche führen zur Rückfrage. Raumgruppen, RGB und Helligkeit sind unterstützt, soweit die Lampe dies kann. Es werden keine beliebigen Home-Assistant-Dienste, URLs oder Entitäten akzeptiert.

Live-Sprache verwendet das Client-Werkzeug `control_lights`. Die App prüft vor dem Auftrag die aktive Gesprächsberechtigung. Eine zusätzliche Bestätigungsbox entfällt nach der einmaligen Kontofreigabe. Der Assistent wartet auf das Ergebnis. Mikrofonzugriff erfordert weiterhin die iOS-Systemfreigabe und einen bewussten Gesprächsstart.

Alle Aufträge verwenden dieselbe bestehende Home-Assistant-Ausführung mit dauerhaften eindeutigen Kennungen, begrenzter Rate, ohne automatische Wiederholung und mit anschließender Zustandsprüfung. Bei fehlender Bestätigung wird kein Erfolg behauptet. Gruppen können teilweise erfolgreich sein; das Ergebnis nennt jede tatsächlich bearbeitete Lampe. Kontingente der KI-Anbieter bleiben bestehen. Es wird kein Modell trainiert.

## Betrieb

Codeänderungen erfolgen ausschließlich über Branch und Pull Request. Deployment ausschließlich mit `d21-deploy`. Der verwaltete ElevenLabs-Agent benötigt nach dem Deployment die Werkzeugkonfiguration aus `dashboard/ops/voice/live-agent.json`; bestehende Authentifizierung, Datenschutz und Limits bleiben erhalten. Keine Schlüssel oder privaten Hardwarekonfigurationen gehören ins Repository.

Für Felix wurden nach einer geschützten Datenbanksicherung ausdrücklich als Demo markierte Datensätze und die bisherigen Mitteilungen bereinigt. Echte IFC-Modelle und Gebäudedaten bleiben erhalten. Der modelllose D21-Platzhalter wurde nach ausdrücklicher gesonderter Bestätigung einschließlich seines KI-Chats entfernt; das D21 mit den zwei IFC-Modellen bleibt erhalten.
