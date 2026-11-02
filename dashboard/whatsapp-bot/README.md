# D21-Projekt-Bot · Prototyp

**Stand: 2. November 2026. Noch nicht mit WhatsApp gekoppelt und nicht auf dem Produktivserver gestartet.**

Erste Version: GitHub → eine konfigurierte WhatsApp-Projektgruppe. Meldet neue Aufgaben/Pull Requests, geänderte Zuweisungen sowie geschlossene, wieder geöffnete und zusammengeführte Vorgänge. Es wird alle fünf Minuten der aktuelle Zustand verglichen; Zwischenänderungen innerhalb eines Intervalls können zusammenfallen. Kein vollständiges Ereignisarchiv.

Keine eingehenden Chatbefehle, keine Chat-Übertragung nach GitHub, keine Medienübernahme, kein KI-Dienst. `!aufgabe` ist ausdrücklich noch nicht implementiert. Die private Modellablage wird standardmäßig nicht überwacht.

## Voraussetzung

- Eine ausschließlich für den Bot verwendete zweite Nummer ist in WhatsApp oder WhatsApp Business registriert und wurde zur Projektgruppe hinzugefügt.
- Node.js ab Version 22 sowie ein separat installierter, aktueller Chrome/Chromium mit funktionierender Browser-Sandbox. `CHROME_PATH` muss explizit gesetzt sein. Die Sandbox wird nicht deaktiviert.
- Nutzung von `whatsapp-web.js` ist inoffiziell; eine Kontosperre bleibt möglich. Die Bibliothek weist selbst darauf hin: <https://github.com/wwebjs/whatsapp-web.js#disclaimer>.

## Lokal vorbereiten und ohne WhatsApp prüfen

Im Verzeichnis `dashboard/whatsapp-bot/`:

```sh
npm ci
cp .env.example .env
npm test
npm run preview -- --once
```

Die `.npmrc` überspringt Installationsskripte und nicht benötigte optionale RemoteAuth-Pakete. Es wird kein Browser heruntergeladen. Puppeteer sowie betroffene Unterabhängigkeiten sind bewusst auf die geprüften Versionen festgelegt. Die WhatsApp-Importe wurden geprüft; ein echter QR-/Gruppentest mit der aktualisierten Browser-Abhängigkeit steht noch aus.

Der Vorschaulauf liest nur das öffentliche Hauptrepository. Dafür ist kein GitHub-Token nötig. Beim ersten Lauf wird der Ausgangsstand gespeichert; bestehende Aufgaben werden nicht gesammelt an die Gruppe geschickt. Ein Folgelauf zeigt neue Meldungen lokal auf der Konsole. Vorschaumeldungen werden nicht später automatisch verschickt.

## Nummer verknüpfen und Zielgruppe wählen

1. In `.env` den vollständigen Pfad zu Chrome/Chromium als `CHROME_PATH` setzen.
2. `npm run connect` starten. Der kurzlebige QR-Code liegt unter `runtime/whatsapp/pairing-qr.png`. Direkt lokal öffnen; nicht in GitHub oder in einen Chat hochladen.
3. Auf dem Handy der **zweiten Nummer** in WhatsApp unter **Verknüpfte Geräte → Gerät hinzufügen** scannen. Die Verknüpfung erfolgt durch Felix selbst; Sitzung und QR-Code sind Zugangsdaten.
4. `npm run groups` zeigt nach der Verknüpfung lokal Gruppennamen und Gruppen-IDs. Die exakte Projektgruppen-ID als `WHATSAPP_GROUP_ID` in `.env` eintragen. Der Bot tritt keiner Gruppe automatisch bei.
5. Erst nach Prüfung des Ziels `SEND_ENABLED=true` setzen und `npm start` starten. Der erste aktive Lauf erstellt ebenfalls nur einen Ausgangsstand. Mit einer ausdrücklich als Test bezeichneten neuen GitHub-Aufgabe anschließend eine einzelne Meldung prüfen.

