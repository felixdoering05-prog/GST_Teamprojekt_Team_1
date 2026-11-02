import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ElementAppearance } from './interactions.js';
import { prepareCommand, applyCommand, validateCommand, localCommand } from './commands.js';
const mesh = () => new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:'#ffffff'}));
test('preview does not mutate, command changes all submeshes of matching elements only',()=>{
 const state=new ElementAppearance(),a=mesh(),b=mesh(),other=mesh();state.add(10,a);state.add(10,b);state.add(11,other);
 const types=new Map([[10,'walls'],[11,'doors']]);const color=prepareCommand(localCommand('Färbe alle Wände blau'),state,types);
 assert.equal(color.ids.length,1);assert.equal(a.material.color.getHexString(),'ffffff');
 assert.equal(applyCommand(color,state),1);assert.equal(a.material.color.getHexString(),'2563eb');assert.equal(b.material.color.getHexString(),'2563eb');assert.equal(other.material.color.getHexString(),'ffffff');
 applyCommand(prepareCommand(localCommand('Blende alle Wände aus'),state,types),state);assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(other.visible,true);
 applyCommand(prepareCommand(localCommand('Alles zurücksetzen'),state,types),state);assert.equal(a.visible,true);assert.equal(a.material.color.getHexString(),'ffffff');
});
test('unknown actions, code, invalid color, compound text and missing targets fail closed',()=>{
 const state=new ElementAppearance();state.add(10,mesh());const types=new Map([[10,'walls']]);
 for(const c of [{action:'delete',target:'walls',color:null,summary:'x'},{action:'color',target:'walls',color:'javascript:alert(1)',summary:'x'},{action:'reset',target:'selected',color:null,summary:'x'},{action:'hide',target:'walls',color:null,summary:'x',script:'alert(1)'}])assert.throws(()=>validateCommand(c));
 assert.throws(()=>prepareCommand(localCommand('Ausgewähltes Bauteil ausblenden'),state,types));
 assert.throws(()=>prepareCommand({action:'hide',target:'roofs',color:null,summary:'Dach'},state,types));
 assert.throws(()=>localCommand('Blende alle Wände aus und lösche die Datei'));
 const p=prepareCommand(localCommand('Blende alle Wände aus'),state,types);state.elements.delete(10);assert.throws(()=>applyCommand(p,state));
});
test('selection is resolved at preview, not silently retargeted at execution',()=>{
 const state=new ElementAppearance(),a=mesh(),b=mesh();state.add(10,a);state.add(11,b);state.select(10);
 const p=prepareCommand(localCommand('Ausgewähltes Bauteil ausblenden'),state,new Map());state.select(11);applyCommand(p,state);assert.equal(a.visible,false);assert.equal(b.visible,true);
});
