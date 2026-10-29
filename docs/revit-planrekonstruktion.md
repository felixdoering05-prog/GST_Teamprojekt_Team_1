# Planrekonstruktion und Raumgeometrie: Arbeitsstand 29.10.2026

**Status: Quellen lokal gesichtet, Revit-Verbindung geprüft, API-Ergänzung kompiliert. Gebäudemodell noch nicht erstellt. Keine RVT-/IFC-Ausgabe und keine fachliche Modellabnahme.**

## Auftrag und Arbeitsregeln

Für „KI trifft Gebäude“ soll aus Grundrissen, Schnitten und Ansichten ein neues natives Revit-Projekt entstehen: zuerst ein prüfbares Geschoss, danach weitere ausreichend dokumentierte Geschosse. Erforderlich sind Ebenen, Wände, Geschossdecken, gehostete Türen/Fenster, Dach und geschlossene Räume mit Originalnummern/-namen. Ziel sind eine geprüfte RVT und ein IFC-Export mit `IfcSpace` einschließlich Raumgeometrie für eine spätere raumweise Lichtsimulation.

Es werden keine Maße, Geschosshöhen oder Schichtaufbauten erfunden. Ein vorhandenes IFC darf nur zusätzliche Referenz sein. Originaldateien werden nicht überschrieben. Diese Dokumentation ist ein Entwicklungsstand und kein freigegebenes Teamprotokoll.

Arbeitsbranch: `revit/planpruefung-api-workflow-2026-10-29`. Der vollständige Repositorybaum wurde auf `AGENTS.md` geprüft; keine solche Datei war auf dem geprüften Ausgangsstand enthalten. `CONTRIBUTING.md`, Revit-Register und PR-Vorlage wurden gelesen. Ausgangsstand: `e4897d24ba96750e542ace411eaef48433c0df15`. Der Git-Transport war aus der lokalen Shell nicht erreichbar; Branch und PR werden über den verfügbaren GitHub-Connector erstellt.

## Tatsächlich durchgeführt

| Schritt | Ergebnis | Grenze |
| --- | --- | --- |
| Quellen finden | Zunächst mehrdeutiges „c“ beim Auftraggeber erfragt; anschließend sechs konkrete lokale PDF-Pfade erhalten und alle Dateien gefunden | Kein maßgebliches zusätzliches IFC benannt |
| Pläne sichten | Je eine Seite: UG, EG, 1. OG, 2. OG, 3. OG sowie Süd-/Nordansicht; sämtliche Seiten lokal gerendert und visuell geprüft | Vollständige Maß- und Raumtranskription noch offen |
| Planstände prüfen | EG/1. OG: Ausführungsplanung, 20.11.2025, 1:50. B-Grundrisse: 26.02.2025, 1:100. Ansicht B-04 ebenfalls 1:100 | Unterschiedliche Planverfasser und Stände; gemeinsame Verwendung noch nicht bestätigt |
| Revit prüfen | Installierte `Revit.exe`, laufender Prozess, erfolgreiches MCP-Ping und Versionsabfrage: Revit 2027.3, Build 27.3.0.28, Deutsch | Lesen erfolgreich; Modelländerungen in dieser Sitzung nicht ausgeführt |
| Aktiven Arbeitsstand schützen | Aktives Dokument „Projekt2“, kein gespeicherter Pfad, `isModified=true`; keine Modellmutation ausgeführt | Es ist kein nachweislich neues Projekt für diesen Auftrag |
| Bedienweg prüfen | Revit-Fenster ermittelt und visuell eingesehen; native Erstellungsbefehle im Connector vorhanden | UI-Barrierefreiheit liefert keinen Elementbaum; neue Datei, SaveAs und IFC-Export fehlen als Connectorbefehle |
| API-Lücke vorbereiten | [Quellcode und Ausführungsanleitung](revit-api-workflow/README.md) für neues Projekt, Raumprüfung, SaveAs, IFC und Wiederöffnungsprüfung | Kompiliert, nicht installiert oder in Revit ausgeführt |
| Quellen schützen | Prüfbilder und SHA256-Quellenregister ausschließlich lokal gehalten | Keine Freigabe für Upload von Plänen, Auszügen, Detailtranskriptionen oder Modellen geklärt |

Zum Rendern wurde die vorhandene Windows-PDF-API verwendet. Python/Poppler waren nicht über die verfügbaren Befehle erreichbar; die Quell-PDFs wurden nicht verändert oder an einen PDF-Clouddienst übertragen. Ein zunächst gefundener älterer Hausmodell-Zwischenstand gehört nicht nachweislich zu diesen Quellen und wird nicht übernommen.

## Wesentliche offene Punkte und Rückfragen

