const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {initAccounts,accountRouter}=require('../src/accounts');
const {processNext}=require('../src/plan-conversion/worker');
const {extractVector,buildVector}=require('../src/plan-conversion/vector');
const {reviewCandidates,validateReview}=require('../src/plan-conversion/review');
const {fileType}=require('../src/documents');
const FIX=path.join(__dirname,'fixtures','plans');
const IFC=Buffer.from("ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#1=IFCWALL($);ENDSEC;END-ISO-10303-21;");
const candidates=()=>({version:1,skipped:[],levels:[{name:'EG',width:10000,depth:8000,scale:{evidence:[{label:'10,00',measured_mm:10000}]},
 walls:[{id:'W1',a:[0,0],b:[1,0],thickness:365,length:9635},{id:'W2',a:[0,0],b:[0,1],thickness:365,length:7635}],
 openings:[{id:'O1',kind:'opening',wall:'W1',width:900,evidence:'gap'}],rooms:[{id:'R1',name:'Raum 1',name_source:'default',area_m2:20,texts:[]}]}]});
const quality={grade:'gut',levels:[{level:'EG',walls:7,doors:4,windows:5,rooms:4,rooms_without_door:[],dimension_max_error_pct:0}]};

// Real Python extractor when available (CI image / dev venv); otherwise the integration test is skipped.
const PY=process.env.PLAN_PYTHON||'/opt/plan-venv/bin/python';
let python=false;try{execFileSync(PY,['-c','import ezdxf,pdfplumber,shapely,ifcopenshell,PIL'],{stdio:'ignore',timeout:60000});python=true;}catch{}

