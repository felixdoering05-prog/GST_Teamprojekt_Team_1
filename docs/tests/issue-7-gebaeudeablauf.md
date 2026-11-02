# Testprotokoll: Gebäudeliste und Detailansicht (Issue #7)

**Stand:** 2. November 2026  
**Branch:** `feat/issue-7-building-detail-flow`  
**PR:** [#49](https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/pull/49)

## Geprüfter Stand

| Prüfung | Ergebnis | Nachweis |
|---|---|---|
| Produktionsbuild der PR-Version | Bestanden | `npm run build` in `dashboard/base44-frontend`; Vite-Build abgeschlossen |
| Gebäudeliste → D21 öffnen → Name/Adresse prüfen → zurück | Noch nicht ausgeführt | Lokaler UI-Aufruf war nicht möglich: Docker ist in der Testumgebung nicht installiert; die Browser-Vorschau ließ sich nicht erreichen |
| Screenshots von Liste, Detailansicht und Rückkehr | Ausstehend | Erst nach manuellem UI-Durchlauf ergänzen |

## Manueller Prüfschritt

1. App mit einem Testkonto öffnen und **Gebäude & Räume** aufrufen.
2. Prüfen, dass die Gebäudeliste den Eintrag **D21** mit Name und Adresse zeigt.
3. D21 öffnen und in der Detailansicht Name und Adresse prüfen.
4. **Zur Gebäudeliste** wählen und kontrollieren, dass die Liste wieder erscheint.
5. Screenshots der Liste, der Detailansicht und der Rückkehr aufnehmen und bei Issue #7 ergänzen.

## Grenzen dieses Protokolls

Der erfolgreiche Build prüft die Kompilierung der Oberfläche, aber nicht den Laufzeittest mit Backend und Datenbank. Die manuelle Ablaufprüfung und die Screenshot-Nachweise sind daher ausdrücklich noch offen. Es wurden keine realen Gebäudedaten oder Zugangsdaten verwendet.
