// Pure geometry of the plan correction editor (mm, y up), shared logic with the iOS editor. No React here.
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],len=v=>Math.hypot(v[0],v[1]);
export function project(p,a,b){
 const d=sub(b,a),l2=Math.max(d[0]*d[0]+d[1]*d[1],1e-9),t=Math.min(Math.max(((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l2,0),1);
 const q=[a[0]+d[0]*t,a[1]+d[1]*t];return {t,point:q,distance:len(sub(p,q))};
}
/** Right angles: snap to horizontal/vertical from start, to nearby wall ends and wall lines (tolerance in mm). */
export function snap(p,start,walls,tolerance=250){
 let q=[...p],horizontal=false;
 if(start){horizontal=Math.abs(q[0]-start[0])>Math.abs(q[1]-start[1]);if(horizontal)q[1]=start[1];else q[0]=start[0];}
 const ends=walls.flatMap(w=>[w.a,w.b]);let best=null;
 for(const e of ends){const d=len(sub(e,q));if(d<tolerance&&(!best||d<best.d))best={d,e};}
 if(best){if(!start)return [...best.e];if(horizontal)q[0]=best.e[0];else q[1]=best.e[1];return q;}
 for(const w of walls){
  if((!start||horizontal)&&Math.abs(w.a[0]-w.b[0])<1&&Math.abs(q[0]-w.a[0])<tolerance)q[0]=w.a[0];
  if((!start||!horizontal)&&Math.abs(w.a[1]-w.b[1])<1&&Math.abs(q[1]-w.a[1])<tolerance)q[1]=w.a[1];
 }
 return q;
}
let counter=0;const newId=p=>`${p}${++counter}`;
/** Moves a wall perpendicular to itself; openings on it and wall ends touching it follow. */
export function moveWall(level,original,id,delta){
 const w=original.walls.find(x=>x.id===id);if(!w)return level;
 const horizontal=Math.abs(w.a[1]-w.b[1])<Math.abs(w.a[0]-w.b[0]),d=horizontal?[0,delta[1]]:[delta[0],0];
 const add=p=>[p[0]+d[0],p[1]+d[1]];
 return {...level,
  walls:original.walls.map(o=>o.id===id?{...o,a:add(o.a),b:add(o.b)}:{...o,a:project(o.a,w.a,w.b).distance<1?add(o.a):o.a,b:project(o.b,w.a,w.b).distance<1?add(o.b):o.b}),
  openings:original.openings.map(o=>o.wall===id?{...o,at:add(o.at)}:o)};
}
export function removeItem(level,id){return {...level,walls:level.walls.filter(w=>w.id!==id),openings:level.openings.filter(o=>o.id!==id&&o.wall!==id)};}
export function addWall(level,a,b){
 if(len(sub(b,a))<300)return null;const w={id:newId('n'),a,b,thickness:115};return {level:{...level,walls:[...level.walls,w]},id:w.id};
}
export function addOpening(level,kind,p){
 const hits=level.walls.map(w=>({w,h:project(p,w.a,w.b)})).filter(x=>x.h.distance<=Math.max(x.w.thickness,400)).sort((x,y)=>x.h.distance-y.h.distance);
 const width=kind==='door'?885:1260;const hit=hits[0];if(!hit||len(sub(hit.w.b,hit.w.a))<width+100)return null;
 const o={id:newId('o'),kind,wall:hit.w.id,at:hit.h.point,width};return {level:{...level,openings:[...level.openings,o]},id:o.id};
}
/** The recognition bridged a wall across an open passage (corridor): cut the wall at this opening. */
export function openWall(level,openingId){
 const o=level.openings.find(x=>x.id===openingId),w=o&&level.walls.find(x=>x.id===o.wall);if(!w)return level;
 const d=sub(w.b,w.a),l=Math.max(len(d),1),u=[d[0]/l,d[1]/l];
 const p1=[o.at[0]-u[0]*o.width/2,o.at[1]-u[1]*o.width/2],p2=[o.at[0]+u[0]*o.width/2,o.at[1]+u[1]*o.width/2];
 const first={...w,id:newId('n'),b:p1},second={...w,id:newId('n'),a:p2};
 return {...level,walls:[...level.walls.filter(x=>x.id!==w.id),...[first,second].filter(x=>len(sub(x.b,x.a))>=100)],
  openings:level.openings.filter(x=>x.id!==openingId).map(x=>x.wall!==w.id?x:{...x,wall:project(x.at,w.a,p1).distance<1?first.id:second.id})};
}
const r1=v=>Math.round(v*10)/10,pt=p=>[r1(p[0]),r1(p[1])];
/** Request body for POST …/edit; generic "Raum 3" names are left to the server's renumbering. */
export function editBody(levels,references){
 return {levels:levels.map((l,i)=>({walls:l.walls.map(w=>({id:w.id,a:pt(w.a),b:pt(w.b),thickness:w.thickness})),
  openings:l.openings.filter(o=>l.walls.some(w=>w.id===o.wall)).map(o=>({id:o.id,kind:o.kind,wall:o.wall,at:pt(o.at),width:Math.round(o.width)})),
  rooms:l.rooms.filter(r=>!/^Raum \d+$/.test(r.name)).map(r=>({point:pt(r.point),name:r.name})),
  ...(references[i]?{reference:{a:pt(references[i].a),b:pt(references[i].b),mm:references[i].mm}}:{})}))};
}
