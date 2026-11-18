import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ElementAppearance} from './interactions.js';
import {applySharedState} from './sync.js';
test('authoritative shared state restores all submeshes and room lights without writing geometry',()=>{
 const appearance=new ElementAppearance();const a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:'#ffffff'})),b=a.clone();b.material=a.material.clone();
 appearance.add(10,a);appearance.add(10,b);appearance.select(10);
 const geometry=a.geometry;let light;
 const rooms=new Map([[20,value=>{light=value}]]);
 applySharedState({hidden:[10,999],colors:{10:'#00ff00'},lights:[20]},appearance,rooms);
 assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(a.material.color.getHexString(),'00ff00');assert.equal(b.material.color.getHexString(),'00ff00');assert.equal(light,true);assert.equal(appearance.selectedID,undefined);
 applySharedState({hidden:[],colors:{},lights:[]},appearance,rooms);
 assert.equal(a.visible,true);assert.equal(a.material.color.getHexString(),'ffffff');assert.equal(light,false);assert.equal(a.geometry,geometry);
});

test('device lights override manual scene state and carry brightness through both viewer synchronizers',async()=>{
 const {applySharedState:applyWeb}=await import('../../dashboard/base44-frontend/ifc-viewer/sync.js');
 for(const apply of [applySharedState,applyWeb]){
  const appearance=new ElementAppearance();let value;
  const rooms=new Map([[20,(...args)=>{value=args}]]);
  const state={hidden:[],colors:{},lights:[20]};
  apply(state,appearance,rooms,[{space_id:20,on:true,available:true,brightness:60}]);
  assert.deepEqual(value,[true,'#ffe7d3',true,true,60]);
  apply(state,appearance,rooms,[{space_id:20,on:false,available:true,rgb:[20,80,255],brightness:0}]);
  assert.deepEqual(value,[false,'#1450ff',true,true,0]);
  apply({hidden:[],colors:{},lights:[]},appearance,rooms,[]);
  assert.deepEqual(value,[false]);
 }
});
