# 03.11.2026 – Teamvorstellung der Landingpage

## Auftrag und Änderung

Vincent hat den Projekttitel „KI trifft Gebäude“ und die vollständigen Namen Vincent Kißner, Emir Sancak, Felix Döring, Josef Assaf, Benjamin Grimm und Lukas Zimmermann bestätigt. Die sechs Teamkarten ersetzen die drei Namensplatzhalter. Die Rollen folgen Vincents Vorgaben und der vorhandenen Rollenübersicht; der Browser-Seitentitel lautet nun exakt „KI trifft Gebäude“.

Für Umsetzung, Ergebnisse und Fazit liegen laut Vincent noch keine Inhalte vor. Die bestehenden offenen Bereiche und die Demo ohne Datenverbindung bleiben deshalb erhalten. Dashboard-Link, Bildhinweise und PDF werden erhalten.

## Prüfung

- `npm ci` mit dem vorhandenen Lockfile durchgeführt; keine Abhängigkeiten geändert.
- `npm run build` und `npm run lint` erfolgreich. Der Build weist auf ein großes Dashboard-Bundle hin.
- Alle 14 Datei-/Abschnittsverweise geprüft; sechs Namen exakt übernommen. Ergebnisse und Fazit gegen den Ausgangsstand verglichen und unverändert.
- Produktionsbuild im lokalen Browser geprüft: sechs Teamkarten auf Desktop (1440 × 1000) und einspaltige Anordnung bei 390 × 844, ohne horizontalen Überlauf.
- Abschnittsnavigation und Tastaturbedienung des Zurück-Buttons mit Enter geprüft. Demo mit Beispielraum B/CO₂ zeigt weiterhin fehlende Daten. Dashboard-Link öffnet lokal die Anmeldeseite.
- Gebäudeaufnahme wird geladen; Bildhinweise bleiben erhalten. HTML, CSS, JavaScript, Bild und PDF liefern lokal HTTP 200. Alle Landingpage-Dateien werden bytegleich in den Produktionsbuild übernommen.
- PDF-Link im Browser geöffnet; der integrierte Viewer blieb leer. PDF-Auslieferung als `application/pdf` und PDF-Dateikennung technisch geprüft, sichtbare PDF-Darstellung nicht bestätigt.
- Keine erneute Live-Abnahme: Für die geschützte Produktivseite steht in dieser Sitzung kein angemeldeter Browserzugang zur Verfügung.

## Stand und Übergabe

- Ausgangsstand: `c44bee782f5e2a2abdfdbb1eeda0c1c279e28910` auf `main`.
- Branch: `feat/vincent-landingpage-team`.
- Pull Request: [#68 – Landingpage: sechs bestätigte Teammitglieder vorstellen](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/68).
- Status: lokal geprüft und in Pull Request #68 zur Prüfung bereitgestellt; noch nicht zusammengeführt oder veröffentlicht.
- Felix: Pull Request prüfen, nach Review zusammenführen, vor Deployment Datenbank sichern und ausschließlich über `d21-deploy` veröffentlichen. Anschließend `/projekt/`, Dashboard/API und den Erhalt der Datenbank prüfen.

Keine Änderungen an Serverrechten, API, Datenbank, nginx oder Abhängigkeiten.
