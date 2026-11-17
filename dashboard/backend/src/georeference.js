const proj4=require('proj4');
const PREFIX={MILLI:.001,CENTI:.01,DECI:.1,DECA:10,HECTO:100,KILO:1000};
function splitArgs(value){const out=[];let field='',depth=0,quoted=false;for(let i=0;i<value.length;i++){const c=value[i];if(c==="'"){field+=c;if(quoted&&value[i+1]==="'"){field+=value[++i];continue;}quoted=!quoted;continue;}if(!quoted){if(c==='(')depth++;if(c===')')depth--;if(c===','&&depth===0){out.push(field.trim());field='';continue;}}field+=c;}out.push(field.trim());return out;}
function parseReference(content){
 const text=Buffer.from(content).toString('utf8'),cache=new Map();
 function entityAt(start,type,id){let depth=1,quoted=false,end=start;for(;end<text.length&&end-start<100000;end++){const c=text[end];if(c==="'"){if(quoted&&text[end+1]==="'"){end++;continue;}quoted=!quoted;}if(!quoted){if(c==='(')depth++;if(c===')'&&--depth===0)break;}}if(depth!==0)return null;return {id:Number(id),type,args:splitArgs(text.slice(start,end))};}
 function first(type){const r=new RegExp('#(\\d+)\\s*=\\s*'+type+'\\s*\\(','gi');const m=r.exec(text);if(!m)return null;const item=entityAt(r.lastIndex,type,m[1]);if(r.exec(text))return {ambiguous:true};return item;}
 function get(value){if(!/^#\d+$/.test(value||''))return null;if(cache.has(value))return cache.get(value);const r=new RegExp('(?:^|;)\\s*'+value+'\\s*=\\s*([A-Z0-9_]+)\\s*\\(','im'),m=r.exec(text);const out=m?entityAt(m.index+m[0].length,m[1].toUpperCase(),value.slice(1)):null;cache.set(value,out);return out;}
 const number=v=>v==='$'||v==='*'||v===undefined?null:Number(v);
 const vector=v=>{const item=get(v);if(!item||!['IFCCARTESIANPOINT','IFCDIRECTION'].includes(item.type))return null;const a=splitArgs(item.args[0]?.replace(/^\(|\)$/g,'')||'').map(number);return a.length>=2&&a.length<=3&&a.every(Number.isFinite)?a:null;};
 const unit=v=>{const u=get(v);if(u?.type!=='IFCSIUNIT'||u.args[1]!=='.LENGTHUNIT.'||u.args[3]!=='.METRE.')return null;return u.args[2]==='$'?1:PREFIX[u.args[2]?.replaceAll('.','')]||null;};
 const project=first('IFCPROJECT'),assignment=get(project?.args?.[8]);let sourceUnit=null;if(assignment?.type==='IFCUNITASSIGNMENT')for(const ref of splitArgs(assignment.args[0].replace(/^\(|\)$/g,''))){const value=unit(ref);if(value!==null)sourceUnit=value;}
 function placement(ref,seen=new Set()){if(ref==='$'||!ref)return {x:0,y:0,angle:0};if(seen.size>20||seen.has(ref))return null;seen.add(ref);const p=get(ref);if(p?.type==='IFCLOCALPLACEMENT'){const a=placement(p.args[0],seen),b=placement(p.args[1],seen);if(!a||!b)return null;return {x:a.x+Math.cos(a.angle)*b.x-Math.sin(a.angle)*b.y,y:a.y+Math.sin(a.angle)*b.x+Math.cos(a.angle)*b.y,angle:a.angle+b.angle};}if(p?.type!=='IFCAXIS2PLACEMENT3D')return null;const point=vector(p.args[0]),up=vector(p.args[1]),x=vector(p.args[2]);if(!point||up&&(Math.abs(up[0])>1e-8||Math.abs(up[1])>1e-8||up[2]<=0))return null;return {x:point[0],y:point[1],angle:x?Math.atan2(x[1],x[0]):0};}
 const conversion=first('IFCMAPCONVERSION'),siteEntity=first('IFCSITE');let projected=null,site=null,reason=null;
 const dms=v=>{if(!/^\([^()]+\)$/.test(v||''))return null;const a=splitArgs(v.slice(1,-1)).map(number);if(a.length<3||a.length>4||!a.every(Number.isFinite)||a[1]<0||a[1]>=60||a[2]<0||a[2]>=60||a[3]!==undefined&&(a[3]<0||a[3]>=1000000))return null;return Math.sign(a[0]||1)*(Math.abs(a[0])+a[1]/60+a[2]/3600+(a[3]||0)/3600000000);};
 if(siteEntity&&!siteEntity.ambiguous){const lat=dms(siteEntity.args[9]),lon=dms(siteEntity.args[10]);if(lat!==null&&lon!==null&&Math.abs(lat)<=85&&Math.abs(lon)<=180&&(lat!==0||lon!==0))site={latitude:lat,longitude:lon,placement:placement(siteEntity.args[5])};}
 let context=null;
 if(conversion&&!conversion.ambiguous){const a=conversion.args,crs=get(a[1]);context=get(a[0]);const name=crs?.args?.[0]||'',epsg=name.match(/EPSG[^0-9]*(\d{4,5})['\s]*$/i);const east=number(a[2]),north=number(a[3]),x=number(a[5])??1,y=number(a[6])??0,scale=number(a[7])??1,mapUnit=crs?.args?.[6]==='$'?1:unit(crs?.args?.[6]);if(crs?.type==='IFCPROJECTEDCRS'&&epsg&&[east,north,x,y,scale,mapUnit].every(Number.isFinite)&&Math.hypot(x,y)>1e-10&&scale>0&&sourceUnit)projected={epsg:Number(epsg[1]),east,north,x:x/Math.hypot(x,y),y:y/Math.hypot(x,y),scale,mapUnit,sourceUnit};else reason='Die IFC-Koordinatenreferenz oder Längeneinheit ist unvollständig.';}
 else if(conversion?.ambiguous)reason='Mehrere IFC-Kartenumrechnungen vorhanden; bitte gezielt zuordnen.';
 if(!context){const ctx=first('IFCGEOMETRICREPRESENTATIONCONTEXT');if(ctx&&!ctx.ambiguous)context=ctx;}
 const wcs=context?.type==='IFCGEOMETRICREPRESENTATIONCONTEXT'?placement(context.args[4]):null;
 const identity=!!wcs&&Math.abs(wcs.x)<1e-6&&Math.abs(wcs.y)<1e-6&&Math.abs(wcs.angle)<1e-8;
 const trueNorth=context?.type==='IFCGEOMETRICREPRESENTATIONCONTEXT'?vector(context.args[5]):null;
 if(!identity&&(projected||site))reason='Das IFC-Kontextkoordinatensystem ist nicht eindeutig unterstützt. Kartengrundriss als Alternative prüfen.';
 return {projected,site,sourceUnit,identity,trueNorth,reason};
}
function definition(epsg){if(epsg===25832||epsg===25833)return `+proj=utm +zone=${epsg-25800} +ellps=GRS80 +units=m +no_defs`;if(epsg>=32601&&epsg<=32660)return `+proj=utm +zone=${epsg-32600} +datum=WGS84 +units=m +no_defs`;if(epsg>=32701&&epsg<=32760)return `+proj=utm +zone=${epsg-32700} +south +datum=WGS84 +units=m +no_defs`;if(epsg===3857)return 'EPSG:3857';return null;}
const normalize=a=>(a%360+360)%360;
function distance(a,b){return Math.hypot((a.latitude-b.latitude)*111320,(a.longitude-b.longitude)*111320*Math.cos(a.latitude*Math.PI/180));}
function rectangle(points){if(points.length<3)return null;let best;for(let i=0;i<points.length;i++){const next=points[(i+1)%points.length],a=Math.atan2(next[1]-points[i][1],next[0]-points[i][0]);if(!Number.isFinite(a))continue;const x=points.map(p=>p[0]*Math.cos(a)+p[1]*Math.sin(a)),y=points.map(p=>-p[0]*Math.sin(a)+p[1]*Math.cos(a));const w=Math.max(...x)-Math.min(...x),h=Math.max(...y)-Math.min(...y);if(w<.01||h<.01)continue;const v={long:Math.max(w,h),short:Math.min(w,h),angle:a+(h>w?Math.PI/2:0),area:w*h};if(!best||v.area<best.area)best=v;}return best;}
// Footprint matching against OpenStreetMap buildings near the address: the model is moved onto the real building
// (centroid), turned to the best of four orientations (overlap measured by sampling) and checked for size.
const polyArea=pts=>{let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=(pts[j][0]+pts[i][0])*(pts[j][1]-pts[i][1]);return Math.abs(a/2);};
function polyCentroid(pts){let a=0,cx=0,cy=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const f=pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1];a+=f;cx+=(pts[j][0]+pts[i][0])*f;cy+=(pts[j][1]+pts[i][1])*f;}if(Math.abs(a)<1e-9){const n=pts.length;return [pts.reduce((t,p)=>t+p[0],0)/n,pts.reduce((t,p)=>t+p[1],0)/n];}return [cx/(3*a),cy/(3*a)];}
function inside(pts,x,y){let r=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])r=!r;}return r;}
function overlap(a,b){
 const xs=[...a,...b].map(p=>p[0]),ys=[...a,...b].map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const step=Math.max(.2,Math.sqrt((x1-x0)*(y1-y0))/70);let both=0,either=0;
 for(let x=x0+step/2;x<x1;x+=step)for(let y=y0+step/2;y<y1;y+=step){const ia=inside(a,x,y),ib=inside(b,x,y);if(ia&&ib)both++;if(ia||ib)either++;}
 return either?both/either:0;
}
const turn=(pts,h,c,t)=>{const r=h*Math.PI/180,cs=Math.cos(r),sn=Math.sin(r);return pts.map(([x,y])=>{const dx=x-c[0],dy=y-c[1];return [t[0]+dx*cs-dy*sn,t[1]+dx*sn+dy*cs];});};
function footprintProposal(geometry,location,features,heading=0){
 if(!location||!geometry?.outline)return null;const model=rectangle(geometry.outline);if(!model)return null;
 const outline=geometry.outline,modelCentre=polyCentroid(outline),modelArea=polyArea(outline);if(modelArea<4)return null;
 const k=111320*Math.cos(location.latitude*Math.PI/180);
 const candidates=[];
 for(const f of features||[]){
  if(f.kind!=='building'||!Array.isArray(f.geometry)||f.geometry.length<3||f.geometry.length>400)continue;
  const points=f.geometry.map(p=>[(p[0]-location.longitude)*k,-(p[1]-location.latitude)*111320]);
  const centre=polyCentroid(points),dist=Math.hypot(centre[0],centre[1]),area=polyArea(points),hit=inside(points,0,0);
  if(!hit&&dist>60)continue;if(area<4)continue;const ratio=area/modelArea;if(ratio<.4||ratio>2.5)continue;
  const map=rectangle(points);if(!map)continue;const raw=(map.angle-model.angle)*180/Math.PI;
  const tries=[0,90,180,270].map(d=>normalize(raw+d)).map(h=>({h,iou:overlap(turn(outline,h,modelCentre,centre),points)}));
  tries.sort((a,b)=>b.iou-a.iou);
  candidates.push({points,centre,dist,hit,ratio,tries,score:tries[0].iou-(hit?0:.15)-dist/400});
 }
 candidates.sort((a,b)=>b.score-a.score);const best=candidates[0];if(!best||best.tries[0].iou<.45)return null;
 const delta=a=>Math.abs((a-heading+540)%360-180);
 const close=best.tries.filter(t=>t.iou>=best.tries[0].iou-.04).sort((a,b)=>delta(a.h)-delta(b.h));const chosen=close[0];
 const warnings=[`Auf den OpenStreetMap-Grundriss gesetzt (Deckung ${Math.round(chosen.iou*100)} %).`];
 if(close.length>1)warnings.push('Der Grundriss ist symmetrisch: Ausrichtung um '+(Math.round(Math.abs(((close[1].h-chosen.h+540)%360)-180)))+'° mehrdeutig. Einmal in der Vorschau prüfen.');
 if(Math.abs(best.ratio-1)>.15)warnings.push(`Das Modell ist ${Math.round(Math.abs(1/best.ratio-1)*100)} % ${best.ratio<1?'größer':'kleiner'} als der Kartengrundriss. Maßstab bzw. Planmaße prüfen.`);
 if(candidates.length>1&&candidates[1].score>best.score-.1)warnings.push('Mehrere ähnliche Gebäude in der Nähe. Bitte prüfen, ob das richtige gewählt wurde.');
 // The map point is the model's geometry.center (x, z), so carry its offset from the outline centroid along.
 const anchor=turn([[geometry.center?.[0]??modelCentre[0],geometry.center?.[2]??modelCentre[1]]],chosen.h,modelCentre,best.centre)[0];
 return {latitude:location.latitude-anchor[1]/111320,longitude:location.longitude+anchor[0]/k,heading:chosen.h,meters_per_unit:1,source:'OpenStreetMap-Grundriss',
  confidence:'approximate',match:Math.round(chosen.iou*100)/100,warnings,can_apply:true};
}
function proposeGeoreference(content,geometry,location,view){
 if(!geometry||!Array.isArray(geometry.center)||geometry.center.length!==3||!geometry.center.every(x=>Number.isFinite(x)&&Math.abs(x)<1e9)||!Array.isArray(geometry.outline)||geometry.outline.length<3||geometry.outline.length>128||geometry.outline.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)||Math.abs(x)>100000)))throw Object.assign(Error('Ungültige Modellgeometrie für die Platzierung.'),{status:400});
 const ref=parseReference(content);let result=null,warnings=[];
 if(ref.projected&&ref.identity){const m=ref.projected,def=definition(m.epsg);if(def){const x=geometry.center[0]/m.sourceUnit,y=geometry.center[1]/m.sourceUnit;const e=(m.east+m.scale*(m.x*x-m.y*y))*m.mapUnit,n=(m.north+m.scale*(m.y*x+m.x*y))*m.mapUnit;try{const [lon,lat]=proj4(def,'EPSG:4326',[e,n]),[lon2,lat2]=proj4(def,'EPSG:4326',[e+m.scale*m.x*m.mapUnit/m.sourceUnit,n+m.scale*m.y*m.mapUnit/m.sourceUnit]);const east=(lon2-lon)*111320*Math.cos(lat*Math.PI/180),north=(lat2-lat)*111320;const unit=Math.hypot(east,north);if([lon,lat,unit].every(Number.isFinite)&&Math.abs(lat)<=85&&Math.abs(lon)<=180&&unit>=.0001&&unit<=1000)result={latitude:lat,longitude:lon,heading:normalize(-Math.atan2(north,east)*180/Math.PI),meters_per_unit:unit,source:'IFC-Georeferenz EPSG:'+m.epsg,confidence:'georeferenced',warnings:[],can_apply:true};}catch{warnings.push('Die IFC-Projektionskoordinaten konnten nicht sicher umgerechnet werden.');}}else warnings.push('Das IFC-Koordinatensystem EPSG:'+m.epsg+' wird noch nicht automatisch unterstützt.');}
 if(!result&&ref.site&&ref.identity&&ref.site.placement&&ref.trueNorth&&ref.sourceUnit){const [nx,ny]=ref.trueNorth,L=Math.hypot(nx,ny);if(L>1e-10){const p=ref.site.placement,dx=geometry.center[0]-p.x*ref.sourceUnit,dy=geometry.center[1]-p.y*ref.sourceUnit,e=(dx*ny-dy*nx)/L,n=(dx*nx+dy*ny)/L;result={latitude:ref.site.latitude+n/111320,longitude:ref.site.longitude+e/(111320*Math.cos(ref.site.latitude*Math.PI/180)),heading:normalize(-Math.atan2(nx,ny)*180/Math.PI),meters_per_unit:1,source:'IFC-Site-GPS und TrueNorth',confidence:'approximate',warnings:['IFC-Site-GPS ist meist weniger genau als eine projizierte Georeferenz. Vorschau bestätigen.'],can_apply:true};}}
 if(result&&location&&distance(result,location)>250){warnings.push('Die IFC-Georeferenz weicht mehr als 250 m vom gespeicherten Gebäudestandort ab. Der gespeicherte Punkt hat Vorrang.');result=null;}
 if(result)return result;
 if(ref.reason)warnings.push(ref.reason);
 const footprint=footprintProposal(geometry,location,view?.features,view?.heading||0);if(footprint)return {...footprint,warnings:[...warnings,...footprint.warnings]};
 return {latitude:location?.latitude??null,longitude:location?.longitude??null,heading:view?.heading||0,meters_per_unit:view?.meters_per_unit||1,source:location?'Gespeicherter Gebäudestandort':'Standort fehlt',confidence:'manual',can_apply:false,warnings:[...warnings,location?'Kein eindeutiger passender Kartengrundriss für eine automatische Drehung. Karte laden oder in Details nachstellen.':'Adresse einmal eingeben; danach kann der Kartengrundriss geprüft werden.']};
}
module.exports={parseReference,proposeGeoreference,footprintProposal,rectangle,splitArgs};
