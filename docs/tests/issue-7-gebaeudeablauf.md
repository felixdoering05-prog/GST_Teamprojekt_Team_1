# Testprotokoll: Gebäudeliste und Detailansicht (Issue #7)

**Stand:** 2. November 2026  
**Umsetzung:** [PR #49](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/49)

## Prüfergebnisse

| Prüfung | Ergebnis | Nachweis |
|---|---|---|
| Produktionsbuild | Bestanden | `npm run build` in `dashboard/base44-frontend`; Vite-Build abgeschlossen |
| Gebäudeliste → D21 öffnen → Name/Adresse prüfen → zurück | Noch nicht ausgeführt | Lokaler UI-Aufruf war nicht möglich: Docker ist in der Testumgebung nicht installiert; die Browser-Vorschau ließ sich nicht erreichen |
| Screenshots von Liste, Detailansicht und Rückkehr | Ausstehend | Nach manuellem UI-Durchlauf ergänzen |

## Manueller Prüfschritt

1. App mit einem Testkonto öffnen und **Gebäude & Räume** aufrufen.
2. Prüfen, dass die Gebäudeliste den Eintrag **D21** mit Name und Adresse zeigt.
3. D21 öffnen und in der Detailansicht Name und Adresse prüfen.
4. **Zur Gebäudeliste** wählen und kontrollieren, dass die Liste wieder erscheint.
5. Screenshots der Liste, Detailansicht und Rückkehr aufnehmen und bei Issue #7 ergänzen.

## Grenzen

Der erfolgreiche Build prüft die Kompilierung der Oberfläche, aber nicht den Laufzeittest mit Backend und Datenbank. Die manuelle Ablaufprüfung und Screenshot-Nachweise sind ausdrücklich noch offen. Es wurden keine realen Gebäudedaten oder Zugangsdaten verwendet.
