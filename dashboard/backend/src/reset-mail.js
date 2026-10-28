const nodemailer=require('nodemailer');
const fs=require('node:fs');
function secretValue(env,key) {
 if(env[key])return env[key];
 try{return env[key+'_FILE']?fs.readFileSync(env[key+'_FILE'],'utf8').replace(/\r?\n$/,''):'';}catch{return '';}
}
function resetMailConfiguration(env=process.env) {
 const port=Number(env.SMTP_PORT||465);
 const password=secretValue(env,'SMTP_PASSWORD'),secret=secretValue(env,'PASSWORD_RESET_SECRET');
 const enabled=env.SMTP_ENABLED==='true' && [465,587].includes(port) &&
  Boolean(env.SMTP_HOST&&env.SMTP_USER&&password) &&
  /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.MAIL_FROM||'') &&
  /^[a-f0-9]{64}$/i.test(secret);
 return {enabled,secret,host:env.SMTP_HOST,port,user:env.SMTP_USER,password,from:env.MAIL_FROM};
}
function createResetMailer(config=resetMailConfiguration()) {
 if(!config.enabled)return {enabled:false,secret:''};
 const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.port===465,requireTLS:true,
  auth:{user:config.user,pass:config.password},tls:{minVersion:'TLSv1.2'},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 return {enabled:true,secret:config.secret,async send({email,code}) {
  const result=await transport.sendMail({from:{name:'KI trifft Gebäude · D21',address:config.from},to:email,
   subject:'Dein Code zum Zurücksetzen des D21-Passworts',
   text:`Du hast ein neues Passwort für dein persönliches D21-Projektkonto angefordert.\n\nDein einmaliger Code: ${code}\n\nGib ihn innerhalb von 15 Minuten unter „Passwort vergessen“ in der App oder auf der Website ein. Der gemeinsame Website-Zugang bleibt unverändert.\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail. Teile den Code mit niemandem.\n\nGST-Teamprojekt · Hochschule Darmstadt`,
   disableFileAccess:true,disableUrlAccess:true});
  if(!result.accepted?.length)throw Object.assign(new Error('Mail not accepted'),{code:'ENOTACCEPTED'});
 }};
}
module.exports={resetMailConfiguration,createResetMailer};
