# h_da Open WebUI – vorbereitete Anbieter-Anbindung

Stand: 03.11.2026. Felix möchte die Hochschul-API und eine dauerhafte Server-Anbindung nutzen. Ein Weiterleiten über den eingeschalteten Mac ist ausdrücklich nicht die gewählte Betriebslösung.

## Verifizierter Stand

- Grundlage: die von Felix bereitgestellte „DokumentationOWUI-API-1.0.pdf“, Seiten 1–8. Nur Hochschulnetz/VPN, Bearer-Authentifizierung, Modelle unter `GET /api/models`, Chat unter `POST /api/chat/completions`.
- Festes Ziel: `https://open-webui.lc.users.h-da.cloud/api`. Keine frei vom Client bestimmbaren Provider-Adressen, keine Weiterleitung von Zugangsdaten an Redirect-Ziele.
- Felix hat den Schlüssel selbst über eine verdeckte Terminal-Eingabe auf dem Server hinterlegt: `/etc/d21/hda-api-key`, Modus 0600, außerhalb von Git. Kein Schlüsselwert in App, Dokumentation oder Tests. Ein zunächst abgelehnter Schlüssel wurde vom Nutzer ersetzt; der neue wurde erfolgreich authentifiziert.
- Modelle wurden mit Felix' Schlüssel über seinen per eduVPN verbundenen Mac abgefragt. Das PDF-Beispielmodell `openai-gpt-oss-120b` war in der tatsächlich verfügbaren Liste nicht enthalten.
- `qwen3-30b-a3b-instruct-2507` hat einen neutralen Texttest sowie JSON-Vorschläge für blaue Wände, Wände ausblenden und Zurücksetzen erfolgreich beantwortet. Nur synthetische Texte, keine Dateien oder Projektdaten übertragen.
- Die API meldete während der Tests **zwei Anfragen je zehn Sekunden**, mit HTTP 400 und einer Rate-Limit-Meldung. „Ohne Nutzungslimit“ ist deshalb nicht bestätigt. Dieses konkrete Provider-Limit wird als sicherer Fehler 429 an die App übersetzt; kein automatisches Wiederholen und kein Ausweichen auf Google.
- **Der Server erreicht die API noch nicht** (Verbindungs-Timeout). Ubuntu 24.04, OpenVPN installiert, kein konfiguriertes Client-Profil oder aktiver VPN-Dienst gefunden. Die erfolgreiche Mac-Prüfung ist kein Nachweis einer Server-Verbindung.

## Was der Code vorbereitet

`AI_PROVIDER=hda` wählt den neuen Open-WebUI-Adapter. `AI_ENABLED=true`, `HDA_MODEL=qwen3-30b-a3b-instruct-2507`, Schlüsseldatei `/run/d21-ai/hda-api-key` im bestehenden read-only Secret-Verzeichnis. Für bestehende Installationen bleiben die bisherigen Konfigurationswerte kompatibel. Ohne ausdrückliche Umschaltung wird der Hochschuldienst nicht aktiviert.

Fragen nutzen das OpenAI-kompatible `messages`-Format inklusive des begrenzten eigenen KI-Verlaufs. Keine Tools, Datei-Uploads, serverseitigen Funktionsaufrufe oder Websuche angefordert. Die Hochschulinstallation und gewählte Modellkonfiguration bestimmen den eigentlichen Modellbetrieb; aus dem API-Host wird kein ungeprüftes Versprechen über sämtliche nachgelagerten Verarbeiter abgeleitet.

Modellbefehle verlangen genau ein JSON-Objekt gemäß dem bestehenden erlaubten Schema. Der Adapter setzt keine nicht verifizierte native Schema-Funktion der Hochschule voraus. Die Antwort wird serverseitig strikt geprüft. Markdown, ungültige Aktionen/Farben, Tool-Aufrufe, abgeschnittene Antworten und eingebettete Denkblöcke werden abgewiesen. Eine Antwort löst keine Modellaktion aus; vorhandene Vorschau/Bestätigung bleibt erforderlich.

API-Status und Antwort liefern `provider`/`provider_name`. Die App zeigt den tatsächlichen Anbieter im Übertragungsschalter an. Hochschul-Anfragen benötigen zusätzlich `consent_provider:"hda"`; alte App-Versionen mit ausschließlich Google-beschriftetem Schalter können nicht stillschweigend Daten an die Hochschule senden. Anbieter und Modell sind an den Kontext-Hash gebunden; ein Wechsel verlangt erneute Prüfung/Zustimmung. Der Viewer fragt die Anbieterinformation über die native Brücke ab, ohne den API-Key zu erhalten.

Gebäuderechte, private Verläufe, Wiederholschutz und gemeinsame Ansichtsänderungen bleiben erhalten. Die eigenen Limits von 20 Anfragen je Konto, 100 je Projekt/24 Stunden, drei je Konto/Minute und zwei gleichzeitig wurden nicht entfernt. HDA-Fehler verursachen keinen automatischen Anbieterwechsel.

## Noch erforderlich für die Aktivierung

Ein **eigener Serverzugang** ins Hochschulnetz: ein für diesen Betrieb ausgestelltes VPN-Profil samt nötiger Authentifizierung oder eine Freigabe des Serverzugriffs durch die Hochschule. Keine Mac-Sitzung oder deren private VPN-Schlüssel übernehmen. Persönliche VPN-Sitzungen können eine Erneuerung der Anmeldung erfordern; für dauerhaft unbeaufsichtigten Betrieb mit der Hochschule abklären.

Ein vorhandenes OpenVPN-/WireGuard-Profil ausschließlich geschützt außerhalb des Repositories ablegen. Vor Aktivierung Routen prüfen: Der Server muss für SSH, Website und Cloudflare erreichbar bleiben; kein ungeprüfter Wechsel der Standardroute. Bei Bedarf nur den API-Verkehr über einen getrennten Tunnel führen. Keine VPN-Verbindung wurde in diesem Schritt erfunden oder als eingerichtet beschrieben.

Nach berechtigter Einrichtung:

1. Vom Server `GET /api/models` authentifiziert testen, TLS prüfen und Redirects weiter ablehnen. Keine Secrets als Kommandozeilenargumente/URLs ausgeben.
2. Gewähltes Modell vom Server mit synthetischem Text und JSON-Befehlen testen.
3. Nur nicht geheime Konfiguration in der geschützten Server-`.env` auf `AI_PROVIDER=hda`, `AI_ENABLED=true`, geprüftes `HDA_MODEL` stellen. Keine Änderungen am produktiven Code direkt auf dem Server.
4. Nach GitHub-PR ausschließlich `d21-deploy` einsetzen. Datenbank-Container/Volume erhalten. Neue App über Xcode installieren.
5. Live-Test mit Testkonto, privatem KI-Verlauf und bestätigtem Modellvorschlag. Erst danach die h_da-Verbindung als produktiv eingerichtet bezeichnen.

## Quellen

- Von Felix bereitgestellte Hochschul-Anleitung, „DokumentationOWUI-API-1.0.pdf“, Version 1.0.
- [Open WebUI: API-Endpunkte](https://docs.openwebui.com/reference/api-endpoints/)
- [eduVPN: Konfigurationsdownload und OpenVPN/WireGuard für Linux](https://docs.eduvpn.org/server/v3/client-compat.html)
