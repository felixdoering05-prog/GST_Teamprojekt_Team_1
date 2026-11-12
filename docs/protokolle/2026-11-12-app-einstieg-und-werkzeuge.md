# App-Einstieg und Werkzeugübersicht – 12. November 2026

Version 1.0.102 (102): nach ausdrücklicher Freigabe veröffentlicht und auf Felix’ iPhone installiert; kein TestFlight-Upload.

## Anmeldung

Die normale App verwendet den vorbelegten Projektserver und `/app-api/v1/`. Der Einstieg zeigt nur Konto erstellen, Anmelden sowie Datenschutz/Support. Weder Serveradresse noch gemeinsame Website-Zugangsdaten sind erforderlich. JSON- und Datei-Anfragen senden am verwalteten Projektserver keine HTTP-Basic-Daten mehr. Die bestehende Konto-Sitzung bleibt an denselben HTTPS-Origin gebunden. Fremde Server bleiben im Profil unter Erweitert erreichbar; der eigene Server ist ein Sonderfall.

Die vorgeschaltete nginx-Konfiguration bekommt **nur für den App-API-Präfix** `auth_basic off`; sie leitet auf die bestehende `/api/v1/`-API weiter. Persönliche Sitzungs-, Eigentümer- und Freigabeprüfungen bleiben dort maßgeblich. Der Website-Passwortschutz für normale Seiten und bisherige Clients bleibt erhalten. Öffentlich erreichbar sind damit insbesondere die Konto-Anmelde- und Registrierungsendpunkte. Geschützte Gebäude-/Dateiendpunkte müssen ohne Sitzung weiterhin 401 liefern; niemals nur den Startseitenknopf entfernen oder gemeinsame Passwörter in die App einbauen.

Die bestehenden Anmeldeversuchslimits bleiben aktiv. Passwortberechnungen halten ihren begrenzten Ausführungsslot jetzt bis zum tatsächlichen Ende, auch wenn die HTTP-Anfrage vorher schließt. Die Backend-IP-Begrenzung vertraut keinen eingesandten IP-Headern; hinter dem aktuellen Proxy ist sie entsprechend gemeinsam/konservativ. Kein Anspruch auf vollständig öffentlich skalierbare Registrierung: E-Mail-Bestätigung, zusätzliche Missbrauchskontrollen und feste Domain bleiben separate Aufgaben.

## Aktivierung nach Freigabe

1. PR zusammenführen, Datenbank sichern und ausschließlich `d21-deploy` verwenden.
2. Auf dem Server `python3 /opt/gst/dashboard/ops/configure-mobile-api.py` zunächst prüfen; anschließend `--apply`. Das Skript ändert ausschließlich `/etc/nginx/conf.d/d21-tunnel.conf`, erstellt eine Sicherung, prüft nginx und lädt die Konfiguration neu. Bei Fehlern wird die vorherige Konfiguration wiederhergestellt.
3. Ohne Website-Zugang: `/app-api/v1/auth/me` und `/app-api/v1/buildings` müssen 401 JSON liefern; `/` bleibt 401 mit Website-Anmeldeschutz. Mit einem separaten Testkonto Anmeldung, eigenes Gebäude, Datei und Fremdzugriff prüfen. Keine produktiven Konten löschen.
4. Erst danach die neue iPhone-Version installieren. Die Cloudflare-Testadresse bleibt vorerst vorbelegt und ist keine dauerhafte Domain. Für einen Hochschulumzug zentral die App-Konfiguration und den Proxy aktualisieren.

## Web-Werkzeuge im iPhone

| Web-Funktion | iPhone-Einstieg im jeweiligen Gebäude | Daten-/Funktionsgrenze |
|---|---|---|
| Dashboard | Gebäude-Dashboard | Vorhandene gebäudebezogene Telemetrie |
| Sensorik | Sensoren und Messwerte | Sensoren anlegen, CSV-Import; keine erfundene Hardwarekopplung |
| Energie | Energie und Verbrauch | Nur vorhandene Verbrauchsdaten, kein automatisch verfügbarer Zähler |
| Regel-/KI-Analyse | Auswertung und KI-Analyse | Bestehende native Regelansicht und bewusste Gemini-Auswertung |
| Heatmap / Karte | Heatmap, Wetter und Standort | Wettermodell/illustrative Färbung getrennt von realen Raummessungen |
| BIM und Dateien | 3D bzw. Bilder, Pläne und Dokumente | Gemeinsame Dokumente und bestehende Zugriffsprüfung |
| Plananalyse | Aus Grundrissen ein 3D-Modell erstellen | Nur Eigentümer; vorhandener Gemini-/BIMCraft-Worker |
| Team | Gebäude-Chat und Freigaben | Keine Vermischung mit privatem KI-Chat |

Die Web-Twin-Tabellen und native Telemetrie sind nicht automatisch derselbe Datenbestand. Die neuen Einstiege vereinfachen die vorhandenen nativen Werkzeuge; sie behaupten keine vollständige Migration jeder Webfunktion oder bestehender Twin-Importe. Campusmesswert-Heatmap, differenzierte Web-Filter, Schwellenwertverwaltung und reine Serveradministration müssen gesondert nach Bedarf portiert werden.

## Gestaltung

Finanzguru dient als Referenz für eine zentrale Zusammenfassung, geordnete Karten und schrittweises Öffnen von Details. Die App behält eigene Farben, Begriffe und native iOS-Komponenten. Oben eine dunkelblaue Gebäudepass-Karte mit tatsächlichen Gebäude-, Modell- und Mitteilungszahlen. Keine erfundenen Energiesparzahlen oder Sicherheitsampeln. Unten nur Gebäude, Team und Profil; Werkzeuge befinden sich beim Gebäude. Inaktive Live-Sprache wird nicht als gleichrangiger Schnellzugriff beworben.

Referenzen: [Finanzguru-App](https://finanzguru.de/finanzwissen/finanzguru-app), [Apple Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [Apple Tab Bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices).

## Validierung

139 Backendtests einschließlich Kontentrennung und tatsächlich begrenzter Passwortarbeit erfolgreich. Zwei Proxy-Skriptprüfungen für exakte Pfadfreigabe, Beibehaltung des Website-Schutzes, Idempotenz und Ablehnung unerwarteter Konfiguration. Simulator-Build erfolgreich; Übersicht mit ausschließlich lokalen Debug-Vorschaudaten visuell geprüft. Produktiver Proxy aktiviert und Anmeldung mit dem bestehenden Testkonto ohne Website-Zugang erfolgreich geprüft: geschützte Endpunkte ohne Sitzung 401, Anmeldung und eigene Gebäudeliste mit Sitzung 200, Website weiterhin passwortgeschützt. Anschließend Diagnosesitzung abgemeldet.
