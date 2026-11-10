# 10.11.2026 – Building Sentinel auf der Landingpage

Vincent hat das Logo „Building Sentinel“ für die Projektseite bereitgestellt. Es ersetzt den bisherigen Schriftzug im Seitenkopf unter `/projekt/`. Die PNG-Datei wurde für die Webanzeige von 2172 auf 1080 Pixel Breite verkleinert. Das Anzeigeformat kürzt die weißen Ränder oben und unten. Das Motiv bleibt vollständig sichtbar. Das Logo führt mit dem zugänglichen Namen „Building Sentinel – zum Start“ zum Seitenanfang.

## Prüfung

- `npm ci`, `npm run build` und `npm run lint` erfolgreich. Vite meldet einen Hinweis zur Größe des Dashboard-Bundles.
- Lokale Browserprüfung bei 1440, 1001 und 390 Pixel Breite. Das Logo lädt, der Seitenkopf passt in den sichtbaren Bereich und der Startlink funktioniert per Enter.
- Abschnittsnavigation, Gebäudebild und Dashboard-Anmeldeseite geprüft. Die Demo meldet für Beispielraum B und CO₂ weiterhin fehlende Messdaten.
- Alle 15 Datei- und Abschnittsverweise geprüft. HTML, CSS, JavaScript, Logo, Gebäudebild und PDF wurden aus dem Produktionsbuild bytegleich ausgeliefert. Der Browser öffnete die PDF-Adresse. Die Darstellung der PDF-Seiten im integrierten Viewer konnte nicht bestätigt werden.

## Stand und Übergabe

- Branch: `feat/vincent-building-sentinel-logo`
- Pull Request: [#116 – Building-Sentinel-Logo im Seitenkopf](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/116).
- Stand: lokal geprüft und im Pull Request zur Prüfung bereit.
- Felix kann die Änderung nach Review und Merge über `d21-deploy` veröffentlichen. Anschließend Logo und Startlink unter `/projekt/` prüfen.
