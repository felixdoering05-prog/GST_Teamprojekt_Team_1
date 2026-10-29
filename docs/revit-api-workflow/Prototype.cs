using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using System.IO;
using System.Text.Json;

namespace GstRevitWorkflowV2;

public static class Prototype
{
    public class Input {
        public string ExpectedTitle {get;set;}="";
        public string OutputFolder {get;set;}="";
        public string Source {get;set;}="";
        public double Height {get;set;}
        public List<W> Walls {get;set;}=[];
        public List<R> Rooms {get;set;}=[];
    }
    public class W { public double[] A {get;set;}=[]; public double[] B {get;set;}=[]; public double Width {get;set;} }
    public class R { public string Number {get;set;}=""; public string Name {get;set;}=""; public double[] Point {get;set;}=[]; public double Area {get;set;} }
    static double F(double m)=>UnitUtils.ConvertToInternalUnits(m,UnitTypeId.Meters);
    static XYZ P(double[] a)=>new(F(a[0]),F(a[1]),0);
    public static string Run(UIApplication ui,string inputPath)
    {
        var input=JsonSerializer.Deserialize<Input>(File.ReadAllText(inputPath))!;
        var doc=ui.ActiveUIDocument.Document;
        if(doc.Title!=input.ExpectedTitle || doc.IsWorkshared || doc.IsFamilyDocument)
            throw new InvalidOperationException("Falsches aktives Dokument; keine Änderung.");
        if(new FilteredElementCollector(doc).OfClass(typeof(Wall)).WhereElementIsNotElementType().Any())
            throw new InvalidOperationException("Projekt enthält bereits Wände; kein erneuter Import.");
        var output=Path.Combine(input.OutputFolder,"GST-EG-Teilprototyp-"+DateTime.Now.ToString("yyyyMMdd-HHmmss"));
        Directory.CreateDirectory(output);
        var ids=new List<ElementId>();
        using(var group=new TransactionGroup(doc,"GST belegter EG-Teilprototyp")) {
            group.Start();
            Level level=null!;
            using(var tx=new Transaction(doc,"GST Ebenen und Wände")) {
                tx.Start();
                level=new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().FirstOrDefault(l=>l.Name=="GST EG - Plan 0.00")??Level.Create(doc,0);
                level.Name="GST EG - Plan 0.00";
                var ch=level.get_Parameter(BuiltInParameter.LEVEL_ATTR_ROOM_COMPUTATION_HEIGHT);if(ch!=null&&!ch.IsReadOnly)ch.Set(F(1));
                var upper=Level.Create(doc,F(input.Height));upper.Name="GST EG Obergrenze grafisch - keine bestätigte OKFF";
                var seed=new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().First(w=>w.Kind==WallKind.Basic);
                var types=new Dictionary<double,WallType>();
                foreach(var spec in input.Walls){
                    var width=Math.Round(spec.Width,4);
                    if(!types.TryGetValue(width,out var type)){
                        type=(WallType)seed.Duplicate("GST Geometrie "+(width*1000).ToString("0.0",System.Globalization.CultureInfo.InvariantCulture)+" mm - Aufbau unbekannt");
                        type.SetCompoundStructure(CompoundStructure.CreateSimpleCompoundStructure(new List<CompoundStructureLayer>{new(F(width),MaterialFunctionAssignment.Structure,ElementId.InvalidElementId)}));
                        type.get_Parameter(BuiltInParameter.ALL_MODEL_TYPE_COMMENTS)?.Set("Nur belegte Gesamtgeometrie; Material und physischer Schichtaufbau nicht festgelegt.");types[width]=type;
                    }
                    var wall=Wall.Create(doc,Line.CreateBound(P(spec.A),P(spec.B)),type.Id,level.Id,F(input.Height),0,false,false);
                    wall.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set(input.Source+" | XY aus PDF-Vektorkanten, kalibriert an Maßkette; Höhe grafisch aus Fassadenraster; Türen/Fenster noch offen.");
                    ids.Add(wall.Id);
                }
                if(tx.Commit()!=TransactionStatus.Committed)throw new InvalidOperationException("Wandtransaktion fehlgeschlagen.");
            }
            using(var tx=new Transaction(doc,"GST Räume und Prüfansichten")) {
                tx.Start();
                AreaVolumeSettings.GetAreaVolumeSettings(doc).ComputeVolumes=true;
                foreach(var spec in input.Rooms){
                    var room=doc.Create.NewRoom(level,new UV(F(spec.Point[0]),F(spec.Point[1])));
                    room.Number=spec.Number;room.Name=spec.Name;
                    var heightLimit=new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().Single(l=>l.Name=="GST EG Obergrenze grafisch - keine bestätigte OKFF");
                    room.get_Parameter(BuiltInParameter.ROOM_UPPER_LEVEL).Set(heightLimit.Id);
                    room.get_Parameter(BuiltInParameter.ROOM_UPPER_OFFSET).Set(0.0);
                    room.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set(input.Source+" | Planfläche "+spec.Area+" m²; Raumobergrenze grafisch und vorläufig; kein freigegebenes Lichtsimulationsmodell.");
                }
                var viewType=new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(t=>t.ViewFamily==ViewFamily.FloorPlan);
                var plan=ViewPlan.Create(doc,viewType.Id,level.Id);plan.Name="GST EG - Teilprototyp prüfen";plan.Scale=50;
                var noteType=new FilteredElementCollector(doc).OfClass(typeof(TextNoteType)).FirstElementId();
                TextNote.Create(doc,plan.Id,new XYZ(F(4),F(27),0),"EG TEILPROTOTYP - native Wände und Räume. Höhe grafisch ermittelt. Noch keine Türen, Fenster, Decken oder Dach; Gesamtgebäude unvollständig.",noteType);
                var t3d=new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(t=>t.ViewFamily==ViewFamily.ThreeDimensional);
                var v3d=View3D.CreateIsometric(doc,t3d.Id);v3d.Name="GST EG - Teilprototyp 3D";v3d.DetailLevel=ViewDetailLevel.Fine;
                doc.Regenerate();
                foreach(var spec in input.Rooms){
                    var room=new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>().Single(r=>r.Number==spec.Number);
                    var area=UnitUtils.ConvertFromInternalUnits(room.Area,UnitTypeId.SquareMeters);
                    if(Math.Abs(area-spec.Area)>.03)throw new InvalidOperationException("Planfläche abweichend: "+spec.Number+" / "+area+" statt "+spec.Area);
                }
                if(tx.Commit()!=TransactionStatus.Committed)throw new InvalidOperationException("Raumtransaktion fehlgeschlagen.");
            }
            group.Assimilate();
        }
        var checks=new List<object>();
        using(var calc=new SpatialElementGeometryCalculator(doc)) foreach(var room in new FilteredElementCollector(doc).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>()) {
            using var geo=calc.CalculateSpatialElementGeometry(room);
            var solid=geo.GetGeometry();
            if(solid.Volume<=0)throw new InvalidOperationException("Kein Raumkörper: "+room.Number);
            checks.Add(new{room.Number,room.Name,room.UniqueId,AreaM2=UnitUtils.ConvertFromInternalUnits(room.Area,UnitTypeId.SquareMeters),VolumeM3=UnitUtils.ConvertFromInternalUnits(solid.Volume,UnitTypeId.CubicMeters)});
        }
        var rvt=Path.Combine(output,"GST-EG-Teilprototyp.rvt");
        doc.SaveAs(rvt,new SaveAsOptions{OverwriteExistingFile=false});
        using(var tx=new Transaction(doc,"GST IFC Teilprototyp")) {
            tx.Start();using var opt=new IFCExportOptions{FileVersion=IFCVersion.IFC4,SpaceBoundaryLevel=2,ExportBaseQuantities=true};
            opt.AddOption("ExportRoomsInView","true");
            if(!doc.Export(output,"GST-EG-Teilprototyp.ifc",opt))throw new InvalidOperationException("IFC Export fehlgeschlagen.");
            tx.Commit();
        }
        doc.Save();
        var copy=Path.Combine(output,"GST-Pruefkopie.rvt");File.Copy(rvt,copy,false);
        var reopened=ui.Application.OpenDocumentFile(copy);
        int savedRooms;
        try{savedRooms=new FilteredElementCollector(reopened).OfCategory(BuiltInCategory.OST_Rooms).WhereElementIsNotElementType().GetElementCount();if(savedRooms!=input.Rooms.Count)throw new InvalidOperationException("Raumanzahl nach Wiederöffnen abweichend.");}
        finally{reopened.Close(false);}
        File.WriteAllText(Path.Combine(output,"pruefung.json"),JsonSerializer.Serialize(new{Status="Geprüfter Teilprototyp; Gesamtgebäude unvollständig",Source=input.Source,HeightGraphicalM=input.Height,Walls=ids.Count,Rooms=checks,SavedRoomCount=savedRooms,Rvt=rvt,Ifc=Path.Combine(output,"GST-EG-Teilprototyp.ifc"),Open="Türen/Fenster/Decken/Dach, übrige Räume und Geschosse, unabhängig geprüfte IFCSPACE-Geometrie"},new JsonSerializerOptions{WriteIndented=true}));
        // Dynamo cannot switch the active Revit view during graph evaluation.
        // Open the created view afterwards through the Revit UI or connector.
        return output;
    }
}
