using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using System.Text.Json;
using System.IO;
using System.Windows.Forms;
using TaskDialog = Autodesk.Revit.UI.TaskDialog;

namespace GstRevitWorkflow;

// No coordinates, dimensions, source plans or model data are embedded here.
[Transaction(TransactionMode.Manual)]
public sealed class NewProject : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        Document? doc = null;
        try
        {
            using var template = new OpenFileDialog { Filter = "Revit project template (*.rte)|*.rte", Title = "Geprüfte Projektvorlage auswählen" };
            if (template.ShowDialog() != DialogResult.OK) return Result.Cancelled;
            using var output = new FolderBrowserDialog { Description = "Lokale Arbeitsablage außerhalb des Git-Repositorys" };
            if (output.ShowDialog() != DialogResult.OK) return Result.Cancelled;
            var path = Path.Combine(output.SelectedPath, "GST-Prototyp-" + Guid.NewGuid().ToString("N") + ".rvt");
            doc = data.Application.Application.NewProjectDocument(template.FileName);
            if (doc == null) throw new InvalidOperationException("Revit hat kein neues Projekt zurückgegeben.");
            doc.SaveAs(path, new SaveAsOptions { OverwriteExistingFile = false });
            doc.Close(false);
            doc = null;
            data.Application.OpenAndActivateDocument(path);
            TaskDialog.Show("GST", "Leere neue Projektdatei angelegt. Noch kein Gebäudemodell und keine fachliche Prüfung.\n" + path);
            return Result.Succeeded;
        }
        catch (Exception ex) { message = ex.ToString(); return Result.Failed; }
        finally { if (doc != null && doc.IsValidObject) doc.Close(false); }
    }
}

