const {buildingLocation}=require('./building-weather');
const express=require('express');
const {accessibleBuilding}=require('./collaboration');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
async function initMapViews(db){await db.query(`CREATE TABLE IF NOT EXISTS app_map_requests(id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'processing',created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);await db.query(`CREATE TABLE IF NOT EXISTS app_model_map_views(document_id INTEGER PRIMARY KEY REFERENCES app_documents(id) ON DELETE CASCADE,latitude DOUBLE PRECISION NOT NULL,longitude DOUBLE PRECISION NOT NULL,heading DOUBLE PRECISION NOT NULL DEFAULT 0,meters_per_unit DOUBLE PRECISION NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,features JSONB,loaded_at TIMESTAMPTZ,last_attempt TIMESTAMPTZ)`);await db.query('ALTER TABLE app_model_map_views ADD COLUMN IF NOT EXISTS area_width_m INTEGER NOT NULL DEFAULT 400');}
async function modelMapView(db,id){return (await db.query('SELECT latitude,longitude,heading,meters_per_unit,revision,features,loaded_at,area_width_m FROM app_model_map_views WHERE document_id=$1',[id])).rows[0]||null;}
function simplifyOSM(elements,lat,lon){
 if(!Array.isArray(elements))fail('Ungültige Kartendaten.',502);const result=[];let points=0;
 for(const item of elements){if(result.length>=200)break;if(item.type!=='way'||!Array.isArray(item.geometry)||item.geometry.length<2||item.geometry.length>400)continue;
  const tags=item.tags||{},kind=tags.highway?'road':tags.building?'building':tags.leisure==='park'||tags.landuse?'green':null;if(!kind)continue;
  const geometry=item.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat-lat)<.01&&Math.abs(p.lon-lon)<.02).map(p=>[p.lon,p.lat]);if(geometry.length!==item.geometry.length||points+geometry.length>12000)continue;
  if(kind!=='road'&&(geometry.length<4||geometry[0][0]!==geometry.at(-1)[0]||geometry[0][1]!==geometry.at(-1)[1]))continue;
  points+=geometry.length;
  const height=Number.parseFloat(tags.height),levels=Number.parseFloat(tags['building:levels']);
  result.push({kind,geometry,width:kind==='road'?['footway','path','cycleway','steps'].includes(tags.highway)?2:tags.highway==='service'?4:7:null,height:kind==='building'?Number.isFinite(height)&&height>0&&height<150?height:Number.isFinite(levels)&&levels>0&&levels<50?levels*3:8:0,estimated_height:kind==='building'&&!Number.isFinite(height)});
 }
 return result;
}
function mapViewRouter(db,requireAccount,options={}){
 const r=express.Router(),base='/documents/:mapDocument/map-view',fetchProvider=options.fetch||global.fetch;
 r.use(base,requireAccount,(req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
 async function target(req,owner=false){if(!/^[1-9]\d{0,9}$/.test(req.params.mapDocument)||Number(req.params.mapDocument)>2147483647)fail('Ungültiges Modell.');const doc=(await db.query("SELECT id,building_id FROM app_documents WHERE id=$1 AND mime_type='application/x-step'",[req.params.mapDocument])).rows[0];const b=doc&&await accessibleBuilding(db,doc.building_id,req.account.id);if(!b||owner&&b.user_id!==req.account.id)fail('Modell nicht gefunden oder keine Eigentümerfreigabe.',404);return doc;}
 r.get(base,wrap(async(req,res)=>{const doc=await target(req);res.json({map_view:await modelMapView(db,doc.id),building_location:await buildingLocation(db,doc.building_id)});}));
 r.put(base,wrap(async(req,res)=>{
  const doc=await target(req,true),b=req.body||{};
  if(Object.keys(b).some(x=>!['latitude','longitude','heading','meters_per_unit','revision'].includes(x))||![b.latitude,b.longitude,b.heading,b.meters_per_unit].every(Number.isFinite)||Math.abs(b.latitude)>85||Math.abs(b.longitude)>180||b.heading<0||b.heading>=360||b.meters_per_unit<.0001||b.meters_per_unit>1000||!Number.isInteger(b.revision)||b.revision<0)fail('Bitte gültigen Standort, Drehung und Maßstab eingeben.');
  const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM app_buildings WHERE id=$1 FOR UPDATE',[doc.building_id]);const old=await modelMapView(c,doc.id);if((old?.revision||0)!==b.revision)fail('Standort inzwischen geändert. Bitte neu laden.',409);
   await c.query(`INSERT INTO app_model_map_views(document_id,latitude,longitude,heading,meters_per_unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,heading=EXCLUDED.heading,meters_per_unit=EXCLUDED.meters_per_unit,revision=app_model_map_views.revision+1,features=CASE WHEN app_model_map_views.latitude=EXCLUDED.latitude AND app_model_map_views.longitude=EXCLUDED.longitude THEN app_model_map_views.features ELSE NULL END,loaded_at=CASE WHEN app_model_map_views.latitude=EXCLUDED.latitude AND app_model_map_views.longitude=EXCLUDED.longitude THEN app_model_map_views.loaded_at ELSE NULL END`,[doc.id,b.latitude,b.longitude,b.heading,b.meters_per_unit]);await c.query('INSERT INTO app_building_locations(building_id,latitude,longitude) VALUES($1,$2,$3) ON CONFLICT(building_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,revision=app_building_locations.revision+1 WHERE app_building_locations.latitude<>EXCLUDED.latitude OR app_building_locations.longitude<>EXCLUDED.longitude',[doc.building_id,b.latitude,b.longitude]);await c.query("UPDATE app_buildings SET twin_data=twin_data||jsonb_build_object('latitude',$2::double precision,'longitude',$3::double precision) WHERE id=$1",[doc.building_id,b.latitude,b.longitude]);await c.query('COMMIT');res.json({map_view:await modelMapView(db,doc.id)});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }));
 r.post(base+'/load',wrap(async(req,res)=>{
  const doc=await target(req,true),b=req.body||{};if(Object.keys(b).some(x=>!['revision'].includes(x))||!Number.isInteger(b.revision))fail('Aktuellen Standort zuerst speichern.');
  const c=await db.connect();let view,requestID;
  try{await c.query('BEGIN');await c.query('SELECT id FROM app_ai_budget WHERE id=1 FOR UPDATE');
   const count=(await c.query("SELECT COUNT(*) n,COUNT(*) FILTER(WHERE user_id=$1 AND created_at>now()-interval '1 hour') own,COUNT(*) FILTER(WHERE status='processing' AND created_at>now()-interval '25 seconds') active FROM app_map_requests WHERE created_at>now()-interval '24 hours'",[req.account.id])).rows[0];
   if(Number(count.n)>=100||Number(count.own)>=10)fail('Kartenkontingent erreicht. Bitte gespeicherte Umgebung verwenden oder später erneut laden.',429);if(Number(count.active)>=2)fail('Kartendienst gerade ausgelastet. Bitte später erneut laden.',503);
   const rows=await c.query("UPDATE app_model_map_views SET last_attempt=now() WHERE document_id=$1 AND revision=$2 AND (last_attempt IS NULL OR last_attempt<now()-interval '1 minute') RETURNING latitude,longitude,revision",[doc.id,b.revision]);view=rows.rows[0];if(!view)fail('Bitte aktuellen Standort laden oder eine Minute warten.',409);
   requestID=(await c.query('INSERT INTO app_map_requests(user_id) VALUES($1) RETURNING id',[req.account.id])).rows[0].id;await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  const dy=50/111320,dx=dy/Math.cos(view.latitude*Math.PI/180),box=[view.latitude-dy,view.longitude-dx,view.latitude+dy,view.longitude+dx].join(',');
  const query=`[out:json][timeout:15];(way[highway](${box});way[building](${box});way[leisure=park](${box});way[landuse~"grass|forest|meadow|recreation_ground"](${box}););out tags geom;`;
  try{
   const response=await fetchProvider('https://ovp.dresel.systems/api/interpreter?'+new URLSearchParams({data:query}).toString(),{method:'GET',headers:{'User-Agent':'D21-BIM-Map/1.0 (+https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1)'},redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!response.ok)fail('OpenStreetMap-Dienst ist gerade nicht verfügbar. Bitte später erneut laden.',502);
   const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>3*1024*1024)fail('Kartenausschnitt zu groß.',502);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   const features=simplifyOSM(JSON.parse(Buffer.concat(chunks).toString('utf8')).elements,view.latitude,view.longitude);
   if(!features.length)fail('Für diesen Ausschnitt liefert der Europa-Kartendienst keine verwertbaren Daten.',422);
   const update=await db.query('UPDATE app_model_map_views SET features=$3,loaded_at=now(),area_width_m=100,revision=revision+1 WHERE document_id=$1 AND revision=$2 RETURNING document_id',[doc.id,view.revision,JSON.stringify(features)]);if(!update.rows.length)fail('Standort während des Ladens geändert. Bitte neu laden.',409);
   await db.query("UPDATE app_map_requests SET status='done' WHERE id=$1",[requestID]);res.json({map_view:await modelMapView(db,doc.id)});
  }catch(e){await db.query("UPDATE app_map_requests SET status='failed' WHERE id=$1",[requestID]);if(e.status)throw e;fail('Kartendaten konnten nicht geladen werden.',503);}
 }));
 r.use((e,req,res,next)=>e.status?res.status(e.status).json({error:e.message}):next(e));return r;
}
module.exports={initMapViews,mapViewRouter,modelMapView,simplifyOSM};
