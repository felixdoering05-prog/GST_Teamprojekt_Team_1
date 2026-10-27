<div align="center">

# KI TRIFFT GEBÄUDE

### [🌐 D21-Dashboard öffnen](https://filling-vendor-verification-hop.trycloudflare.com)

Zugang passwortgeschützt · Temporäre Testadresse; kann sich bei einem Tunnel-Neustart ändern.

GST · Teamprojekt 1
### Revit × Künstliche Intelligenz

**Modellieren. Untersuchen. Nachvollziehbar dokumentieren.**

[Protokolle](docs/protokolle/README.md) · [Projektablauf](docs/projektablauf.md) · [Verantwortlichkeiten](docs/verantwortlichkeiten.md) · [Projektüberblick](docs/projektsteckbrief.md) · [Aufgabenplan](docs/aufgabenplan.md) · [Zusammenarbeit](CONTRIBUTING.md) · [Ergebnisse](ergebnisse/README.md)

</div>

---

## Unser Projekt

Dieses Repository bündelt die Arbeit von **Team 1 am GST-Teamprojekt mit Revit und KI**: Projektplanung, Modellstände, KI-Prompts, Experimente und Ergebnisse erhalten einen gemeinsamen, nachvollziehbaren Platz.

> **Stand: Projektstart.** Die Struktur steht. Forschungsfrage, Anwendungsfall, Zuständigkeiten und Termine werden gemeinsam festgelegt. Die folgenden Arbeitsschritte sind ein Vorschlag für die Teamplanung.

## Was wir untersuchen wollen

Als Ausgangspunkt bietet sich an, einen klar begrenzten Arbeitsschritt im Revit-Kontext mit KI zu unterstützen und das Ergebnis mit einer manuellen Bearbeitung zu vergleichen. Welcher Arbeitsschritt dafür geeignet ist, entscheidet das Team.

| Baustein | Leitfrage | Ablage |
| :--- | :--- | :--- |
| **Revit** | Welches Modell und welche Informationen benötigen wir? | [`revit/`](revit/README.md) |
| **KI** | Welche Aufgabe soll die KI unterstützen? | [`ki/`](ki/README.md) |
| **Bewertung** | Wie prüfen wir Qualität, Fehler und Aufwand? | [`ki/experimente/`](ki/experimente/VORLAGE.md) |
| **Dokumentation** | Was haben wir gemacht und gelernt? | [`docs/`](docs/projektsteckbrief.md) |
| **Abgabe** | Welche Ergebnisse können wir belegen? | [`ergebnisse/`](ergebnisse/README.md) |

## In drei Schritten starten

1. **Projekt abstecken:** Im [Projektsteckbrief](docs/projektsteckbrief.md) Ziel, Team und Rahmenbedingungen ergänzen.
2. **Arbeit verteilen:** Im [Aufgabenplan](docs/aufgabenplan.md) Verantwortliche und Termine festlegen.
3. **Ersten Versuch dokumentieren:** Einen [Prompt](ki/prompts/VORLAGE.md) und ein [Experimentprotokoll](ki/experimente/VORLAGE.md) kopieren und mit einem kleinen Beispiel beginnen.

## So ist das Repository aufgebaut

```text
GST_Teamprojekt_Team_1/
├── docs/                  Projektsteckbrief, Aufgaben und Entscheidungen
├── revit/
│   ├── modelle/           Hinweise auf freigegebene Modellstände
│   └── exporte/           Hinweise auf Exporte und ihre Herkunft
├── ki/
│   ├── prompts/           Versionierte Prompts
│   └── experimente/       Versuche, Prüfungen und Vergleichsergebnisse
├── daten/beispiele/       Kleine, freigegebene Beispieldaten
├── ergebnisse/            Geprüfte Resultate und Abgabeübersicht
└── .github/               Vorlagen für Aufgaben und Pull Requests
```

## Unser Arbeitsablauf

**Aufgabe festlegen → Änderung im eigenen Branch → Ergebnis prüfen → Pull Request → Teamreview**

Die [Regeln zur Zusammenarbeit](CONTRIBUTING.md) erklären Dateinamen, Reviews und den Umgang mit Revit-Dateien. Große Binärdateien werden zunächst außerhalb von Git verwaltet; die jeweilige Ablage wird im Repository dokumentiert.

## Nächster Meilenstein

**M1 · Projektumfang abgestimmt**

- [ ] Forschungsfrage und konkreten Anwendungsfall auswählen
- [ ] Bewertungsmaßstäbe festlegen
- [ ] Rollen und Termine eintragen
- [ ] Revit-Version und Modellablage abstimmen

Die vollständige Planung findet ihr im [Aufgabenplan](docs/aufgabenplan.md).

---

*Arbeitsstand und Ergebnisse werden transparent dokumentiert. KI-Ausgaben gelten erst nach fachlicher Prüfung als Projektergebnis.*

## Projektorganisation und Leistungsnachweise

- [Sitzungsprotokoll anlegen](docs/protokolle/README.md): Vorlage kopieren, Beschlüsse und Aufgaben festhalten, gegenlesen lassen.
- [Projektablauf](docs/projektablauf.md): Wochenrhythmus, Meilensteinfreigaben und Abschlusskriterien.
- [Verantwortlichkeiten](docs/verantwortlichkeiten.md): Team, Rollen und Vertretung gemeinsam bestätigen.
- [Leistungsnachweise](docs/leistungsnachweise.md): eigene Beiträge, Quellen und KI-Nutzung belegen.
- [Abgabecheckliste](docs/abgabecheckliste.md): Vollständigkeit und reproduzierbaren Abgabestand prüfen.

Die Hochschulvorgaben, verbindlichen Termine und endgültigen Rollen sind noch offen. Vorlagen sind keine bereits erbrachten Leistungen oder abgehaltenen Sitzungen.
