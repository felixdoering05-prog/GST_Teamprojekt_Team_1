// Compatibility surface for the imported UI. Every request goes to our own API.
const TOKEN_KEY='d21-session';
export const hasSession=()=>Boolean(sessionStorage.getItem(TOKEN_KEY));
/** @param {string} path
 * @param {{method?:string,body?:any,raw?:boolean,headers?:Record<string,string>}} [options]
 * @returns {Promise<any>}
 */
export async function request(path,{method='GET',body,raw=false,headers={}}={}) {
 const response=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers:{...(body&&!raw?{'Content-Type':'application/json'}:{}),'X-D21-Session':sessionStorage.getItem(TOKEN_KEY)||'',...headers},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 if(!response.ok){let data={};try{data=await response.json()}catch{}const error=Object.assign(new Error(data.error||`Serveranfrage fehlgeschlagen (${response.status}).`),{status:response.status});if(response.status===401)sessionStorage.removeItem(TOKEN_KEY);throw error;}
 return raw?response.blob():response.json();
}
const session=async(path,body)=>{const result=await request(path,{method:'POST',body});sessionStorage.setItem(TOKEN_KEY,result.token);return result;};
const entity=name=>({
 list:(sort,limit)=>request(`/twin/${name}/list`,{method:'POST',body:{sort,limit}}),
 filter:(filter,options)=>request(`/twin/${name}/filter`,{method:'POST',body:{filter,options}}),
 count:filter=>request(`/twin/${name}/count`,{method:'POST',body:{filter}}),
 create:data=>request(`/twin/${name}/create`,{method:'POST',body:{data}}),
 update:(id,data)=>request(`/twin/${name}/update`,{method:'POST',body:{id,data}}),
 delete:id=>request(`/twin/${name}/delete`,{method:'POST',body:{id}}),
 bulkCreate:data=>request(`/twin/${name}/bulkCreate`,{method:'POST',body:{data}}),
 deleteMany:filter=>request(`/twin/${name}/deleteMany`,{method:'POST',body:{filter}}),
});
export const base44={
 auth:{
  me:async()=>{const u=await request('/auth/me');return {...u,full_name:u.name};},
  loginViaEmailPassword:(email,password)=>session('/auth/login',{email,password}),
  register:({name,email,password})=>session('/auth/register',{name,email,password}),
  logout:async(_returnTo)=>{try{await request('/auth/logout',{method:'POST',body:{}})}finally{sessionStorage.removeItem(TOKEN_KEY);window.location.assign('/login');}},
  redirectToLogin:()=>window.location.assign('/login'),
 },
 entities:Object.fromEntries(['Building','Floor','Room','Sensor','Measurement','EnergyReading','Alert','ThresholdConfig'].map(name=>[name,entity(name)])),
 functions:{invoke:async(name,body)=>({data:await request(`/twin-functions/${name}`,{method:'POST',body})})},
};

/** Binary upload with byte progress and an idempotency key for safe retries. */
export function uploadFile(buildingID, file, uploadID, onProgress) {
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',`/api/v1/buildings/${buildingID}/documents`);
  xhr.timeout=120000;
  xhr.setRequestHeader('X-D21-Session',sessionStorage.getItem(TOKEN_KEY)||'');
  xhr.setRequestHeader('Content-Type','application/octet-stream');
  xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));
  xhr.setRequestHeader('X-Upload-ID',uploadID);
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total)};
  xhr.onerror=()=>reject(new Error('Keine Verbindung. Deine Dateiauswahl bleibt für einen neuen Versuch erhalten.'));
  xhr.ontimeout=()=>reject(new Error('Die Verbindung hat zu lange gebraucht. Bitte erneut versuchen.'));
  xhr.onload=()=>{
   let data={};try{data=JSON.parse(xhr.responseText)}catch{}
   if(xhr.status>=200&&xhr.status<300)resolve(data);
   else {if(xhr.status===401)sessionStorage.removeItem(TOKEN_KEY);reject(new Error(data.error||`Upload fehlgeschlagen (${xhr.status}).`))}
  };
  xhr.send(file);
 });
}
