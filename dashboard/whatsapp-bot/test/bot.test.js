import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize, changes, snapshot } from '../src/github.js';
import { cycle, readState, saveState } from '../src/worker.js';
const repository = 'team/project';
const row = (number, extra={}) => ({ number, title:'Aufgabe', state:'open', assignees:[], ...extra });
const snap = (issues=[], pulls=[]) => ({ issues:summarize(issues), pulls:summarize(pulls) });
test('first poll is a silent baseline; only selected changes generate messages', async () => {
 let sent=[], state=await cycle({state:null,repository,group:'preview',current:snap([row(1)]),save:async()=>{},send:async s=>sent.push(s)});
 assert.deepEqual(sent,[]);
 state=await cycle({state,repository,group:'preview',current:snap([row(1,{assignees:[{login:'Josef'}]}),row(2)], [row(3,{state:'closed',merged_at:'2026-11-02'})]),save:async()=>{},send:async s=>sent.push(s)});
 assert.equal(sent.length,3); assert.match(sent[0],/Zuweisung geändert/);assert.match(sent[2],/zusammengeführt/);
 const same=changes(state.snapshot.issues,state.snapshot.issues,'issue',repository);assert.deepEqual(same,[]);
});
test('failed send is durable and can be retried after restart without replaying sent items', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'d21-bot-test-')),path=join(directory,'state.json');
 const initial={version:1,repository,group:'123@g.us',snapshot:snap([row(1)]),queue:[]};
 await assert.rejects(cycle({state:initial,repository,group:'123@g.us',current:snap([row(1),row(2)]),save:s=>saveState(path,s),send:async()=>{throw Error('offline')},preview:false}),/offline/);
 const persisted=await readState(path); assert.equal(persisted.queue.length,1);
 const sent=[];await cycle({state:persisted,repository,group:'123@g.us',current:persisted.snapshot,save:s=>saveState(path,s),send:async s=>sent.push(s),preview:false});
 assert.equal(sent.length,1);assert.equal((await readState(path)).queue.length,0);
 await writeFile(path,'broken');await assert.rejects(readState(path));
});
test('switching repository or destination cannot leak a previous queue',async()=>{
 const state={version:1,repository,group:'123@g.us',snapshot:snap(),queue:[{text:'private'}]};
 await assert.rejects(cycle({state,repository,group:'999@g.us',current:snap(),save:async()=>{},send:async()=>{assert.fail()}}),/Zielgruppe/);
});
test('private repository is blocked before collecting issues; pagination and merged PRs work',async()=>{
 let calls=0;
 await assert.rejects(snapshot({repository,fetcher:async()=>{calls++;return {ok:true,json:async()=>({private:true})}}}),/Private/);assert.equal(calls,1);
 const result=await snapshot({repository,fetcher:async url=>({ok:true,json:async()=>{
  if(!url.includes('?'))return {private:false};
  if(url.includes('/pulls?'))return [row(9,{merged_at:'2026-11-02',state:'closed'})];
  if(new URL(url).searchParams.get('page') === '1')return Array.from({length:100},(_,i)=>row(i+1,i===0?{pull_request:{}}:{}));
  return [row(101)];
 }})});
 assert.equal(Object.keys(result.issues).length,100);assert.equal(result.pulls['9'].merged,true);
});
test('GitHub failure never becomes an empty successful snapshot',async()=>{
 await assert.rejects(snapshot({repository,fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
 assert.match(changes(summarize([]),summarize([row(1,{title:'X\n*Y*'})]),'issue',repository)[0],/X  Y /);
});
