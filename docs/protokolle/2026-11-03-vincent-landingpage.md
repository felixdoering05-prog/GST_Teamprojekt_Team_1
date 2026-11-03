# 03.11.2026 – Vincents Landingpage eingebunden

Felix hat die Prüfung, GitHub-Übernahme und Veröffentlichung des von Vincent hochgeladenen Website-Pakets autorisiert. Die Anweisungen im Paket wurden als externe Hinweise behandelt, nicht als zusätzliche Berechtigung für Root-Zugriff oder Änderungen am laufenden Servercode.

Die Präsentationsseite liegt unter `dashboard/base44-frontend/public/projekt/` und wird unter `/projekt/` ausgeliefert. Ergänzt: relativer HTTPS-verträglicher Redirect von `/projekt`, gesonderte 404-Behandlung und Dashboard-Link. Die von Vincent gelieferten Inhalte, Platzhalter, Demo-Kennzeichnung, PDF und Gebäudeaufnahme bleiben erhalten.

Prüfung: Produktionsbuild, ESLint, lokale Datei-/Fragmentlinks, sichtbare Browserprüfung der Startseite sowie Auswahl von Beispielraum B und CO₂ mit korrektem Hinweis auf fehlende Messdaten. Deployment folgt dem bestehenden Weg über GitHub-PR und `d21-deploy`; Nginx, bestehendes Dashboard/API und Datenbank-Erhalt werden anschließend geprüft.

Keine Datenbankänderung, keine neuen Ports, kein erweitertes Benutzerrecht für Vincent und keine Aufhebung des Website-Zugangsschutzes.

[Bedienung, Ablage und Zusammenarbeit](../landingpage-vincent.md)
