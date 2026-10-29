// Independent check for the vertical swept room solids emitted by this workflow.
// Unsupported representations fail explicitly; this is not a general IFC validator.
import {readFile,writeFile} from 'node:fs/promises';
const [ifcPath,revitReportPath,outputPath]=process.argv.slice(2);
if(!ifcPath||!revitReportPath||!outputPath)throw Error('Usage: node check-ifc-spaces.mjs model.ifc pruefung.json ifc-pruefung.json');
const text=await readFile(ifcPath,'utf8');
const entities=new Map([...text.matchAll(/#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\);/g)].map(m=>[+m[1],{id:+m[1],type:m[2],args:m[3]}]));
function split(s){let a=[],start=0,depth=0,q=false;for(let i=0;i<s.length;i++){if(s[i]==="'"){if(q&&s[i+1]==="'"){i++;continue;}q=!q;}if(!q){if(s[i]==='(')depth++;if(s[i]===')')depth--;if(s[i]===','&&depth===0){a.push(s.slice(start,i).trim());start=i+1;}}}a.push(s.slice(start).trim());return a;}
const refs=s=>[...s.matchAll(/#(\d+)/g)].map(m=>+m[1]);
const get=s=>{const e=entities.get(refs(s)[0]);if(!e)throw Error('Missing IFC reference: '+s);return e;};
const decode=s=>s.replace(/^'|'$/g,'').replace(/\\X2\\([0-9a-f]+)\\X0\\/gi,(_,h)=>h.match(/.{4}/g).map(x=>String.fromCharCode(parseInt(x,16))).join('')).replace(/\\X\\([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/''/g,"'");
function point(e){if(e.type!=='IFCCARTESIANPOINT')throw Error('Unsupported point: '+e.type);return split(e.args.slice(1,-1)).map(Number);}
function loopArea(e){
 if(e.type!=='IFCPOLYLINE')throw Error('Unsupported boundary curve: '+e.type);
 const pts=refs(e.args).map(id=>point(entities.get(id)));
 if(pts.length<4||Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-7)throw Error('Open or degenerate IFC profile');
 let area=0;for(let i=1;i<pts.length;i++)area+=pts[i-1][0]*pts[i][1]-pts[i][0]*pts[i-1][1];
 if(!Number.isFinite(area)||Math.abs(area)<1e-12)throw Error('Zero-area IFC profile');return Math.abs(area)/2;
}
function profileArea(e){const a=split(e.args);if(e.type==='IFCRECTANGLEPROFILEDEF'){const w=+a[3],h=+a[4];if(w<=0||h<=0)throw Error('Invalid rectangle');return w*h;}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF')return loopArea(get(a[2]));if(e.type==='IFCARBITRARYPROFILEDEFWITHVOIDS')return loopArea(get(a[2]))-refs(a[3]).reduce((sum,id)=>sum+loopArea(entities.get(id)),0);throw Error('Unsupported profile '+e.type);}
const unit=[...entities.values()].find(e=>e.type==='IFCSIUNIT'&&e.args==='*,.LENGTHUNIT.,$,.METRE.');
if(!unit)throw Error('Only metre-based exports are supported');
const report=JSON.parse(await readFile(revitReportPath,'utf8'));
const expected=report.Geometry??report.Rooms;
if(!Array.isArray(expected)||!expected.length)throw Error('Missing Revit geometry report');
const spaces=[];
for(const e of entities.values()){
 if(e.type!=='IFCSPACE')continue;const a=split(e.args),shape=get(a[6]);
 if(shape.type!=='IFCPRODUCTDEFINITIONSHAPE')throw Error('No product shape');
 const body=refs(split(shape.args)[2]).map(id=>entities.get(id)).find(e=>split(e.args)[1]==="'Body'");
 if(!body)throw Error('No Body representation for '+a[2]);
 let area=0,volume=0;const solids=refs(split(body.args)[3]);
 if(solids.length!==1)throw Error('Expected one swept room solid');
 for(const id of solids){const solid=entities.get(id);if(solid.type!=='IFCEXTRUDEDAREASOLID')throw Error('Unsupported solid '+solid.type);const s=split(solid.args),dir=get(s[2]);const direction=split(dir.args.slice(1,-1)).map(Number);if(direction.length!==3||Math.abs(direction[0])+Math.abs(direction[1])>1e-10||Math.abs(direction[2]-1)>1e-10)throw Error('Nonvertical extrusion');const ar=profileArea(get(s[0])),depth=+s[3];if(ar<=0||depth<=0)throw Error('Nonpositive room geometry');area+=ar;volume+=ar*depth;}
 const parent=[...entities.values()].filter(x=>x.type==='IFCRELAGGREGATES').find(x=>refs(split(x.args)[5]).includes(e.id));
 if(!parent||get(split(parent.args)[4]).type!=='IFCBUILDINGSTOREY')throw Error('Space has no building storey');
 const number=decode(a[2]),name=decode(a[7]);const rv=expected.find(r=>r.Number===number);
 if(!rv||Math.abs(volume-(rv.Volume??rv.VolumeM3))>1e-5||Math.abs(area-(rv.Area??rv.AreaM2))>1e-5)throw Error('Revit/IFC room geometry mismatch: '+number);
 spaces.push({number,name,globalId:decode(a[0]),storeyId:get(split(parent.args)[4]).id,areaM2:area,volumeM3:volume,bodyType:split(body.args)[2]});
}
if(spaces.length!==expected.length||new Set(spaces.map(s=>s.globalId)).size!==spaces.length)throw Error('Space count or GlobalId mismatch');
await writeFile(outputPath,JSON.stringify({status:'IFCSPACE body geometry, positive analytical volume, storey, identifiers and Revit area/volume agreement checked; plan accuracy and completeness are separate',ifcPath,spaceCount:spaces.length,spaces},null,2));
console.log(JSON.stringify({spaceCount:spaces.length,status:'passed',outputPath}));
