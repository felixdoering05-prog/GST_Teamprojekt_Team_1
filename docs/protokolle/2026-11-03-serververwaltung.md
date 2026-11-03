# 03.11.2026 – Geschütztes Server-Verwaltungsportal

Felix hat ein eigenes Portal zur Überwachung von Serverkapazität, API-Nutzung, Zugängen und registrierten E-Mail-Adressen beauftragt. Das bestehende Konto Felix Döring (ID 3) wird ausdrücklich serverseitig freigegeben; keine anderen Rollen werden verändert.

Implementiert: `/verwaltung`, nur für Administratoren sichtbarer Menüpunkt, serverseitig geschützte Lese-Endpunkte, additive stündliche HTTP-Statistik, KI-Kontingente aus bestehendem Anfrageprotokoll, paginierte Kontoliste und ein lokaler Host-Sammler mit systemd-Timer. Die API erhält ausschließlich einen lesenden Snapshot, keinen Docker-Socket oder Zugriff auf private SSH-Schlüssel. Fehlende/veraltete Messwerte werden gekennzeichnet. Keine Anzeige von Passwörtern, Passwort-Hashes, Tokens oder API-Schlüsseln.

Prüfung vor Veröffentlichung: Backend-Tests für Zugriffssperren, fehlende/stale Snapshots, Kontolisten und aggregierte HTTP-/KI-Zähler, Sammler-Tests für CPU und öffentliche Fingerabdrücke, Web-Build/Lint. Nach Deployment Host-Snapshot, Admin-/Normalnutzerzugriff, App-Health und Erhalt des Datenbank-Containers prüfen. Bereitstellung über GitHub-PR und `d21-deploy`.

[Betrieb, Datenumfang und Grenzen](../serververwaltung.md)
