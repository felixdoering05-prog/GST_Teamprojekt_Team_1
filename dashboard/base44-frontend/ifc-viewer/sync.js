export function applySharedState(state, appearance, roomLights) {
  if (!state || !Array.isArray(state.hidden) || !state.colors || typeof state.colors !== 'object' || !Array.isArray(state.lights)) throw Error('Ungültiger gespeicherter Modellstand.');
  appearance.select(undefined); appearance.showAll(); appearance.resetColors();
  for (const id of state.hidden) for (const mesh of appearance.elements.get(id) || []) mesh.visible = false;
  for (const [key,color] of Object.entries(state.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) continue;
    for (const mesh of appearance.elements.get(Number(key)) || []) mesh.material.color.set(color);
  }
  for (const [id,set] of roomLights) set(state.lights.includes(id));
}
export function mountSynchronization({appearance,roomLights,update,environment=()=>{}}) {
  const native=window.webkit?.messageHandlers.ifcSceneRequest;
  const shared=!!native||window.parent!==window;
  const note=document.createElement('div');note.id='sync-status';note.setAttribute('role','status');document.body.append(note);
  if(!shared){note.textContent='Lokale Datei · Änderungen nur auf diesem Gerät';return {change(){}};}
  let revision=0,deviceSignature='',latestDeviceLights=[],ticket,busy=false,loaded=false,failed=false,queue=[],timer,timeout;
  const message=document.createElement('span'),retry=document.createElement('button');retry.textContent='Erneut laden';retry.hidden=true;note.append(message,retry);
  function status(text){message.textContent=text;}
  function lock(on){document.querySelectorAll('#color,#hide,#show-all,#reset-colors,#command-open,#rooms button').forEach(button=>button.disabled=on||button.dataset.noGeometry==='true'||button.dataset.linked==='true');}
  function request(operation){
    ticket=String(crypto.getRandomValues(new Uint32Array(4)).join('-'));busy=true;
    const body={id:ticket,...(operation?{operation,revision}:{})};
    if(native)native.postMessage(body);else window.parent.postMessage({type:'d21-scene-request',...body},location.origin);
    clearTimeout(timeout);timeout=setTimeout(()=>reply(ticket,null,'Verbindung unterbrochen. Änderungen wurden nicht bestätigt.'),25000);
  }
  function next(){if(!busy&&!failed&&queue.length)request(queue.shift());}
  function reply(id,result,error){
    if(id!==ticket)return;ticket=undefined;busy=false;clearTimeout(timeout);
    if(error){failed=true;queue=[];lock(true);status('Nicht synchronisiert: '+String(error));retry.hidden=false;return;}
    try{
      if(!Number.isInteger(result?.revision))throw Error('Ungültige Serverantwort.');
      if(Array.isArray(result.device_lights))latestDeviceLights=result.device_lights;const signature=JSON.stringify(latestDeviceLights);const different=!loaded||revision!==result.revision||signature!==deviceSignature;deviceSignature=signature; revision=result.revision;loaded=true;
      // While saves are queued, keep optimistic local changes; apply final authoritative state afterwards.
      if(!queue.length&&different){applySharedState(result.state,appearance,roomLights);for(const item of latestDeviceLights){if(!Array.isArray(item.rgb)||item.rgb.length!==3)continue;const color='#'+item.rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');roomLights.get(item.space_id)?.(item.on,color,true,item.available);}update();}
      if(result.map_view!==undefined)environment(result.map_view);
      status(queue.length?'Änderungen werden gespeichert …':'Gemeinsamer Modellstand · auf dem Server gespeichert');lock(false);next();
    }catch(e){failed=true;lock(true);status(e.message);retry.hidden=false;}
  }
  window.d21SceneReply=reply;
  function receive(event){if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='d21-scene-reply')reply(event.data.id,event.data.result,event.data.error);}
  window.addEventListener('message',receive);
  retry.onclick=()=>{failed=false;queue=[];retry.hidden=true;status('Aktueller Stand wird geladen …');request();};
  status('Gemeinsamer Modellstand wird geladen …');lock(true);request();
  timer=setInterval(()=>{if(!busy&&!failed&&!queue.length&&!document.hidden)request();},5000);
  window.addEventListener('pagehide',()=>{clearTimeout(timeout);clearInterval(timer);window.removeEventListener('message',receive);delete window.d21SceneReply;},{once:true});
  return {change(operation){
    if(!loaded||failed){status('Noch nicht gespeichert. Bitte zuerst den Serverstand laden.');return;}
    queue.push(operation);if(queue.length>20){queue=[];failed=true;lock(true);retry.hidden=false;status('Zu viele offene Änderungen. Bitte den Serverstand erneut laden.');return;}
    status('Änderungen werden gespeichert …');next();
  }};
}
