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
