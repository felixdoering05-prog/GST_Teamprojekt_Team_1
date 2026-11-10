# 10.11.2026 – Farbpalette für Building Sentinel

Die Präsentationsseite unter `/projekt/` übernimmt Dunkelblau und Pink aus dem Building-Sentinel-Logo. Dunkelblau prägt Hauptbuttons und Demo. Pink hebt den Titel, die Navigation und Details des Gebäudeschemas hervor. Helle violette und rosafarbene Flächen gliedern die Abschnitte. Der Tastaturfokus erscheint auf der dunkelblauen Demo in hellem Pink.

## Prüfung

- `npm run build` und `npm run lint` erfolgreich. Der Build meldet einen Hinweis zur Größe des Dashboard-Bundles.
- Lokale Browserprüfung bei 1440 und 390 Pixel Breite ohne horizontalen Überlauf. Abschnittsnavigation, Demo-Auswahl, sichtbarer Tastaturfokus, Gebäudebild und Dashboard-Link geprüft.
- Zehn Text-Farbpaare berechnet. Das kleinste geprüfte Kontrastverhältnis beträgt 4,90:1.
- Alle 15 Datei- und Abschnittsverweise geprüft. Logo, Gebäudebild und PDF werden bytegleich ausgeliefert. Der PDF-Link öffnet die PDF-Adresse.

## Stand und Übergabe

- Branch: `feat/vincent-building-sentinel-farbpalette`
- Pull Request: [#117 – Farben auf das Building-Sentinel-Logo abstimmen](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/117).
- Stand: lokal geprüft und im Pull Request zur Prüfung bereit.
- Felix kann die Farbpalette nach Review und Merge über `d21-deploy` veröffentlichen. Anschließend `/projekt/` auf Desktop und Mobilgerät prüfen.
