const {readFileSync}=require('node:fs');
const HDA_BASE='https://open-webui.lc.users.h-da.cloud/api';
const providerNames={gemini:'Google Gemini',hda:'h_da Open WebUI'};
function providerConfig(options={}){
 const provider=options.provider||process.env.AI_PROVIDER||'gemini';
 const enabled=options.enabled??((process.env.AI_ENABLED||process.env.GEMINI_ENABLED)==='true');
 const model=options.model||(provider==='hda'?process.env.HDA_MODEL:process.env.GEMINI_MODEL||'gemini-3.5-flash-lite');
 const getKey=options.getKey||(()=>readFileSync(provider==='hda'?(process.env.HDA_API_KEY_FILE||'/run/d21-ai/hda-api-key'):(process.env.GEMINI_API_KEY_FILE||'/run/d21-ai/gemini-api-key'),'utf8').trim());
 const ready=()=>{try{
  const key=getKey();return enabled&&Object.hasOwn(providerNames,provider)&&typeof model==='string'&&model.length<=200&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model)&&(provider!=='gemini'||/^gemini-[a-z0-9.-]+$/.test(model))&&typeof key==='string'&&key.length>=20&&key.length<=4096&&!/\s/.test(key);
 }catch{return false;}};
 return {provider,name:providerNames[provider]||'Unbekannter KI-Dienst',model,getKey,ready};
}
function providerError(code){const e=new Error('AI provider unavailable');e.code=code;return e;}
async function generate(config,payload,{fetch:fetchProvider=global.fetch,timeoutMs=30000}={}){
 let url,body,headers={'Content-Type':'application/json'};
 if(config.provider==='gemini'){
  url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  headers['x-goog-api-key']=config.getKey();body=payload;
 }else if(config.provider==='hda'){
  url=HDA_BASE+'/chat/completions';headers.Authorization='Bearer '+config.getKey();
  const instruction=payload.systemInstruction.parts.map(p=>p.text).join('\n');
  const schema=payload.generationConfig.responseJsonSchema;
  body={model:config.model,stream:false,messages:[{role:'system',content:instruction+(schema?'\nAntworte ausschließlich mit einem JSON-Objekt gemäß diesem Schema, ohne Markdown und ohne Zusatztext: '+JSON.stringify(schema):'')},...payload.contents.map(turn=>({role:turn.role==='model'?'assistant':'user',content:turn.parts.map(p=>p.text).join('\n')}))],max_tokens:900,temperature:payload.generationConfig.temperature};
 }else throw providerError(503);
 const response=await fetchProvider(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
 if(!response.ok){
  let rateLimited=response.status===429;
  // This Open WebUI installation also reports its short-window limit as HTTP 400.
  if(config.provider==='hda'&&response.status===400){try{const data=await response.json();rateLimited=typeof data.detail==='string'&&/^rate limit exceeded:/i.test(data.detail);}catch{}}
  throw providerError(rateLimited?429:503);
 }
 const data=await response.json();let answer;
 if(config.provider==='gemini'){
  const candidate=data.candidates?.[0];
  if(candidate?.finishReason!=='STOP')throw providerError(502);
  answer=(candidate.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('\n').trim();
 }else{
  const choice=data.choices?.[0];
  if(choice?.finish_reason!=='stop'||choice.message?.role!=='assistant'||choice.message?.tool_calls?.length||choice.message?.function_call)throw providerError(502);
  answer=typeof choice.message.content==='string'?choice.message.content.trim():'';
  // Reasoning is not a user answer; never surface reasoning_content or embedded scratchpads.
  if(/<\/?think\b/i.test(answer))throw providerError(502);
 }
 if(!answer||answer.length>16000)throw providerError(502);
 return answer;
}
module.exports={providerConfig,generate,HDA_BASE};
