# Revit-API-Ergänzung für die Planrekonstruktion

Stand 29.10.2026. Abschließender Review-Build gegen die lokal installierte Revit-API 2027.3 und .NET SDK 10.0.402: 0 Warnungen, 0 Fehler. Die ExternalCommands in `Commands.cs` wurden noch nicht installiert oder als Befehle ausgeführt. Die zusätzlichen Klassen in `Prototype.cs` und `Expand.cs` wurden aus Dynamo aufgerufen und haben tatsächlich lokale RVT-/IFC-Arbeitsstände erzeugt. Ergebnis und Grenzen stehen in der [Arbeitsdokumentation](../revit-planrekonstruktion.md).

## Tatsächlich ausgeführter Dynamo-Weg

`GstRevitWorkflowV2.Prototype.Run(UIApplication, inputPath)` erstellt den initialen Teilprototyp mit nativem Flächenvergleich. `GstRevitExpansion.Expand.Run(UIApplication, inputPath)` ergänzt den vorhandenen Prototyp, protokolliert Flächenabweichungen und speichert einen neuen Arbeitsstand. Beide Methoden benötigen lokale, quellengeprüfte Eingabe-JSONs; Gebäudekoordinaten und Raumlisten sind bewusst nicht im Repository enthalten. Die aktuelle Raumobergrenze ist grafisch abgeleitet und bleibt vorläufig. Die Ergänzung erzeugt bislang Wände und Räume; Türen, Fenster, Decken und Dach fehlen.

Für den Lauf wurde das bereits installierte Dynamo/PythonNet3 verwendet: `TransactionManager.Instance.ForceCloseTransaction()`, DLL über `clr.AddReference` laden und die jeweilige statische Methode mit `DocumentManager.Instance.CurrentUIApplication` aufrufen. Die lokal vorbereiteten `.dyn`-Dateien enthalten die passenden Pfade und bleiben außerhalb des Repositorys. Ohne diese lokalen Quelldaten ist der Code ein ausführbarer Importer, keine automatisch vollständige Rekonstruktion aus beliebigen PDFs.

Der initiale Lauf wurde wegen eines schreibgeschützten Raumparameters zurückgerollt. Der korrigierte Code nutzt `ROOM_UPPER_LEVEL` und `ROOM_UPPER_OFFSET`. Aktive Revit-Ansichten müssen nach der Dynamo-Auswertung über die Oberfläche oder den Connector gewechselt werden.

Die tatsächlichen IFC-Ausgaben wurden anschließend unabhängig geprüft:

```powershell
node .\check-ifc-spaces.mjs "<lokale IFC>" "<lokaler Revit-Prüfbericht pruefung.json>" "<lokaler Ausgabebericht ifc-pruefung.json>"
```

Der Prüfer akzeptiert hier verwendete vertikale Rechteck-/Polygonextrusionen, kontrolliert positive Geometrie, Geschosszuordnung und Flächen-/Volumenübereinstimmung mit Revit und verweigert unbekannte Geometrietypen. Er beweist keine Vollständigkeit oder fachliche Planrichtigkeit.

Die erreichbaren MCP-Werkzeuge erzeugen native Ebenen, Wände, Geschossdecken, Räume, gehostete Türen/Fenster und rechteckige Dächer. Eigene Werkzeuge für neues Projekt, SaveAs und IFC-Export fehlen im angebotenen Werkzeugbestand. Diese Ergänzung schließt diese drei Lücken. Sie rekonstruiert keine Geometrie aus PDF und enthält keine Gebäudemaße. Modellierung und fachlicher Planabgleich bleiben separate Arbeitsschritte; die vollständige Gebäuderekonstruktion ist noch offen.

## Vorbereiten und ausführen

