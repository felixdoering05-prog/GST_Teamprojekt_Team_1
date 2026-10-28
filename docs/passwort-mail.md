# Passwort vergessen und Mailversand

Stand: 28. Oktober 2026. **Es gibt noch kein Projekt-Mailkonto und keine eigene Domain.**
Die Funktion ist vorbereitet, der echte Versand bleibt ohne vollständige Einrichtung deaktiviert.
Es werden dann keine Codes erzeugt oder Mails als verschickt ausgegeben.

## Bedienung nach Aktivierung

Website oder iPhone-App → Anmelden → Passwort vergessen → Konto-E-Mail angeben.
Der einmalige achtstellige Code aus der E-Mail wird zusammen mit einem neuen Passwort
in derselben Ansicht eingegeben. Die Mail enthält keinen wechselnden Cloudflare-Link.

- 15 Minuten gültig, einmal verwendbar, nach fünf Fehlversuchen gesperrt.
- Eine erneute Anforderung frühestens nach einer Minute, höchstens drei pro Stunde/Konto.
- Vorhandene und unbekannte Adressen erhalten dieselbe allgemeine Antwort.
- Nach erfolgreicher Änderung werden alle persönlichen Sitzungen dieses Kontos widerrufen.
  Das neue Passwort gilt auf Website und iPhone. Daten und Gebäude bleiben erhalten.
- Der zusätzliche gemeinsame Website-Zugang wird nicht geändert.

## Was noch benötigt wird

Ein bestehendes Absenderkonto bzw. ein SMTP-Versandkonto und dessen Zugang. Eine eigene
Projekt-Domain ist für ein normales Postfach bei einem Mailanbieter nicht zwingend nötig.
Kontoerstellung, Anbieterbedingungen und eventuell erforderliche Bestätigung erfolgen durch
Felix. Passwörter und App-Passwörter nicht in Chats, Issues oder Pull Requests eintragen.

Falls ein Gmail-Projektkonto gewählt wird, hängen App-Passwörter von der aktivierten
Bestätigung in zwei Schritten und den Kontoeinstellungen ab; Google bevorzugt grundsätzlich
OAuth. Für die vorbereitete einfache SMTP-Anbindung wäre ein zulässiges App-Passwort nötig.
[Offizielle Google-Hilfe](https://support.google.com/mail/answer/185833?hl=de).

## Private Einrichtung auf dem Server

Erst nach Übernahme des Codes über GitHub auf dem Server ausführen:

```sh
cd /opt/gst/dashboard
python3 ops/configure-mail.py
```

Das interaktive Skript fragt SMTP-Server, Port, Benutzername, Absenderadresse und das
unsichtbar eingegebene SMTP-/App-Passwort ab. Es erstellt eine private Sicherung unter
`/root/d21-mail-backups/` und lässt vorhandene Datenbank-/Serverwerte in `.env` unverändert.

- `.env`: `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`.
- `private-mail/smtp-password`: SMTP-/App-Passwort, Modus 600.
- `private-mail/reset-secret`: zufälliger 256-Bit-Schlüssel, Modus 600; bei Wiederholung erhalten.
- Geheimnisordner Modus 700, aus Git ausgeschlossen, schreibgeschützt in den API-Container eingebunden.
- Danach ausschließlich `d21-deploy` verwenden. Das Konfigurationsskript startet selbst nichts neu und sendet keine Nachricht.
- Anschließend mit einer eigenen Konto-E-Mail einen echten Code anfordern und Empfang, Rücksetzung und erneute Anmeldung prüfen.

SMTP ist auf Port 465 (TLS) oder 587 (erforderliches STARTTLS) beschränkt; Zertifikatsprüfung
bleibt aktiv. Es wird kein offener Mailserver auf dem Projektserver eingerichtet.
[Transport-Dokumentation](https://nodemailer.com/smtp).

## Technischer Ablauf

Neue Tabelle `app_password_resets`, bestehende Konten und Dateien bleiben erhalten.
Codes werden als konto-gebundener HMAC gespeichert; bis zum Versand liegt zusätzlich
nur ein AES-GCM-verschlüsselter Mail-Code vor. Der Worker versucht die SMTP-Zustellung
bis zu dreimal und entfernt den verschlüsselten Code nach SMTP-Annahme. Bei Neustart
bleibt die Versand-Warteschlange erhalten. SMTP-Annahme ist noch kein Nachweis für
Zustellung im Posteingang; Spamfilter und Anbieterfehler müssen beim echten Test geprüft werden.
Codes, Passwörter und SMTP-Dialoge werden nicht geloggt.

Die Rücksetzung und der Widerruf der Sitzungen erfolgen in einer Transaktion. Eine
parallele Anmeldung prüft vor Ausgabe der Sitzung nochmals den aktuellen Passwort-Hash.
Damit kann ein vor der Änderung geprüftes altes Passwort keine neue Sitzung nachträglich erhalten.

| Methode | API-Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/v1/auth/password-reset/status` | Nur `{enabled}`; keine Geheimnisse |
| POST | `/api/v1/auth/password-reset/request` | `{email}` → allgemeine Antwort oder `503`, wenn Versand nicht eingerichtet |
| POST | `/api/v1/auth/password-reset/confirm` | `{email,code,password}` → Passwort ändern, Code verbrauchen, Sitzungen widerrufen |

Orientierung: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
E-Mail-Bestätigung bei Registrierung und Änderung der Konto-E-Mail sind nicht Teil dieser Erweiterung.
