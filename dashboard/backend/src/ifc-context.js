// Common numeric facts for text and voice. Never forward room names or entire reports.
const MODEL_GUIDANCE='IFC-Zahlen gelten je einzelnes Modell. Raumanzahl ist ifc_space_count, Geschossanzahl ifc_storey_count. IfcSpace umfasst auch Flure und andere Flächen, nicht garantiert nutzbare Zimmer. Verschiedene Modelle/Versionen niemals addieren. Bei mehreren Modellen ohne Auswahl nachfragen. null bedeutet unbekannt, 0 bedeutet im ausgewerteten IFC nicht vorhanden. Daten sind der Stand der angegebenen Analyse, keine Vermessung; Strukturhinweise sind keine fachliche Freigabe.';
function count(value){return Number.isSafeInteger(value)&&value>=0&&value<=500000?value:null;}
function facts(row,index){
 const counts=row.counts&&typeof row.counts==='object'&&!Array.isArray(row.counts)?row.counts:null;
 const metric=key=>counts?count(counts[key]??0):null;
 return {model_number:index+1,ifc_space_count:metric('IfcSpace'),ifc_storey_count:metric('IfcBuildingStorey'),ifc_door_count:metric('IfcDoor'),ifc_window_count:metric('IfcWindow'),schema_issue_count:count(row.schema_issues),checked_at:row.updated_at||null};
}
async function ifcContext(db,buildingID,documentID=null){
 const rows=(await db.query(`SELECT a.report->'counts' AS counts,a.report->'schema_issue_count' AS schema_issues,a.updated_at
 FROM app_documents d LEFT JOIN app_ifc_analysis a ON a.document_id=d.id AND a.status='ready'
 WHERE d.building_id=$1 AND d.mime_type='application/x-step' AND ($2::integer IS NULL OR d.id=$2)
 ORDER BY d.id DESC LIMIT 4`,[buildingID,documentID])).rows;
 // The LEFT JOIN retains pending/failed models: absence of a ready report must not mean zero rooms.
 return {ifc_models:rows.slice(0,3).map(facts),more_models_available:rows.length>3,model_guidance:MODEL_GUIDANCE};
}
module.exports={ifcContext,facts,MODEL_GUIDANCE};
