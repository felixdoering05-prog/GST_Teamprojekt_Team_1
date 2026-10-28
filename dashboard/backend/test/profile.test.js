const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {initAccounts,accountRouter}=require('../src/accounts');
let db,server,url,alice,bob;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=','base64');
before(async()=>{
 const pg=new PGlite();await pg.waitReady;db={query:(sql,params)=>pg.query(sql,params),end:()=>pg.close()};
 await initAccounts(db);
 const app=express();app.use(express.json());app.use('/api/v1',accountRouter(db));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}/api/v1`;
 async function register(name){const r=await fetch(url+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email:name+'@example.test',password:'Synthetic-test-passphrase'})});assert.equal(r.status,201);return (await r.json()).token;}
 alice=await register('alice');bob=await register('bob');
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
function get(token){return fetch(url+'/profile/avatar',{headers:token?{'X-D21-Session':token}:{}})}
function put(body,token=alice){return fetch(url+'/profile/avatar',{method:'PUT',headers:{'Content-Type':'application/octet-stream',...(token?{'X-D21-Session':token}:{})},body})}
test('profile picture requires authentication',async()=>{assert.equal((await get()).status,401);assert.equal((await put(png,'')).status,401)});
test('missing picture returns 404 without changing the account',async()=>{assert.equal((await get(alice)).status,404);assert.equal((await db.query('SELECT COUNT(*) AS count FROM app_users')).rows[0].count,2)});
test('picture round-trips and is private to its account',async()=>{
 assert.equal((await put(png)).status,200);
 const r=await get(alice);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await r.arrayBuffer()),png);
 assert.equal((await get(bob)).status,404);
});
test('replacing an avatar updates one row and preserves other accounts',async()=>{
 const jpeg=Buffer.from([255,216,255,224,0,1,2]);assert.equal((await put(jpeg)).status,200);
 assert.equal((await db.query('SELECT COUNT(*) AS count FROM app_avatars')).rows[0].count,1);
 const r=await get(alice);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await r.arrayBuffer()),jpeg);
 assert.equal((await get(bob)).status,404);
});
test('non-images, empty content and oversized pictures rejected',async()=>{
 assert.equal((await put(Buffer.from('%PDF-1.4'))).status,415);
 assert.equal((await put(Buffer.from('AC1032'))).status,415);
 assert.equal((await put(Buffer.alloc(0))).status,400);
 assert.equal((await put(Buffer.alloc(2*1024*1024+1))).status,413);
});
test('idempotent initialization preserves avatars and per-user replacement',async()=>{
 await initAccounts(db);assert.equal((await get(alice)).status,200);
 assert.equal((await put(png,bob)).status,200);assert.equal((await db.query('SELECT COUNT(*) AS count FROM app_avatars')).rows[0].count,2);
});