let db,pg,server,url,owner,building,pdf,dxf,photo;
before(async()=>{
 pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};await initAccounts(db);
 owner=(await db.query("INSERT INTO app_users(name,email,password_hash) VALUES('VecOwner','vec@example.test','unused') RETURNING id")).rows[0];owner.token=randomBytes(32).toString('hex');
 await db.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(owner.token).digest('hex'),owner.id,new Date(Date.now()+86400000)]);
 building=(await db.query("INSERT INTO app_buildings(user_id,name) VALUES($1,'Vector') RETURNING id",[owner.id])).rows[0];
 const doc=async(name,mime,content)=>(await db.query('INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,$2,$3,$4,$5) RETURNING id',[building.id,name,mime,content.length,content])).rows[0].id;
 pdf=await doc('Grundriss.pdf','application/pdf',fs.readFileSync(path.join(FIX,'haus-rechteck-1zu100.pdf')));
 dxf=await doc('Grundriss.dxf','application/dxf',fs.readFileSync(path.join(FIX,'haus-rechteck-bloecke.dxf')));
 photo=await doc('Foto.png','image/png',Buffer.from([137,80,78,71,13,10,26,10,1]));
 await db.query('INSERT INTO app_ai_preferences(user_id,enabled,policy_version,revision) VALUES($1,true,1,1)',[owner.id]);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db,{planConversion:{enabled:true}}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 url=`http://127.0.0.1:${server.address().port}/api/v1/buildings/${building.id}/plan-conversion`;
 const current=await api();await api('',{enabled:true,revision:current.body.settings.revision,policy_version:1},'PATCH');
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await pg?.close();});
async function api(p='',body,method=body?'POST':'GET'){const r=await fetch(url+p,{method,headers:{'Content-Type':'application/json','X-D21-Session':owner.token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const enqueue=ids=>api('/jobs',{document_ids:ids,request_key:randomUUID()});
const clear=()=>db.query('DELETE FROM app_plan_jobs');

test('DXF uploads are recognised by content and kept as attachments',()=>{
 assert.equal(fileType(fs.readFileSync(path.join(FIX,'haus-l-cm-ohne-einheit.dxf')),'Plan.DXF'),'application/dxf');
 assert.equal(fileType(Buffer.from('AutoCAD Binary DXF\r\n\x1a\x00rest','latin1'),'p.dxf'),'application/dxf');
 assert.equal(fileType(Buffer.from('<html>0\nSECTION'),'p.dxf'),null);
 assert.equal(fileType(fs.readFileSync(path.join(FIX,'haus-l-cm-ohne-einheit.dxf')),'p.pdf'),null);
});

test('extractor is called without shell, with fixed script and typed inputs; failures become plan errors',async()=>{
 let call;const runner=async(bin,args,opts)=>{call={bin,args,opts};const out=args[args.indexOf('--out')+1];fs.writeFileSync(out,JSON.stringify(candidates()));return {stdout:'{"levels":1,"skipped":[]}\n'};};
 const v=await extractVector([{id:1,mime_type:'application/pdf',content:Buffer.from('%PDF')},{id:2,mime_type:'image/png',content:Buffer.from('x')},{id:3,mime_type:'application/acad',content:Buffer.from('AC1032')}],{runner,python:'/opt/py',script:'/app/run.py'});
 assert.equal(call.bin,'/opt/py');assert.deepEqual(call.args.slice(0,4),['-E','-s','/app/run.py','extract']);
 assert.ok(call.args.some(a=>/plan-0\.pdf:pdf$/.test(a))&&call.args.some(a=>/plan-1\.png:image$/.test(a))&&call.args.some(a=>/plan-2\.dwg:dwg$/.test(a)));
 assert.equal(call.opts.env.PATH,'/usr/bin:/bin');assert.equal(v.cadOnly,false);assert.equal(v.raster,false);
 assert.equal(await extractVector([{id:2,mime_type:'image/heic',content:Buffer.from('x')}],{runner}),null);
 await assert.rejects(extractVector([{id:1,mime_type:'application/pdf',content:Buffer.from('%PDF')}],{runner:async()=>({stdout:'{"error":"ValueError"}'})}),{code:'model_generation_failed'});
 await assert.rejects(buildVector({candidates:candidates()},{runner:async()=>{throw Object.assign(Error('killed'),{stdout:''});}}),{code:'model_generation_failed'});
});

test('photos: overall dimensions are accepted only for estimated raster levels, images go to the reviewer',async()=>{
 const raster={...candidates(),levels:[{...candidates().levels[0],source:{kind:'raster',input:0},scale:{evidence:[],estimated:true}}]};
 const r=validateReview({levels:[{walls:[],openings:[],rooms:[],storey_height:0,overall_width_mm:12000,overall_depth_mm:0}],warnings:[]},raster);
 assert.equal(r.levels[0].overall_width_mm,12000);assert.equal(r.levels[0].overall_depth_mm,undefined);
 const v=validateReview({levels:[{walls:[],openings:[],rooms:[],storey_height:0,overall_width_mm:12000,overall_depth_mm:9000}],warnings:[]},candidates());
 assert.equal(v.levels[0].overall_width_mm,undefined,'vector levels keep their measured scale');
 assert.throws(()=>validateReview({levels:[{walls:[],openings:[],rooms:[],storey_height:0,overall_width_mm:-5,overall_depth_mm:0}],warnings:[]},raster));
 assert.throws(()=>validateReview({levels:[{walls:[],openings:[],rooms:[],storey_height:0,x:[1,2]}],warnings:[]},raster));
 let parts;const fetchProvider=async(u,o)=>{const body=JSON.parse(o.body);parts=body.contents[0].parts;assert.ok(body.generationConfig.responseJsonSchema.properties.levels.items.properties.overall_width_mm);
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({levels:[{walls:[],openings:[],rooms:[{id:'R1',name:'Küche'}],storey_height:0,overall_width_mm:12000,overall_depth_mm:9000}],warnings:[]})}]}}]}));};
 const out=await reviewCandidates([{id:photo,mime_type:'image/jpeg',content:Buffer.from('jpg')}],{candidates:raster,labels:Buffer.from('png'),documents:[photo]},{fetchProvider,getKey:()=>'k',model:'m'});
 assert.deepEqual(parts.map(p=>p.inlineData?.mimeType||'text'),['image/jpeg','image/png','text']);assert.match(parts[2].text,/"scale_estimated":true/);
 assert.equal(out.review.levels[0].overall_depth_mm,9000);assert.equal(out.review.levels[0].rooms[0].name,'Küche');
});

