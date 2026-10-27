# iOS-Konten und Serveranbindung

Die native App erhält eine Startseite mit Registrierung und Anmeldung. Änderungen an dieser API werden mit Benjamin abgestimmt.

## Datenfluss

**iPhone → HTTPS / vorhandener Website-Zugang → Konten-API → PostgreSQL**

Web-Dashboard und iPhone verwenden dieselben persönlichen Konten und Gebäude. Die neuen persönlichen Gebäude liegen getrennt von den bisherigen Demo-Gebäuden. Lokale iOS-Testgebäude werden nicht automatisch übertragen.

## API-Vertrag

Alle Pfade beginnen mit `/api/v1`. JSON-Anfragen mit `Content-Type: application/json` senden.

| Methode | Pfad | Eingabe / Ergebnis |
| --- | --- | --- |
| POST | `/auth/register` | `{name,email,password}` → `{token,expires_at,user}` |
| POST | `/auth/login` | `{email,password}` → `{token,expires_at,user}` |
| GET | `/auth/me` | Aktuelles Konto `{id,name,email}` |
| POST | `/auth/logout` | Sitzung widerrufen → `{ok:true}` |
| GET | `/buildings` | Gebäude des angemeldeten Kontos |
| POST | `/buildings` | `{name,address}` → angelegtes Gebäude |

Geschützte Aufrufe benötigen `X-D21-Session: <token>`. So bleibt `Authorization` für den zusätzlichen Website-Passwortschutz verfügbar. Registrierung und Anmeldung benötigen keine Kontensitzung, aber weiterhin den vorhandenen Website-Zugang.

Fehler werden als `{error: "Beschreibung"}` geliefert: 400 ungültige Angaben, 401 fehlende/ungültige Anmeldung, 409 Kontokonflikt, 429 Anfragelimit, 500 Serverfehler.

## Speicherung und Zugriffsgrenzen

- Zusätzliche Tabellen: `app_users`, `app_sessions`, `app_buildings`. Bestehende Tabellen werden nicht verändert oder gelöscht.
- E-Mail-Adressen werden normalisiert und eindeutig gespeichert; Name maximal 100 Zeichen.
- Passwörter: mindestens 12 Zeichen, maximal 1024 UTF-8-Bytes. Gespeichert wird ein gesalzener scrypt-Hash (N=32768, r=8, p=1).
- Zufällige Sitzungstokens mit 256 Bit, serverseitig nur als SHA-256-Hash gespeichert. Laufzeit sieben Tage; Abmelden widerruft die aktuelle Sitzung.
- Jede Gebäudeabfrage und Neuanlage ist an die authentifizierte Nutzer-ID gebunden.
- Anmeldeversuche und parallele Passwortprüfungen sind begrenzt. Das Limit gilt hinter dem bestehenden Proxy gemeinsam für dessen Verbindungen; es ist keine über mehrere Backend-Instanzen verteilte Begrenzung.
- iOS speichert Sitzungen und zusätzliche Website-Zugangsdaten im Schlüsselbund; der Servername darf in lokalen Einstellungen stehen. Keine Zugangsdaten sind im Repository enthalten.
- HTTPS ist erforderlich. Weiterleitungen werden abgelehnt, damit Anmeldedaten nicht an ein anderes Ziel gelangen.

## iPhone einrichten

1. Auf der Startseite **Serververbindung einrichten** wählen.
2. Aktuelle HTTPS-Adresse und den bereits vorhandenen gemeinsamen Website-Benutzernamen samt Passwort eingeben.
3. **Konto erstellen** wählen und persönliche Angaben eingeben.
4. Gebäude anlegen; nach App-Neustart bzw. erneuter Anmeldung müssen sie wieder vom Server geladen werden.
5. Zweites Konto verwenden und prüfen, dass dessen Gebäudeliste getrennt ist.

Die Website-Zugangsdaten und das persönliche Konto erfüllen unterschiedliche Zwecke. E-Mail-Bestätigung, Passwort-Zurücksetzen, Kontolöschung und gemeinsame Gebäudefreigaben sind noch nicht implementiert. Es werden keine Bestätigungsmails verschickt. Bilder, PDFs und DWG-Dateien sind über die [Datei-API](dateien.md) angebunden.

## Validierung und Bereitstellung

- Backend: `cd dashboard/backend && npm ci && npm test`.
- Die Tests verwenden eine isolierte PostgreSQL-Laufzeit (PGlite), keine produktiven Daten. Sie prüfen Registrierung, Passwort-/Token-Hashes, Dubletten, Anmeldung, Kontentrennung, idempotente Initialisierung, Ablauf/Widerruf und Anfragelimit.
- iOS: Xcode-Projekt unter `ios/` öffnen und einen konkreten iPhone-Simulator wählen.
- Nach Review/Merge die bestehende Deployment-Routine verwenden. Vorher die Datenbank sichern; das bestehende Datenbank-Volume erhalten.
