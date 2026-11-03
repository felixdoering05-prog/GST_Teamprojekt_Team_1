// Self-authored geometric sample. This is deliberately not a reconstruction of D21.
export function exampleIFC() {
  const rows = [];
  let next = 1;
  const add = line => { const id = next++; rows.push(`#${id}=${line};`); return id; };
  const guid = () => `0D21Example${String(next).padStart(12, '0')}`;
  const point = (x, y, z) => add(`IFCCARTESIANPOINT((${x}.,${y}.,${z}.))`);
  const origin = point(0, 0, 0);
  const up = add('IFCDIRECTION((0.,0.,1.))');
  const east = add('IFCDIRECTION((1.,0.,0.))');
  const axes = add(`IFCAXIS2PLACEMENT3D(#${origin},#${up},#${east})`);
  const placement = add(`IFCLOCALPLACEMENT($,#${axes})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axes},$)`);
  const metre = add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const units = add(`IFCUNITASSIGNMENT((#${metre}))`);
  const project = add(`IFCPROJECT('${guid()}',$,'Beispielcampus',$,$,$,$,(#${context}),#${units})`);
  const building = add(`IFCBUILDING('${guid()}',$,'Beispielhaus',$,$,#${placement},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,#${project},(#${building}))`);
  const p2 = add('IFCCARTESIANPOINT((0.,0.))');
  const a2 = add(`IFCAXIS2PLACEMENT2D(#${p2},$)`);
  const number = n => Number.isInteger(n) ? `${n}.` : String(n);
  function box(type, name, x, y, z, width, depth, height) {
    const p = add(`IFCCARTESIANPOINT((${[x, y, z].map(number).join(',')}))`);
    const a = add(`IFCAXIS2PLACEMENT3D(#${p},#${up},#${east})`);
    const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,'Box',#${a2},${number(width)},${number(depth)})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${a},#${up},${number(height)})`);
    const rep = add(`IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',(#${solid}))`);
    const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}))`);
    const suffix = type === 'IFCSLAB' ? ',.FLOOR.' : type === 'IFCWALL' ? ',.STANDARD.' : type === 'IFCWINDOW' ? ',$,$,.WINDOW.,.NOTDEFINED.,$' : type === 'IFCSPACE' ? ",'Beispielraum',.ELEMENT.,.INTERNAL.,$" : '';
    return add(`${type}('${guid()}',$,'${name}',$,$,#${placement},#${shape},$${suffix})`);
  }
  const storeys = [];
  for (let floor = 0; floor < 3; floor++) {
    const z = floor * 3.6;
    const storey = add(`IFCBUILDINGSTOREY('${guid()}',$,'${floor ? `Obergeschoss ${floor}` : 'Erdgeschoss'}',$,$,#${placement},$,$,.ELEMENT.,${number(z)})`);
    storeys.push(storey);
    const elements = [box('IFCSLAB', 'Geschossplatte', 0, 0, z, 24.6, 15.6, .22)];
    for (const y of [-7.5, 7.5]) elements.push(box('IFCWALL', 'Fassade', 0, y, z + .22, 24, .3, 3.3));
    for (const x of [-12, 12]) elements.push(box('IFCWALL', 'Fassade', x, 0, z + .22, .3, 15, 3.3));
    for (const x of [-4, 4]) elements.push(box('IFCWALL', 'Innenwand', x, 0, z + .22, .18, 15, 3.3));
    elements.push(box('IFCWALL', 'Flurwand', 0, 2.4, z + .22, 24, .18, 3.3));
    for (const y of [-7.68, 7.68]) for (let x = -10.5; x <= 10.5; x += 3) elements.push(box('IFCWINDOW', 'Fenster', x, y, z + 1.1, 1.9, .08, 1.7));
    for (const x of [-12.18, 12.18]) for (const y of [-5.4, -1.8, 1.8, 5.4]) elements.push(box('IFCWINDOW', 'Fenster', x, y, z + 1.1, .08, 2, 1.7));
    if (floor === 2) elements.push(box('IFCSLAB', 'Dachplatte', 0, 0, z + 3.5, 24.8, 15.8, .3));
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',$,$,$,(${elements.map(id => `#${id}`).join(',')}),#${storey})`);
  }
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,#${building},(${storeys.map(id => `#${id}`).join(',')}))`);
  return new TextEncoder().encode(`ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Synthetic architectural preview, not D21'),'2;1');\nFILE_NAME('beispielhaus.ifc','2026-11-03T12:00:00',('D21 Team'),('D21'),'D21','D21','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${rows.join('\n')}\nENDSEC;\nEND-ISO-10303-21;`);
}
