import test from 'node:test';
import assert from 'node:assert/strict';
import {snap,moveWall,openWall,addOpening,editBody} from './planEditorModel.js';

const level={walls:[{id:'W1',a:[0,0],b:[10000,0],thickness:300},{id:'W2',a:[5000,0],b:[5000,8000],thickness:115},{id:'W3',a:[0,0],b:[0,8000],thickness:300}],
 openings:[{id:'O1',kind:'opening',wall:'W2',at:[5000,4000],width:1200},{id:'O2',kind:'door',wall:'W2',at:[5000,6500],width:885}],
 rooms:[{id:'R1',name:'Raum 1',point:[2000,2000]},{id:'R2',name:'Küche',point:[7000,2000]}]};

test('snap: right angles and wall ends',()=>{
 assert.deepEqual(snap([3000,130],[1000,100],level.walls),[3000,100]);
 assert.deepEqual(snap([4900,7900],null,level.walls),[5000,8000]);
});
test('moving a wall keeps it straight and carries its openings and attached ends',()=>{
 const moved=moveWall(level,level,'W2',[300,999]);
 assert.deepEqual(moved.walls.find(w=>w.id==='W2').a,[5300,0]);
 assert.deepEqual(moved.openings.find(o=>o.id==='O1').at,[5300,4000]);
 assert.deepEqual(moved.walls.find(w=>w.id==='W1').a,[0,0]);
});
test('opening a wall at a passage splits it and keeps other openings on the right piece',()=>{
 const l=openWall(level,'O1');
 assert.equal(l.walls.filter(w=>w.a[0]===5000&&w.b[0]===5000).length,2);
 assert.equal(l.openings.length,1);
 const host=l.walls.find(w=>w.id===l.openings[0].wall);assert.ok(host.a[1]>=4600);
});
test('doors snap onto the nearest long wall; body sends only real room names',()=>{
 assert.equal(addOpening(level,'door',[2500,90]).level.openings.at(-1).wall,'W1');
 assert.equal(addOpening(level,'door',[2500,3000]),null);
 const body=editBody([level],{0:{a:[0,0],b:[10000,0],mm:10000}});
 assert.deepEqual(body.levels[0].rooms,[{point:[7000,2000],name:'Küche'}]);
 assert.equal(body.levels[0].reference.mm,10000);
});