1. Windows mit Revit 2027, .NET SDK 10 und einer geprüften RTE-Projektvorlage verwenden. Die DLL ist für Revit 2027 gebaut, nicht für andere Hauptversionen.
2. Im Verzeichnis dieser Datei ausführen:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Prepare-Addin.ps1
   ```

   Das Skript baut die DLL und erzeugt daneben ein Manifest mit absolutem DLL-Pfad. Die ExecutionPolicy gilt nur für diesen Prozess. Das Skript installiert nichts, lädt keine Pakete aus Drittquellen und verändert keine Revit-Projekte.
3. Nach Prüfung des Quellcodes das erzeugte `GstRevitWorkflow.addin` nach `%APPDATA%\Autodesk\Revit\Addins\2027\` kopieren. Die DLL im Build-Verzeichnis belassen. Vor einem Revit-Neustart offene Projekte separat sichern; der aktuelle ungespeicherte Arbeitsstand darf nicht verloren gehen. Das Add-in wurde in dieser Arbeitssitzung bewusst noch nicht installiert oder geladen.
4. Revit starten. Unter **Zusatzmodule / Externe Werkzeuge** den Befehl **GST Neues Projekt** aufrufen. RTE und lokale Arbeitsablage außerhalb des Repositorys auswählen. Er legt eine neue Datei mit eindeutiger Kennung `GST-Prototyp-….rvt` an und aktiviert sie. Das ist nur eine neue Projektdatei, noch kein Gebäudemodell. Ein vorhandenes aktives Projekt wird nicht überschrieben oder geschlossen.
5. Erst nach Klärung von Höhen und Planständen das Prototypgeschoss mit nativen Revit-Elementen modellieren und anhand des Planes abnehmen. Weitere belegte Geschosse danach ergänzen.
6. Im eigenen Prototyp **GST Raumpruefung RVT IFC** ausführen. Der Befehl verweigert andere Dateinamen, Familien, Zentralmodelle, schreibgeschützte Projekte und offene Transaktionen. Die Dateinamenprüfung verhindert versehentliches Speichern eines beliebigen aktiven Projekts; sie ersetzt keine fachliche Prüfung.
7. Einen lokalen Ausgabeordner außerhalb des Repositorys auswählen. Ein neuer Unterordner mit eindeutiger Kennung enthält bei Erfolg `GST-Modell.rvt`, `GST-Modell.ifc`, eine bytegleiche RVT-Prüfkopie und `pruefung.json`. Keine bestehenden Ausgaben werden überschrieben. Die aktive Prototypdatei wechselt durch SaveAs auf den neuen Modellpfad; die ursprüngliche Datei bleibt auf der Platte erhalten.

Bei Fehlern können unvollständige Ausgaben im neuen Ordner verbleiben. Ohne erfolgreichen Bericht und die folgenden unabhängigen Prüfungen gelten sie nicht als abgenommen. Vor einem erneuten Versuch den letzten korrekten Prototyp öffnen.

## Modellierung nach Klärung der Quelldaten

Für jedes Element zuerst einen lokalen Quellenverweis mit Blatt, Index, Seite, Maßkette und Bezugskante hinterlegen. Meter mit `UnitUtils.ConvertToInternalUnits(..., UnitTypeId.Meters)` konvertieren; keine Planpixel als unkontrollierte Meter interpretieren.

| Schritt | Native API bzw. vorhandener Connector | Erforderliche Eingabe |
| --- | --- | --- |
| Ebenen | `Level.Create` / `revit_create_level` | Belegte Höhen einschließlich OKFF/OKRD-Bezug |
| Wände | `Wall.Create` / `revit_create_wall` | Kontur/Achsbezug, Gesamtdicke, Ober-/Unterkante; keine erfundenen Schichten |
| Geschossdecken | `Floor.Create` / `revit_create_floor` | Geschlossene Kontur, Öffnungen, belegte Dicke und Höhenlage |
| Türen/Fenster | `Document.Create.NewFamilyInstance` / `revit_place_family_instance` mit `hostId` | Passende Wandfamilie, Rohbauöffnung, Brüstung, Lage und Orientierung |
| Dach | `Document.Create.NewFootPrintRoof` | Dachkontur, Höhen und Neigung; rechteckiger MCP-Dachbefehl reicht nur bei passender belegter Form |
| Räume | `Document.Create.NewRoom(Level, UV)` / `revit_create_room` | Begrenzung, Raumpunkt, Originalnummer/-name, belegte Obergrenze |

Alle Modelländerungen in Transaktionen ausführen, nach jedem kleinen Paket regenerieren und zurücklesen. Eine PDF-Verknüpfung, ein DirectShape oder ein IFC-Import ersetzt keine nativen Gebäudebauteile. Raumtrennlinien nur für belegte funktionale Trennungen einsetzen; offene Wandanschlüsse nicht damit verstecken. Raumnummern nicht automatisch ergänzen. Raumbegrenzung und Phase der Bauteile müssen zur Raumphase passen.

## Was der Prüf-/Exportbefehl tatsächlich prüft

- Alle vorhandenen Räume sind platziert, haben positive Fläche, Nummer und Namen.
- Begrenzungsschleifen sind vorhanden und ihre Segmente schließen geometrisch. Der Grenzwert von 0,000001 Revit-Fuß ist eine numerische Anschlussprüfung, keine vereinbarte Bautoleranz.
- `SpatialElementGeometryCalculator` liefert je Raum einen Körper mit positiver Geometrie und Volumen.
- Raumnummern sind innerhalb derselben Ebene eindeutig.
- SaveAs erfolgt außerhalb einer Transaktion; IFC-Export innerhalb einer Transaktion. Neue Ausgabepfade verhindern Überschreiben.
- RVT und IFC sind vorhanden und nicht leer. Eine bytegleiche Kopie der gespeicherten RVT wird separat geöffnet, weil das aktive RVT-Dokument nicht nochmals unter demselben Pfad geöffnet werden kann. UniqueId, Nummer, Name, Fläche und geometrisches Raumvolumen werden verglichen.
- Der Bericht enthält Ebenenhöhen, native Kategorienanzahlen und Revit-Warnungen. Er bestätigt ausdrücklich noch keinen Planabgleich.

IFC4, Basismengen und Raumbegrenzungen zweiter Ordnung sind konfiguriert. `ExportRoomsInView=true` ist eine Exporteroption; ihre tatsächliche Wirkung hängt vom installierten IFC-Exporter ab. Ein nicht vorhandenes IFC-Modul führt zum Fehler. Eine gesetzte Option allein beweist keine exportierte Raumgeometrie.

## Noch erforderliche Abnahme

1. Original-Raumliste vollständig mit Revit-Räumen abgleichen. Positive Volumina allein beweisen weder Vollständigkeit noch richtige Raumhöhe. Raumobergrenzen, freie Begrenzungsflächen, Phasen und Dachanschlüsse fachlich prüfen.
2. Unabhängig vom Exporter mit einem IFC-Parser/Viewer jede erwartete `IfcSpace`-Instanz prüfen: Originalnummer und Bezeichnung, Geschosszuordnung, eindeutige GlobalId, zugewiesene 3D-Body-Repräsentation, auflösbare Geometrie und positives Volumen. Raummengen und Raumliste gegen `pruefung.json` vergleichen. Nur nach Textsuche nach `IFCSPACE` zu suchen reicht nicht.
3. Deckendicken, Geschosshöhen, maßgebliche Außen- und Innenmaße sowie Türen/Fenster gegen die abgestimmten Pläne prüfen. Toleranzen vor Abnahme vereinbaren und Abweichungen je Maß protokollieren.
4. IFC in der Ziel-App laden und für jeden Raum Auswahl, Nummer/Name und geschlossenen Raumkörper prüfen. Damit ist die Lichtsimulation vorbereitet; Verglasungseigenschaften, Materialreflexionen und Beleuchtungsdaten sind weitere separate Eingaben.

## Referenzen

- Lokal zur Kompilierung und Signaturprüfung: `RevitAPI.dll`, `RevitAPIUI.dll`, `RevitAPI.xml` der installierten Revit-Version 2027.3.
- [Autodesk: IFC-Export benötigt eine offene Transaktion](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/7efa4eb3-8d94-b8e7-f608-3dbae751331d.htm).
- [Autodesk: SpaceBoundaryLevel](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/d9076483-6224-f329-c2e2-a0ea87e7a6fe.htm).
- [Autodesk: Room and Space Geometry](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API/files/Revit_API_Developers_Guide/Revit_Geometric_Elements/Geometry/Revit_API_Revit_API_Developers_Guide_Revit_Geometric_Elements_Geometry_Room_and_Space_Geometry_html.html).

Die verlinkte Online-Dokumentation beschreibt die API 2026. Der vorliegende Code wurde zusätzlich gegen die tatsächlich installierte API 2027 kompiliert; ein Laufzeittest steht noch aus.
