const {test}=require('node:test');const assert=require('node:assert/strict');const {parseReference,proposeGeoreference,footprintProposal,splitArgs}=require('../src/georeference');
const geometry={center:[0,0,0],outline:[[-10,-5],[10,-5],[10,5],[-10,5]]};
const ifc=`#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#2=IFCUNITASSIGNMENT((#1));#3=IFCPROJECT('p',$,$,$,$,$,$,$,#2);#4=IFCCARTESIANPOINT((0.,0.,0.));#5=IFCAXIS2PLACEMENT3D(#4,$,$);#6=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.001,#5,$);#7=IFCPROJECTEDCRS('EPSG:25832',$,$,$,$,$,#1);#8=IFCMAPCONVERSION(#6,#7,500000.,5538630.,0.,1.,0.,1.);`;
test('STEP nested and quoted arguments',()=>assert.deepEqual(splitArgs("'a,b',(#1,#2),$"),["'a,b'","(#1,#2)",'$']));
test('UTM IFC location, metre scale and north',()=>{const r=proposeGeoreference(ifc,geometry,null,null);assert.equal(r.confidence,'georeferenced');assert.ok(Math.abs(r.latitude-50)<.001);assert.ok(Math.abs(r.longitude-9)<.001);assert.ok(r.meters_per_unit>.99&&r.meters_per_unit<1.01);assert.ok(Math.min(r.heading,360-r.heading)<.01)});
test('IFC centre offset is applied before projection',()=>{const a=proposeGeoreference(ifc,geometry,null,null),b=proposeGeoreference(ifc,{...geometry,center:[100,0,0]},null,null);assert.ok(b.longitude>a.longitude)});
test('conflicting saved location is preserved',()=>{const r=proposeGeoreference(ifc,geometry,{latitude:52,longitude:13},null);assert.equal(r.can_apply,false);assert.equal(r.latitude,52)});
test('duplicate transforms refuse automatic georeferencing',()=>assert.equal(parseReference(ifc+"#9=IFCMAPCONVERSION(#6,#7,0.,0.,0.,1.,0.,1.);").projected,null));
test('missing location and invalid geometry fail safely',()=>{assert.equal(proposeGeoreference('',geometry,null,null).can_apply,false);assert.throws(()=>proposeGeoreference(ifc,{center:[],outline:[]},null,null),/Ungültige/)});
test('matching rectangle gives approximate proposal without rescaling',()=>{const location={latitude:50,longitude:9};const points=geometry.outline.map(([x,z])=>[9+x/(111320*Math.cos(50*Math.PI/180)),50-z/111320]);const r=footprintProposal(geometry,location,[{kind:'building',geometry:points}]);assert.equal(r.confidence,'approximate');assert.equal(r.meters_per_unit,1);assert.ok(r.warnings.some(w=>/180/.test(w)),r.warnings.join(' | '))});

test('footprint: model is moved onto the real building, turned to the best overlap and size is checked',()=>{
 const location={latitude:50,longitude:9},k=111320*Math.cos(50*Math.PI/180);
 const toMap=(pts,dx,dy,deg)=>{const r=deg*Math.PI/180;return pts.map(([x,y])=>{const X=x*Math.cos(r)-y*Math.sin(r)+dx,Y=x*Math.sin(r)+y*Math.cos(r)+dy;return [9+X/k,50-Y/111320];});};
 const L=[[-8,-6],[8,-6],[8,0],[0,0],[0,6],[-8,6]];   // L-shape, not symmetric
 const g={center:[0,0,0],outline:L};
 const r=footprintProposal(g,location,[{kind:'building',geometry:toMap(L,25,-12,30)},{kind:'building',geometry:toMap([[-3,-3],[3,-3],[3,3],[-3,3]],-40,30,0)}]);
 assert.ok(r&&r.can_apply);assert.ok(Math.abs(r.heading-30)<3,String(r.heading));
 const c=[(r.longitude-9)*k,-(r.latitude-50)*111320];const lc=[[-8,-6],[8,-6],[8,0],[0,0],[0,6],[-8,6]];
 assert.ok(Math.hypot(c[0]-25,c[1]+12)<0.6,'centred on the OSM building, not on the address point: '+c);
 assert.ok(!r.warnings.some(w=>/mehrdeutig/.test(w)),'L-shape has one best orientation');
 const big=footprintProposal(g,location,[{kind:'building',geometry:toMap(L.map(([x,y])=>[x*1.4,y*1.4]),0,0,0)}]);
 assert.ok(big.warnings.some(w=>/kleiner als der Kartengrundriss/.test(w)),big.warnings.join(' | '));
 assert.equal(footprintProposal(g,location,[{kind:'building',geometry:toMap(L,200,0,0)}]),null,'far away buildings are ignored');
});
