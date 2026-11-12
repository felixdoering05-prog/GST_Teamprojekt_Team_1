const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PasswordWorkGate}=require('../src/password-work');
test('password slots remain occupied until real work settles, including errors',async()=>{
 const gate=new PasswordWorkGate(1);let release;
 const first=gate.run(()=>new Promise(r=>{release=r;}));
 // A caller abandoning its HTTP response cannot free an outstanding computation.
 await assert.rejects(gate.run(()=>{throw Error('must not execute');}),{status:429});
 release('done');assert.equal(await first,'done');assert.equal(gate.active,0);
 await assert.rejects(gate.run(async()=>{throw Error('computation failed');}),/computation failed/);
 assert.equal(await gate.run(async()=>42),42);assert.equal(gate.active,0);
});