[Transaction(TransactionMode.Manual)]
public sealed class ValidateSaveExport : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        try
        {
            var doc = data.Application.ActiveUIDocument?.Document ?? throw new InvalidOperationException("Kein aktives Projekt.");
            if (doc.IsFamilyDocument || doc.IsReadOnly || doc.IsModifiable || doc.IsWorkshared)
                throw new InvalidOperationException("Nur eigenständige lokale Projekte ohne offene Transaktion werden unterstützt.");
            if (!Path.GetFileName(doc.PathName).StartsWith("GST-Prototyp-", StringComparison.Ordinal))
                throw new InvalidOperationException("Zuerst mit GST NewProject eine eigene Prototypdatei anlegen. Fremde aktive Projekte werden nicht gespeichert.");
            var rooms = CheckRooms(doc);
            using var output = new FolderBrowserDialog { Description = "Lokale Exportablage außerhalb des Git-Repositorys" };
            if (output.ShowDialog() != DialogResult.OK) return Result.Cancelled;
            var folder = Path.Combine(output.SelectedPath, "GST-Pruefung-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            var rvt = Path.Combine(folder, "GST-Modell.rvt");
            var ifc = Path.Combine(folder, "GST-Modell.ifc");
            // SaveAs is outside transactions; IFC export must be inside one.
            doc.SaveAs(rvt, new SaveAsOptions { OverwriteExistingFile = false });
            using (var tx = new Transaction(doc, "GST IFC exportieren"))
            {
                tx.Start();
                using var options = new IFCExportOptions
                {
                    FileVersion = IFCVersion.IFC4,
                    SpaceBoundaryLevel = 2,
                    ExportBaseQuantities = true
                };
                options.AddOption("ExportRoomsInView", "true");
                options.AddOption("UseActiveViewGeometry", "false");
                options.AddOption("ExportInternalRevitPropertySets", "true");
                if (!doc.Export(folder, "GST-Modell.ifc", options))
                    throw new InvalidOperationException("IFC-Export meldet false.");
                if (tx.Commit() != TransactionStatus.Committed)
                    throw new InvalidOperationException("Exporttransaktion wurde nicht abgeschlossen.");
            }
            doc.Save();
            if (!File.Exists(rvt) || new FileInfo(rvt).Length == 0 || !File.Exists(ifc) || new FileInfo(ifc).Length == 0)
                throw new InvalidOperationException("Eine Ausgabedatei fehlt oder ist leer.");
            // Reopen the saved RVT in a separate background document and compare native rooms.
            var verificationCopy = Path.Combine(folder, "GST-Wiedereroeffnungspruefung.rvt");
            File.Copy(rvt, verificationCopy, false);
            var reopened = data.Application.Application.OpenDocumentFile(verificationCopy);
            List<RoomRecord> persisted;
            try { persisted = CheckRooms(reopened); }
            finally { reopened.Close(false); }
            if (rooms.Count != persisted.Count || rooms.Any(r => !persisted.Any(p =>
                p.UniqueId == r.UniqueId && p.Number == r.Number && p.Name == r.Name &&
                Math.Abs(p.AreaM2 - r.AreaM2) < 0.000001 && Math.Abs(p.SolidM3 - r.SolidM3) < 0.000001)))
                throw new InvalidOperationException("Raumdaten nach Wiederöffnen abweichend.");
            var report = new
            {
                Status = "RVT wiedergeöffnet und Räume technisch geprüft; IFC-Semantik und Planabgleich noch offen",
                Revit = data.Application.Application.VersionBuild,
                Rvt = rvt, Ifc = ifc, Rooms = persisted,
                Levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>()
                    .Select(l => new { l.Name, ElevationM = UnitUtils.ConvertFromInternalUnits(l.Elevation, UnitTypeId.Meters) }),
                NativeCounts = new[] { BuiltInCategory.OST_Walls, BuiltInCategory.OST_Floors,
                    BuiltInCategory.OST_Doors, BuiltInCategory.OST_Windows, BuiltInCategory.OST_Roofs }
                    .ToDictionary(c => c.ToString(), c => new FilteredElementCollector(doc).OfCategory(c).WhereElementIsNotElementType().GetElementCount()),
                Warnings = doc.GetWarnings().Select(w => w.GetDescriptionText()).ToArray()
            };
            File.WriteAllText(Path.Combine(folder, "pruefung.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
            TaskDialog.Show("GST", "RVT gespeichert und wiedergeöffnet. IFC exportiert.\nUnabhängige IFCSPACE-Geometrieprüfung und Planabgleich noch erforderlich.\n" + folder);
            return Result.Succeeded;
        }
        catch (Exception ex) { message = ex.ToString(); return Result.Failed; }
    }

    private static List<RoomRecord> CheckRooms(Document doc)
    {
        var rooms = new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms)
            .WhereElementIsNotElementType().Cast<Room>().ToList();
        if (rooms.Count == 0) throw new InvalidOperationException("Keine Räume vorhanden.");
        using var boundary = new SpatialElementBoundaryOptions { SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish };
        using var calculator = new SpatialElementGeometryCalculator(doc, boundary);
        var result = new List<RoomRecord>();
        foreach (var room in rooms)
        {
            if (room.Location == null || room.Area <= 0 || string.IsNullOrWhiteSpace(room.Number) || string.IsNullOrWhiteSpace(room.Name))
                throw new InvalidOperationException("Unplatzierter, unbegrenzter oder unbeschrifteter Raum: " + room.Id);
            var loops = room.GetBoundarySegments(boundary);
            if (loops == null || loops.Count == 0) throw new InvalidOperationException("Keine Begrenzung: " + room.Number);
            foreach (var loop in loops)
            {
                if (loop.Count == 0) throw new InvalidOperationException("Leere Begrenzung: " + room.Number);
                for (var i = 0; i < loop.Count; i++)
                    if (loop[i].GetCurve().GetEndPoint(1).DistanceTo(loop[(i + 1) % loop.Count].GetCurve().GetEndPoint(0)) > 0.000001)
                        throw new InvalidOperationException("Offene Raumkontur: " + room.Number);
            }
            using var geometry = calculator.CalculateSpatialElementGeometry(room);
            var solid = geometry.GetGeometry();
            if (solid == null || solid.Volume <= 0 || solid.Faces.Size == 0)
                throw new InvalidOperationException("Kein positiver Raumkörper: " + room.Number);
            result.Add(new RoomRecord(room.UniqueId, room.Number, room.Name, room.LevelId.Value,
                UnitUtils.ConvertFromInternalUnits(room.Area, UnitTypeId.SquareMeters),
                UnitUtils.ConvertFromInternalUnits(solid.Volume, UnitTypeId.CubicMeters)));
        }
        if (result.GroupBy(r => (r.LevelId, r.Number)).Any(g => g.Count() > 1))
            throw new InvalidOperationException("Doppelte Raumnummer innerhalb eines Geschosses.");
        return result;
    }
    private sealed record RoomRecord(string UniqueId, string Number, string Name, long LevelId, double AreaM2, double SolidM3);
}
