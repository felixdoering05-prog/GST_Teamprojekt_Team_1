const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts}=require('../src/accounts');
const {documentsTool,readDocumentTool}=require('../src/assistant-documents');
let db,pg,building,pdf,ifc;
before(async()=>{
 pg=new PGlite();await pg.waitReady;db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};await initAccounts(db);
 await db.query("INSERT INTO app_users(id,name,email,password_hash) VALUES(1,'O','o@example.test','x')");
 building=(await db.query("INSERT INTO app_buildings(user_id,name,address) VALUES(1,'Haus','') RETURNING id")).rows[0].id;
 pdf=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Garantie.pdf','application/pdf',9,$2) RETURNING id",[building,Buffer.from('%PDF-1.4\n')])).rows[0].id;
 ifc=(await db.query("INSERT INTO app_documents(building_id,name,mime_type,size,content) VALUES($1,'Haus.ifc','application/x-step',4,$2) RETURNING id",[building,Buffer.from('ISO-')])).rows[0].id;
});
after(()=>pg.close());
test('documents are listed with readability',async()=>{
 const r=await documentsTool(db,building);
 assert.deepEqual(r.documents.map(d=>[d.name,d.type,d.readable]),[['Haus.ifc','IFC-Modell',false],['Garantie.pdf','PDF',true]]);
});
test('read_document sends only the selected file and the question, returns a short answer',async()=>{
 let sent;const fetch=async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Garantie bis 30.06.2029 (Seite 2).'}]}}]})};};
 const r=await readDocumentTool(db,building,{document_id:pdf,question:'Wie lange gilt die Garantie?'},{getKey:()=>'k',fetch});
 assert.equal(r.answer,'Garantie bis 30.06.2029 (Seite 2).');
 assert.equal(sent.contents[0].parts[0].inline_data.mime_type,'application/pdf');
 assert.match(sent.contents[0].parts[1].text,/Garantie/);
 assert.match((await readDocumentTool(db,building,{document_id:ifc,question:'x'},{getKey:()=>'k',fetch})).error,/nur PDF und Fotos/);
 assert.match((await readDocumentTool(db,building+1,{document_id:pdf,question:'x'},{getKey:()=>'k',fetch})).error,/nicht in diesem Gebäude/);
 assert.match((await readDocumentTool(db,building,{document_id:pdf},{getKey:()=>'k',fetch})).error,/Frage/);
});