`.env`, Authentifizierung, Browser-Cache, QR-Code und Laufzeitdateien sind ausgeschlossen. Es gibt keine Nummern, Schlüssel, Gruppen-IDs oder Sitzungstoken im Repository. Kein Schreibzugriff auf GitHub erforderlich. Falls später ein Token nötig ist, nur die erforderlichen Leserechte und nur das ausgewählte Repository vergeben.

`ALLOW_PRIVATE_REPOSITORY` bleibt `false`. Eine spätere Übertragung privater Repository-Metadaten braucht eine gesonderte Entscheidung über Empfänger und Inhalte; nicht versehentlich auf den privaten Dateibereich umstellen.

## Verhalten bei Fehlern

- Eine einzige Zielgruppe; kein Versand an Einzelkontakte oder andere Gruppen.
- Maximal zehn Meldungen pro Prüfintervall und höchstens 200 ausstehende Meldungen.
- Warteschlange und Vergleichsstand liegen lokal in `runtime/live/state.json`, atomar gespeichert und mit restriktiven Dateirechten. Nach Sendefehlern bleibt die Warteschlange erhalten.
- Eine kurze Absturzlücke zwischen WhatsApp-Versand und Speichern kann zu einer doppelten Meldung führen. Keine Garantie für exakt einmalige Zustellung oder Lesebestätigung.
- Änderungen an Repository oder Zielgruppe werden bei vorhandenem Zustand abgelehnt. Einen gesonderten Laufzeitordner bzw. kontrollierten Neustart mit neuer Baseline vorsehen; ausstehende Nachrichten nicht ungeprüft an ein neues Ziel senden.
- Eine Sperrdatei verhindert zwei Bot-Instanzen im selben Ordner. Nach einem harten Absturz nur dann `runtime/bot.lock` entfernen, wenn nachweislich kein Bot mehr läuft. Sitzung und Warteschlange nicht löschen.
- Bei verlorener WhatsApp-Verbindung beendet sich der Prozess. Vor einem Neustart Verbindung und gegebenenfalls Kopplung prüfen.
- API-Fehler überschreiben den bisherigen Datenstand nicht. Der Prototyp verwendet mindestens 300 Sekunden Abstand; bei häufigen Limits Lesetoken oder längeres Intervall prüfen.

## Serverbetrieb ist ein eigener nächster Schritt

Keine eingehenden Webhooks, keine neuen öffentlichen Ports und keine Änderung an D21-API oder Datenbank. Der Bot holt GitHub-Daten selbst ab. Die Oberfläche, App und das Datenbank-Volume bleiben unberührt.

Der separate Bot-Start gehört bislang **nicht** zum vorhandenen `d21-deploy`. Deshalb wurde kein dauerhafter Dienst auf dem Server eingerichtet. Erst nach Nummernregistrierung, Kopplung und echtem Gruppentest einen geprüften Betriebs-/Deployment-Weg mit Felix und Benjamin festlegen. Keine Anwendung direkt auf dem Server bearbeiten und niemals Datenbank/Volume für den Bot ersetzen.

## Prüfstand

- Fünf automatisierte Tests: Ausgangsstand ohne Alt-Nachrichten; Änderungs-/Merge-Erkennung; persistente Wiederholung nach Sendefehlern; Schutz bei Zielwechsel; private Repository-Sperre, Pagination und GitHub-Fehler.
- Installierte Paketkonfiguration am 2.11.2026 mit `npm audit --omit=optional` geprüft: 0 bekannte Schwachstellen.
- Echter GitHub-Vorschaulauf ohne WhatsApp-Verknüpfung separat geprüft; siehe Entwicklungsprotokoll.
- Noch offen: QR-Kopplung, WhatsApp-Web-Kompatibilität im echten Client, erste Gruppenmeldung, Wiederanlauf auf dem vorgesehenen Rechner und Ressourcenprüfung vor Serverbetrieb.

Quellen: [Client-API](https://docs.wwebjs.dev/Client.html), [LocalAuth](https://docs.wwebjs.dev/LocalAuth.html), [GitHub Issues](https://docs.github.com/en/rest/issues/issues), [GitHub Pull Requests](https://docs.github.com/en/rest/pulls/pulls).
