# Feste Adresse kitrifftgebäude.de

Die App und der Projektserver laufen künftig unter **https://kitrifftgebäude.de** statt über die wechselnde Cloudflare-Schnelltunnel-Adresse.

- Punycode (technische Schreibweise): `xn--kitrifftgebude-gib.de`. Die App speichert die Adresse so. Browser zeigen meist die Umlaut-Form.
- App-API: `https://kitrifftgebäude.de/app-api/v1/...` → im Web-Container `/api/v1/...`
- Öffentlich: `/datenschutz.html`. Alles andere (Dashboard) bleibt hinter dem Website-Passwort.
- `www.kitrifftgebäude.de` leitet auf die Hauptadresse um, sobald dafür DNS gesetzt ist.

## Aufbau auf dem Server

```
iPhone ──HTTPS──▶ nginx (Host, :443, Let's-Encrypt-Zertifikat)
                   ├─ /app-api/v1/      ─▶ 127.0.0.1:8088/api/v1/ (d21_web → d21_api)
                   ├─ /datenschutz.html ─▶ 127.0.0.1:8088
                   └─ /                 ─▶ 127.0.0.1:8088 (Website-Passwort)
```

Die Regeln sind dieselben wie im Tunnel (`/etc/nginx/conf.d/d21-tunnel.conf`). `dashboard/ops/configure-domain.py` übernimmt die Blöcke direkt aus `configure-mobile-api.py` und `configure-public-privacy.py`. So weichen die beiden Zugänge nicht voneinander ab.

Tunnel (`d21-tunnel`) und IP-Zugang bleiben zunächst bestehen. Ältere App-Versionen und schon eingerichtete Home-Assistant-Integrationen funktionieren so weiter. Den Tunnel erst abschalten, wenn alle Geräte 1.0.133 oder neuer haben.

## Einrichtung

1. **DNS bei STRATO** (Felix im Browser, siehe unten).
2. Prüfen: `dig +short A xn--kitrifftgebude-gib.de` liefert `185.56.151.249`.
3. Auf dem Server (nach `git pull` bzw. Deploy):
   ```bash
   python3 /opt/gst/dashboard/ops/configure-domain.py          # Trockenlauf
   python3 /opt/gst/dashboard/ops/configure-domain.py --apply  # Zertifikat + nginx
   ```
   certbot erneuert das Zertifikat automatisch (`certbot.timer`). Danach lädt nginx neu.
4. Test: `curl -si https://xn--kitrifftgebude-gib.de/app-api/v1/auth/me` → 401 mit JSON-Fehler (API erreichbar, ohne Sitzung kein Zugriff). `https://xn--kitrifftgebude-gib.de/datenschutz.html` → 200.

## STRATO: A-Record setzen (Schritt für Schritt)

Das Uhr-Symbol in der Domainverwaltung heißt: STRATO richtet die Domain noch ein. Bei der Registry (DENIC) ist sie am 16.11.2026 schon aktiv, und die STRATO-Nameserver antworten. Solange die Uhr zu sehen ist, sind die DNS-Einstellungen eventuell noch gesperrt. Dann später noch einmal versuchen.

1. Bei STRATO anmelden → links **Domains** → **Domainverwaltung**.
2. Bei `kitrifftgebäude.de` auf das Zahnrad bzw. **Verwalten** klicken.
3. Reiter **DNS** öffnen.
4. Bei **A-Record** auf **verwalten** klicken.
5. **Andere IP-Adresse** wählen (nicht „STRATO-Server“) und `185.56.151.249` eintragen. Speichern.
6. Bei **AAAA-Record** (IPv6): keinen Eintrag setzen. Falls dort einer steht, entfernen bzw. „deaktivieren“ wählen. nginx lauscht auf dem Server nur auf IPv4. Ein AAAA-Eintrag würde iPhones mit IPv6 ins Leere schicken.
7. **MX-Record**, **TXT**, **CNAME** nicht ändern.
8. Optional `www`: In der Domainverwaltung bei der Domain **Subdomain anlegen** → `www`. Danach für die Subdomain ebenfalls A-Record → `185.56.151.249`. Anschließend das Skript erneut mit `--apply` starten, damit das Zertifikat `www` mit abdeckt. Nur machen, wenn STRATO das ohne Zusatzkosten anbietet.
9. Kein SSL-Zertifikat bei STRATO kaufen. Das Zertifikat kommt kostenlos von Let's Encrypt auf unserem Server.

Bis die Änderung überall angekommen ist, dauert es meist 5–60 Minuten.

## App (ab 1.0.133)

- `AccountModel.projectServer = "https://xn--kitrifftgebude-gib.de"`
- Wer noch mit der alten Tunnel-Adresse verbunden ist, wird beim Start einmalig umgezogen. Die Anmeldung zieht im Schlüsselbund auf den neuen Origin um, lokale Entwürfe folgen nach dem Laden der Gebäude. Ein erneutes Anmelden ist nicht nötig. Das ist nur für die fest hinterlegte alte Projektadresse erlaubt. Fremde Server bleiben strikt an ihren Origin gebunden (`CredentialScope`).
- ATS: Es gibt keine Ausnahmen. Let's Encrypt ist ein normales vertrauenswürdiges Zertifikat.
- Home Assistant: Die App zeigt als Brückenadresse jetzt `https://xn--kitrifftgebude-gib.de/app-api/v1`. Bestehende Integrationen mit Tunnel-Adresse laufen weiter, solange der Tunnel läuft. Bei Gelegenheit neu koppeln.
