const {test}=require('node:test');
const assert=require('node:assert/strict');
const {providerConfig,generate,HDA_BASE}=require('../src/ai-provider');
const {validateCommand,commandSchema}=require('../src/ifc-command');
const key='synthetic-hda-key-no-real-secret';
const config=()=>providerConfig({provider:'hda',model:'openai-gpt-oss-120b',enabled:true,getKey:()=>key});
const payload=()=>({systemInstruction:{parts:[{text:'Antworte kurz.'}]},contents:[{role:'user',parts:[{text:'Vorherige Frage'}]},{role:'model',parts:[{text:'Vorherige Antwort'}]},{role:'user',parts:[{text:'Neue Frage'}]}],generationConfig:{temperature:0.2}});
const response=(content,finish_reason='stop',extra={})=>({ok:true,json:async()=>({choices:[{finish_reason,message:{role:'assistant',content,...extra}}]})});
test('explicit provider config supports HDA model IDs and fails closed on missing config',()=>{
 assert.equal(config().ready(),true);
 for(const options of [{provider:'unknown'},{model:''},{model:'invalid model'},{getKey:()=>''},{getKey:()=>key+'\n'},{enabled:false}])assert.equal(providerConfig({provider:'hda',model:'model/test:1',enabled:true,getKey:()=>key,...options}).ready(),false);
});
test('Open WebUI request uses fixed HTTPS destination, Bearer, full bounded conversation and no tools',async()=>{
 let sent;
 const answer=await generate(config(),payload(),{fetch:async(url,options)=>{sent={url,options};return response('Testantwort', 'stop',{reasoning_content:'PRIVATE-REASONING'});}});
 assert.equal(answer,'Testantwort');assert.equal(sent.url,HDA_BASE+'/chat/completions');
 assert.equal(sent.options.headers.Authorization,'Bearer '+key);assert.equal(sent.options.redirect,'error');
 const body=JSON.parse(sent.options.body);assert.equal(body.model,'openai-gpt-oss-120b');assert.equal(body.stream,false);assert.equal(body.messages[0].role,'system');assert.equal(body.messages[2].role,'assistant');
 for(const field of ['tools','tool_ids','chat_id','features','files','stream_options'])assert.equal(Object.hasOwn(body,field),false);
 assert.equal(JSON.stringify(body).includes(key),false);
});
test('command JSON is requested as plain schema-constrained text and validated before use',async()=>{
 const p=payload();p.generationConfig.responseJsonSchema=commandSchema;
 const command={action:'hide',target:'walls',color:null,summary:'Wände ausblenden'};
 const answer=await generate(config(),p,{fetch:async(_url,options)=>{
  const body=JSON.parse(options.body);assert.ok(body.messages[0].content.includes('additionalProperties'));assert.ok(!body.response_format);return response(JSON.stringify(command));
 }});assert.deepEqual(validateCommand(JSON.parse(answer)),command);
 assert.throws(()=>validateCommand(JSON.parse('{"action":"delete","target":"all","color":null,"summary":"delete"}')));
});
test('partial responses, tool calls, embedded reasoning and invalid answers are rejected',async()=>{
 for(const data of [response('partial','length'),response('','stop'),response('x'.repeat(16001)),response('<think>private</think>answer'),response('tool','stop',{tool_calls:[{}]}),response('tool','stop',{function_call:{name:'run'}})])await assert.rejects(generate(config(),payload(),{fetch:async()=>data}),e=>e.code===502);
});
test('provider errors and quotas return safe codes with no fallback to another service',async()=>{
 for(const status of [401,403,429,500]){
  let calls=0;await assert.rejects(generate(config(),payload(),{fetch:async()=>{calls++;return {ok:false,status};}}),e=>e.code===(status===429?429:503)&&!e.message.includes(key));assert.equal(calls,1);
 }
});

test('HDA short-window limit returned as HTTP 400 is safely mapped to 429',async()=>{
 await assert.rejects(generate(config(),payload(),{fetch:async()=>({ok:false,status:400,json:async()=>({detail:'Rate limit exceeded: User 10s request limit reached (2 of 2)'})})}),e=>e.code===429);
});
