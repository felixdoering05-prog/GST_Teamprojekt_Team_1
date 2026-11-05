# Frankfurt/Main: stündliche Lufttemperatur 2025

Quelle: **Deutscher Wetterdienst (DWD), Climate Data Center (CDC)**, Datensatz *Stündliche Stationsmessungen der Lufttemperatur und Luftfeuchte für Deutschland*, Version v24.03. Station **01420 Frankfurt/Main**, Flughafenstandort, 50.0259° N / 8.5213° E. Die Koordinaten stammen aus den mitgelieferten geografischen Stationsmetadaten für 2025. Dies sind Stationsmessungen der Lufttemperatur in 2 m Höhe, keine Messungen am D21 und keine Oberflächentemperaturen.

- [Originalarchiv](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/historical/stundenwerte_TU_01420_19810101_20251231_hist.zip)
- [Offizielle Datensatzbeschreibung](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/BESCHREIBUNG_obsgermany_climate_hourly_air_temperature_de.pdf)
- [DWD-Nutzungsbedingungen](https://opendata.dwd.de/climate_environment/CDC/Nutzungsbedingungen_German.pdf), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [DWD-Copyright](https://www.dwd.de/copyright)

Die JSON-Datei ist ein ausgewählter und umformatierter Ausschnitt des DWD-Archivs. Quellenname, Original-URL, Produktdatei, Abrufzeit und SHA-256 des ZIP sind in `source` enthalten. Attribution: **Deutscher Wetterdienst (DWD), CDC; Ausschnitt Frankfurt/Main 2025, in JSON umgewandelt, CC BY 4.0**. Historische Daten sind qualitätsgeprüft; der unverändert mitgeführte `QN_9` beschreibt das durchlaufene Prüfverfahren. Es werden weder Fehlerfreiheit noch eine identische Temperatur am Campus Darmstadt zugesichert.

`hours` enthält `[MESS_DATUM, TT_TU, QN_9]`, Temperatur in °C. `MESS_DATUM` ist die Originalzeit in **UTC**, Format `YYYYMMDDHH`. Der Ausschnitt deckt das **Kalenderjahr 2025 in Europe/Berlin** ab: vom 31.12.2024 23:00 UTC einschließlich bis 31.12.2025 23:00 UTC ausschließlich. Das sind genau **8.760 aufeinanderfolgende UTC-Stunden**, letzter Datensatz `2025123122`. Sommerzeitwechsel werden nicht durch Verschieben der Rohzeitstempel vorweggenommen.

Der DWD-Fehlwert `-999` wird zu `null`, sein Qualitätsniveau bleibt erhalten. Fehlt eine ganze UTC-Beobachtung, stehen Temperatur und Qualitätsniveau auf `null`. Keine Interpolation, Ersatzmessung oder Verwechslung eines Fehlwerts mit 0 °C. Gebäudeflächen- und Campusabweichungen, die die App aus diesen Messwerten ableitet, bleiben Simulationen.

Reproduzierbarer Import ohne zusätzliche Pakete (Node.js):

```sh
node scripts/import-frankfurt-weather.mjs --archive /path/to/stundenwerte_TU_01420_19810101_20251231_hist.zip --retrieved-at 2026-11-05T00:00:00.000Z
node --test scripts/import-frankfurt-weather.test.mjs
```

Ohne `--archive` lädt das Skript ausschließlich die oben festgelegte offizielle HTTPS-Quelle. Downloadlimit 10 MiB, Zeitlimit 30 s, keine Weiterleitungen; Produktlimit nach Dekompression 50 MiB. ZIP-Member werden nur im Speicher gelesen und gegen CRC32 geprüft, keine Archivpfade extrahiert. Fremde Stationen, doppelte Beobachtungen, ungültige Daten und Temperaturen werden abgelehnt. Ein erneuter Abruf kann bei einer DWD-Revision einen anderen Archivhash ergeben; dies ist vor Ersetzen des Snapshots zu prüfen.
