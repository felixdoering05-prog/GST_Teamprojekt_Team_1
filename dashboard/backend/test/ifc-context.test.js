const {test}=require('node:test'),assert=require('node:assert/strict');
const {facts,ifcContext}=require('../src/ifc-context');
test('IFC context distinguishes missing reports from absent entity types',()=>{
 assert.equal(facts({},0).ifc_space_count,null);
 assert.equal(facts({counts:{}},0).ifc_space_count,0);
 assert.equal(facts({counts:{IfcSpace:-1}},0).ifc_space_count,null);
 assert.equal(facts({counts:{IfcSpace:'241'}},0).ifc_space_count,null);
 assert.equal(facts({counts:{IfcSpace:241,IfcBuildingStorey:5}},0).ifc_storey_count,5);
});
test('bounded numeric-only summary scopes database query to building and selection',async()=>{
 let args;const db={query:async(sql,params)=>{args={sql,params};return {rows:Array.from({length:4},()=>({counts:{IfcSpace:241},rooms:[{name:'PRIVATE ROOM'}]}))}}};
 const result=await ifcContext(db,10,25);
 assert.deepEqual(args.params,[10,25]);assert.match(args.sql,/d.building_id=\$1/);assert.match(args.sql,/a.status='ready'/);
 assert.equal(result.ifc_models.length,3);assert.equal(result.more_models_available,true);assert.equal(JSON.stringify(result).includes('PRIVATE ROOM'),false);
});