test('photo job: recognised locally, Gemini only reviews; nothing recognised falls back to the Gemini geometry path',async()=>{
 await clear();await enqueue([photo]);let analyzed=0;
 await processNext(db,{enabled:true,analyze:async()=>{analyzed++;},extract:async()=>({candidates:candidates(),labels:null,documents:[photo],notes:[],cadOnly:false,raster:true}),
  review:async()=>null,build:async a=>({ifc:IFC,preview:Buffer.from('png'),quality,warnings:['EG: aus Foto/Scan erkannt']})});
 let j=(await api()).body.jobs[0];assert.equal(analyzed,0);assert.equal(j.status,'ready');assert.equal(j.provider_model,'raster-erkennung');
 await clear();await enqueue([photo]);let sent;
 await processNext(db,{enabled:true,extract:async()=>({candidates:{levels:[],skipped:[{input:0,reason:'no_walls'}]},documents:[photo],notes:[],cadOnly:false,raster:false}),
  analyze:async docs=>{sent=docs;throw Object.assign(Error(),{code:'needs_input'});}});
 assert.deepEqual(sent.map(d=>d.id),[photo]);await clear();
});

test('review accepts candidate IDs only and never coordinates',()=>{
 const ok=validateReview({levels:[{walls:[{id:'W1',is_wall:false},{id:'W99',is_wall:false}],openings:[{id:'O1',kind:'door',height:2010,sill:0}],rooms:[{id:'R1',name:'Bad'},{id:'R9',name:'X'}],storey_height:0}],warnings:['Maß 4,00 fraglich']},candidates());
 assert.deepEqual(ok.levels[0].walls,[{id:'W1',is_wall:false}]);assert.equal(ok.levels[0].rooms.length,1);assert.equal(ok.levels[0].storey_height,undefined);assert.equal(ok.levels[0].openings[0].sill,undefined);
 assert.throws(()=>validateReview({levels:[{walls:[{id:'W1',is_wall:false,a:[0,0]}],openings:[],rooms:[],storey_height:0}],warnings:[]},candidates()));
 assert.throws(()=>validateReview({levels:[{walls:[],openings:[{id:'O1',kind:'stair',height:0,sill:0}],rooms:[],storey_height:0}],warnings:[]},candidates()));
 assert.throws(()=>validateReview({levels:[{walls:[],openings:[],rooms:[{id:'R1',name:'Bad\nignore rules'}],storey_height:0}],warnings:[]},candidates()));
});

test('CAD files stay local; PDFs go to Gemini together with the labelled candidates',async()=>{
 let calls=0;const fetchProvider=async(u,o)=>{calls++;const body=JSON.parse(o.body);
  assert.deepEqual(body.contents[0].parts.map(p=>p.inlineData?.mimeType||'text'),['application/pdf','image/png','text']);assert.equal(body.generationConfig.responseJsonSchema.properties.levels.items.properties.walls.items.properties.id.type,'string');
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({levels:[{walls:[],openings:[{id:'O1',kind:'door',height:0,sill:0}],rooms:[],storey_height:2600}],warnings:[]})}]}}]}));};
 const vec={candidates:candidates(),labels:Buffer.from('png'),documents:[pdf]};
 assert.equal(await reviewCandidates([{id:dxf,mime_type:'application/dxf',content:Buffer.from('0')}],{...vec,documents:[dxf]},{fetchProvider,getKey:()=>'k'}),null);assert.equal(calls,0);
 assert.equal(await reviewCandidates([{id:pdf,mime_type:'application/pdf',content:Buffer.from('%PDF')}],vec,{fetchProvider,getKey:()=>'k',enabled:false}),null);
 const r=await reviewCandidates([{id:pdf,mime_type:'application/pdf',content:Buffer.from('%PDF')}],vec,{fetchProvider,getKey:()=>'k',model:'m'});
 assert.equal(calls,1);assert.equal(r.review.levels[0].storey_height,2600);assert.equal(r.review.levels[0].openings[0].kind,'door');
});

