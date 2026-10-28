# Entwicklungsprotokoll · 28. Oktober 2026 · Passwort und Mail

Felix hat „Passwort vergessen“ und den Mailversand beauftragt. Im Gespräch geklärt:
Noch kein Projekt-Mailkonto und keine eigene Domain vorhanden. Deshalb wird der
SMTP-Versand nicht ohne echte Zugangsdaten aktiviert.

Vorbereitet: einmaliger E-Mail-Code mit Ablauf und Fehlversuchslimit, verschlüsselte
persistente Versand-Warteschlange, Sitzungswiderruf nach Rücksetzung, Ansichten auf
Website und iPhone sowie private interaktive SMTP-Einrichtung auf dem Server.

Die Code-Eingabe braucht keine feste Website-Domain. Ein tatsächliches Absenderkonto
und ein erfolgreicher Empfangstest bleiben Voraussetzung für die Aktivierung.
Keine Passwörter oder Mail-Schlüssel im Repository. Änderungen über eigenen Branch
und Pull Request; keine Anwendungscode-Änderungen direkt auf dem Server.

Einrichtung, API und Grenzen: [Passwort und Mail](../passwort-mail.md).

## Prüfung

33 Backendtests bestanden; dabei Versand über einen isolierten Test-Mailer statt echter E-Mail. Website-Build und ESLint bestanden; signierter Simulator-Build bestanden. Kein echter Zustelltest möglich, da das Absenderkonto noch fehlt.
