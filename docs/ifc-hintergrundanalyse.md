# IFC-Hintergrundanalyse · App 1.0.125

Ausgangspunkt: GitHub main 2590a8c, App 1.0.124. Neuer isolierter Dienst `ifc-worker`, kein externer KI-Aufruf. Ein Worker verarbeitet automatisch vorhandene und neue IFC-Dokumente: Uploads, Raumscans und nach Nutzerfreigabe übernommene Planentwürfe. Originaldateien bleiben unverändert.

## Installierte Werkzeuge

- IfcOpenShell 0.9.0.post1: IFC-Lesen und Schema-Basisprüfung.
- IfcTester 0.9.0: IDS-Regeln für Namen vorhandener Räume/Geschosse.
- IfcClash und IfcDiff 0.9.0: installiert für spätere explizite Kollisions-/Versionsprüfungen, im Basislauf noch nicht ausgeführt.
- Psycopg 3.3.9: PostgreSQL-Verbindung.

Upstream: https://github.com/IfcOpenShell/IfcOpenShell und https://docs.ifcopenshell.org/ifctester.html. Lizenzhinweise der Pakete liegen unverändert im Container; die Werkzeuge haben komponentenabhängige Lizenzen. Keine pauschale MIT-Lizenz annehmen.

## Verhalten und Grenzen

Der Bericht enthält Schema, Typzahlen, Längeneinheit, bis zu 500 Raumkennungen/-namen/Geschosse, Strukturhinweise, IDS-Ergebnisse und SHA-256 der Quelle. Der Assistent bekommt höchstens 30 Räume des ausgewählten, zugänglichen Dokuments. Daten bleiben unzuverlässige Kontextdaten, keine Anweisungen.

App: Gebäudedatei → Aktionen → Modellprüfung. Berichte werden bei Öffnen bzw. manueller Aktualisierung geladen. Kein automatisches Reparieren, keine erfundenen Raumgrenzen, keine garantierte Vermessungsgenauigkeit. Schema-Prüfung ohne EXPRESS-Regeln ist keine vollständige fachliche IFC-Abnahme. Fehlende Räume werden als Hinweis dargestellt, nicht generiert.

Pro Modell maximal 120 Sekunden Analyse, 500.000 IFC-Einträge (nach Messung des vorhandenen Campusmodells mit rund 308.000 Einträgen; Typzählung ohne zusätzliche Entitätenliste) und 512 KiB Ausgabe; Container 768 MiB, 0,5 CPU, schreibgeschützt, temporärer Speicher 96 MiB, ohne Host- oder API-Schlüssel-Mount. Ein Datenbank-Lock verhindert parallele Worker. Fehlgeschlagene Aufträge werden nicht endlos wiederholt. Gelöschte Dokumente löschen den Bericht per FK-Kaskade; ein spätes Worker-Ergebnis legt ihn nicht erneut an.

API: GET /api/v1/documents/:id/analysis, bestehende Kontositzung und Gebäudefreigabe erforderlich, private/no-store. Tabelle app_ifc_analysis additiv; Originaldateien werden nicht migriert oder ersetzt.

## Noch separat umzusetzen

Die umfangreichere Recherche-Roadmap ist hiermit nicht vollständig umgesetzt: Plan-Überlagerung und Maßstabskorrektur, geometrische Raumflächen/geschlossene Grenzen, gezielte Kollisionsprüfung, Modellversionsvergleich, Fragments-Viewer-Benchmark und eigene trainierte Grundrisserkennung bleiben separate Entwicklungsschritte. Auch noch nicht freigegebene Generierungsentwürfe werden in diesem ersten Worker nicht geprüft; die vorhandene Entwurfsprüfung bleibt bestehen.

Validierung: 150 Backendtests, 3 synthetische Python-IFC-Prüfungen, iOS-Simulator-Build. Physischer iPhone-Test und TestFlight-Upload sind separat.