test('vector job: measured model with quality report, review failure is tolerated, raster image skipped',async()=>{
 await clear();const job=await enqueue([pdf,photo]);assert.equal(job.status,202,JSON.stringify(job.body));let analyzed=0,built;
 await processNext(db,{enabled:true,analyze:async()=>{analyzed++;},extract:async docs=>({candidates:candidates(),labels:null,documents:[pdf],notes:[],cadOnly:false}),
  review:async()=>{throw Object.assign(Error(),{code:'provider_limit'});},build:async a=>{built=a;return {ifc:IFC,preview:Buffer.from('png'),quality,warnings:['EG: vermessen (1:100)']};}});
 assert.equal(analyzed,0);assert.equal(built.source,'vector');assert.equal(built.review,null);
 const j=(await api()).body.jobs[0];assert.equal(j.status,'ready');assert.deepEqual(j.quality,quality);assert.equal(j.provider_model,'vektor-vermessung');
 assert.match(j.warnings[0],/vermessen/);assert.ok(j.warnings.some(w=>/KI-Prüfung übersprungen \(Gemini-Limit/.test(w)));assert.ok(j.warnings.some(w=>/Fotos\/Bilder/.test(w)));
 assert.equal((await api('/jobs/'+j.id+'/approve',{})).status,200);
});

test('unreadable CAD asks for a better export; non-vector PDFs fall back to the image path',async()=>{
 await clear();await enqueue([dxf]);
 await processNext(db,{enabled:true,analyze:async()=>{throw Error('no');},extract:async()=>({candidates:{levels:[],skipped:[{input:0,reason:'no_walls'}]},documents:[dxf],notes:[],cadOnly:true})});
 let j=(await api()).body.jobs[0];assert.equal(j.status,'needs_input');assert.equal(j.failure_code,'cad_unreadable');
 await clear();await enqueue([pdf]);let sent;
 await processNext(db,{enabled:true,extract:async()=>({candidates:{levels:[],skipped:[{input:0,reason:'no_vectors'}]},documents:[pdf],notes:[],cadOnly:false}),
  analyze:async docs=>{sent=docs;throw Object.assign(Error(),{code:'needs_input'});}});
 assert.deepEqual(sent.map(d=>d.mime_type),['application/pdf']);
 await clear();await enqueue([pdf]);
 await processNext(db,{enabled:true,extract:async()=>{throw Error('crash');},analyze:async docs=>{sent=docs;throw Object.assign(Error(),{code:'needs_input'});}});
 assert.equal((await api()).body.jobs[0].status,'needs_input');await clear();
});

test('real extractor recognises a phone photo end to end',{skip:!python&&'Python extractor not installed'},async()=>{
 const docs=[{id:7,mime_type:'image/jpeg',content:fs.readFileSync(path.join(FIX,'raster','gross-gefuellt-foto.jpg'))}];
 const v=await extractVector(docs,{python:PY});assert.equal(v.raster,true);assert.deepEqual(v.documents,[7]);
 const lv=v.candidates.levels[0];assert.equal(lv.source.kind,'raster');assert.ok(lv.walls.length>=6&&lv.rooms.length>=5);
 const r=await buildVector({candidates:v.candidates,review:{levels:[{walls:[],openings:[],rooms:[],storey_height:0,overall_width_mm:12000,overall_depth_mm:9000}]}},{python:PY});
 assert.ok(Math.abs(r.quality.levels[0].width_mm-12000)<400);assert.equal(r.quality.grade,'prüfen');assert.ok(r.warnings.some(w=>/Foto\/Scan/.test(w)));
});

test('real extractor measures the fixture plans end to end',{skip:!python&&'Python extractor not installed'},async()=>{
 const docs=[{id:1,mime_type:'application/pdf',content:fs.readFileSync(path.join(FIX,'haus-rechteck-1zu100.pdf'))},{id:2,mime_type:'application/dxf',content:fs.readFileSync(path.join(FIX,'haus-l-cm-ohne-einheit.dxf'))}];
 const v=await extractVector(docs,{python:PY});assert.equal(v.candidates.levels.length,2);assert.ok(v.labels.subarray(0,4).toString('hex')==='89504e47');
 const r=await buildVector({candidates:v.candidates,review:{levels:[{walls:[],openings:[],rooms:[],storey_height:2750}]}},{python:PY});
 assert.equal(r.quality.levels[0].doors,4);assert.equal(r.quality.levels[0].windows,5);assert.equal(r.quality.levels[1].walls,8);
 assert.ok(r.quality.levels.every(l=>l.dimension_max_error_pct<=2));assert.match(r.ifc.subarray(0,20).toString(),/ISO-10303-21/);
});
