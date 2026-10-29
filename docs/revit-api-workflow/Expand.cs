using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using System.IO;
using System.Text.Json;

namespace GstRevitExpansion;
public static class Expand {
 public class Input { public string ExpectedPath {get;set;}=""; public string OutputFolder {get;set;}=""; public List<W> Walls {get;set;}=[]; public List<R> Rooms {get;set;}=[]; }
 public class W {public double[] A {get;set;}=[];public double[] B {get;set;}=[];public double Width {get;set;}}
 public class R {public string Number {get;set;}="";public string Name {get;set;}="";public double[] Point {get;set;}=[];public double Area {get;set;}}
 static double F(double m)=>m/.3048;
 static XYZ P(double[] a)=>new(F(a[0]),F(a[1]),0);
 public static string Run(UIApplication ui,string path) {
  var data=JsonSerializer.Deserialize<Input>(File.ReadAllText(path))!;var d=ui.ActiveUIDocument.Document;
  if(!string.Equals(Path.GetFullPath(d.PathName),Path.GetFullPath(data.ExpectedPath),StringComparison.OrdinalIgnoreCase))throw new Exception("Falsches Dokument.");
  if(new FilteredElementCollector(d).OfClass(typeof(Wall)).WhereElementIsNotElementType().GetElementCount()!=6)throw new Exception("Prototyp wurde verändert; nicht erneut ausführen.");
  var log=new List<object>();var output=Path.Combine(data.OutputFolder,"GST-EG-Arbeitsstand-"+DateTime.Now.ToString("yyyyMMdd-HHmmss"));Directory.CreateDirectory(output);
  var level=new FilteredElementCollector(d).OfClass(typeof(Level)).Cast<Level>().Single(l=>l.Name=="GST EG - Plan 0.00");
  var upper=new FilteredElementCollector(d).OfClass(typeof(Level)).Cast<Level>().Single(l=>l.Name=="GST EG Obergrenze grafisch - keine bestätigte OKFF");
  using(var group=new TransactionGroup(d,"GST EG planbelegte Wandkonturen ergänzen")){
   group.Start();using(var tx=new Transaction(d,"GST EG Wände aus Vektorkanten")){
    tx.Start();var types=new FilteredElementCollector(d).OfClass(typeof(WallType)).Cast<WallType>().Where(t=>t.Kind==WallKind.Basic).ToList();var seed=types[0];
    foreach(var s in data.Walls){var width=Math.Round(s.Width,4);var name="GST Geometrie "+(width*1000).ToString("0.0",System.Globalization.CultureInfo.InvariantCulture)+" mm - Aufbau unbekannt";var wt=types.FirstOrDefault(t=>t.Name==name);
     if(wt==null){wt=(WallType)seed.Duplicate(name);wt.SetCompoundStructure(CompoundStructure.CreateSimpleCompoundStructure(new List<CompoundStructureLayer>{new(F(width),MaterialFunctionAssignment.Structure,ElementId.InvalidElementId)}));types.Add(wt);}
     var wall=Wall.Create(d,Line.CreateBound(P(s.A),P(s.B)),wt.Id,level.Id,upper.Elevation,0,false,false);
     wall.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set("GST EG | Kontur aus PDF-Vektorkanten A-GR-00-02-01; Höhe grafisch 3.80m; Öffnungen noch nicht eingesetzt; keine Material-/Schichtfestlegung; Arbeitsstand.");
    }
    d.Regenerate();if(tx.Commit()!=TransactionStatus.Committed)throw new Exception("Wanderweiterung fehlgeschlagen.");
   }
   using(var tx=new Transaction(d,"GST EG Räume prüfen")){
    tx.Start();foreach(var spec in data.Rooms){
     if(new FilteredElementCollector(d).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>().Any(r=>r.Number==spec.Number))continue;
     var room=d.Create.NewRoom(level,new UV(F(spec.Point[0]),F(spec.Point[1])));room.Number=spec.Number;room.Name=spec.Name;room.get_Parameter(BuiltInParameter.ROOM_UPPER_LEVEL).Set(upper.Id);room.get_Parameter(BuiltInParameter.ROOM_UPPER_OFFSET).Set(0.0);d.Regenerate();
     var area=UnitUtils.ConvertFromInternalUnits(room.Area,UnitTypeId.SquareMeters);
     if(area<=0){log.Add(new{spec.Number,Status="Nicht geschlossen oder Beschriftungspunkt außerhalb; Raum nicht übernommen",PlanArea=spec.Area});d.Delete(room.Id);continue;}
     var delta=area-spec.Area;var status=Math.Abs(delta)<.03?"Fläche innerhalb 0.03 m²":"Flächenabweichung; Raum noch nicht abgenommen";
     room.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set("GST EG | "+status+" | Planfläche "+spec.Area+" m²; Differenz "+delta+" m². Raumhöhe grafisch 3.80m.");
     log.Add(new{spec.Number,Status=status,PlanArea=spec.Area,ModelArea=area,Delta=delta});
    }
    tx.Commit();
   }group.Assimilate();
  }
  var rvt=Path.Combine(output,"GST-EG-Arbeitsstand.rvt");d.SaveAs(rvt,new SaveAsOptions{OverwriteExistingFile=false});
  // Draft geometry is exported separately and explicitly never called approved.
  using(var tx=new Transaction(d,"GST IFC Arbeitsstand")){tx.Start();using var opt=new IFCExportOptions{FileVersion=IFCVersion.IFC4,SpaceBoundaryLevel=2,ExportBaseQuantities=true};opt.AddOption("ExportRoomsInView","true");if(!d.Export(output,"GST-EG-Arbeitsstand.ifc",opt))throw new Exception("IFC Export fehlgeschlagen.");tx.Commit();}d.Save();
  var rooms=new FilteredElementCollector(d).OfCategory(BuiltInCategory.OST_Rooms).Cast<Room>().ToList();
  using var calc=new SpatialElementGeometryCalculator(d);var geometry=new List<object>();
  foreach(var room in rooms){using var g=calc.CalculateSpatialElementGeometry(room);var vol=g.GetGeometry().Volume;if(vol<=0)throw new Exception("Kein Raumkörper: "+room.Number);geometry.Add(new{room.Number,room.UniqueId,Area=UnitUtils.ConvertFromInternalUnits(room.Area,UnitTypeId.SquareMeters),Volume=UnitUtils.ConvertFromInternalUnits(vol,UnitTypeId.CubicMeters)});}
  var copy=Path.Combine(output,"GST-Pruefkopie.rvt");File.Copy(rvt,copy,false);var rd=ui.Application.OpenDocumentFile(copy);int persisted;try{persisted=new FilteredElementCollector(rd).OfCategory(BuiltInCategory.OST_Rooms).WhereElementIsNotElementType().GetElementCount();}finally{rd.Close(false);}if(persisted!=rooms.Count)throw new Exception("Raumzahl nach Wiederöffnen abweichend.");
  File.WriteAllText(Path.Combine(output,"pruefung.json"),JsonSerializer.Serialize(new{Status="EG Arbeitsstand, nicht vollständig und nicht fachlich abgenommen",Rvt=rvt,Ifc=Path.Combine(output,"GST-EG-Arbeitsstand.ifc"),NativeWalls=new FilteredElementCollector(d).OfClass(typeof(Wall)).WhereElementIsNotElementType().GetElementCount(),RoomCount=rooms.Count,Checks=log,Geometry=geometry,Open="Flächenabweichungen korrigieren; Anbauten, Öffnungen, Türen/Fenster, Geschossdecken, Dach und weitere Geschosse fehlen"},new JsonSerializerOptions{WriteIndented=true}));return output;
 }
}