1. **Schnitte und Höhen:** Die Grundrisse verweisen auf Schnitte A–D; diese liegen nicht in den sechs gelieferten Dateien. Dateipfade oder eine belegte Tabelle mit OKFF/OKRD je Geschoss, lichten Höhen, Deckenstärken und Dachhöhen/-aufbau wurden angefragt. Einzelne Höhenmarken der Ansichten ersetzen diese Zuordnung nicht.
2. **Planpriorität:** Bestätigen, ob die neueren EG-/1.-OG-Ausführungspläne mit den älteren B-Plänen für die übrigen Geschosse kombiniert werden dürfen. Unterschiedliche Außenkonturen zwischen Geschossen sind nicht automatisch ein Widerspruch; Rücksprünge, Anbauten und Dachaufkantungen müssen anhand der jeweiligen Bezugskanten abgeglichen werden.
3. **Bauteildefinitionen:** Gesamtdicken, Rohbau-/Fertigkanten, Deckenhöhen, Öffnungsmaße, Brüstungen und Dachanschlüsse belegen. Bei unbekannten Schichten keine erfundenen Materialien oder Schichtdicken anlegen. Unbemaßte Öffnungen bleiben offen.
4. **Räume:** Originalraumliste je abgestimmtem Geschoss erstellen, mit Nummer, Bezeichnung, planlicher Fläche als Kontrollwert und Quellenverweis. Fehlende Nummern nicht automatisch vergeben. Raumobergrenzen und Raumphase ausdrücklich prüfen.
5. **Modellablage und Abnahme:** Lokale Arbeitsablage ist vorbereitet; gemeinsame Teamablage und Maßtoleranzen sind noch festzulegen. [Projektsteckbrief](projektsteckbrief.md), [Modellregister](../revit/modelle/README.md) und [Exportregister](../revit/exporte/README.md) erst mit einem tatsächlich erzeugten, eindeutig bezeichneten Stand aktualisieren.
6. **Freigabe:** Das Repository ist öffentlich. Für Baupläne, Modellgeometrie, Screenshots oder abgeleitete detaillierte Raum-/Maßtabellen ist die Weitergabe nicht geklärt. Dieser Branch enthält ausschließlich allgemeine Dokumentation und selbst verfassten Workflow-Quellcode.

## Nächste Schritte nach Klärung

1. Quellenregister und vollständige Maß-/Raumliste lokal fertigstellen; Planstände priorisieren. Unklarheiten je Blatt/Bezugskante erfassen.
2. Neues Projekt aus geprüfter RTE erstellen, eigener eindeutiger lokaler Dateiname. Vorlagenebenen nicht als Gebäudehöhen übernehmen.
3. EG als vorgeschlagenes Prototypgeschoss verwenden, sobald seine Höhen- und Bauteilbezüge belegt sind. Native Elemente in kleinen Paketen erzeugen und direkt zurücklesen. Tür-/Fensterfamilien müssen passende Wandhosts und belegte Öffnungsabmessungen besitzen.
4. Räume anlegen, originale Nummern/Namen zuordnen und geschlossene Begrenzungen sowie positive 3D-Körper prüfen. Jede Planraumposition muss genau einem gültigen Revit-Raum entsprechen.
5. Prototyp anhand von Außenmaßen, Innenmaßketten, Wanddicken, Öffnungen, Höhen und Raumliste gegenprüfen. Kein automatisches Fortschreiben bei offenen Abweichungen.
6. Weitere ausreichend dokumentierte Geschosse und Dach ergänzen. Keine pauschale Kopie von EG-Geometrie oder angenommenen Regelgeschosshöhen.
7. Neue RVT speichern; gespeicherten Stand wieder öffnen und native Kategorien/Raumdaten prüfen. IFC4 mit Raumbegrenzungen exportieren und unabhängig jede `IfcSpace`-Instanz samt 3D-Body, positivem Volumen, Nummer/Name und Geschosszuordnung prüfen.
8. IFC in der Ziel-App raumweise auswählen und Geometrie gegenprüfen. Erst dann Modell-/Exportregister mit realen Dateien und Prüfbericht ergänzen.

## Prüfnachweis dieses Branches

- Sechs lokale PDFs gefunden; jeweils eine Seite gerendert, Gesamtseiten und Schriftfelder visuell gesichtet; Quellenhashes lokal gesichert.
- Revit-Version, aktives Dokument und Connectorantworten gelesen. Kein schreibender Modellbefehl ausgeführt.
- API-Ergänzung gegen die installierte Revit-API 2027.3 mit .NET SDK 10.0.402 gebaut: **0 Warnungen, 0 Fehler**. Manifestvorbereitung erfolgreich. DLL und generiertes Manifest bleiben lokal.
- Laufzeitprüfung des Add-ins, vollständiger Planabgleich, neue RVT, Modellvollständigkeit, IFCSPACE-Geometrieprüfung und Ziel-App-Test: **noch offen**.
- Pull Request zur technischen Durchsicht; keine Zusammenführung und keine Veröffentlichung von Plänen oder Modellen.
