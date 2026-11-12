// Hold slots until the actual password computation settles, not until HTTP closes.
class PasswordWorkGate {
 constructor(limit=4){this.limit=limit;this.active=0;}
 async run(work){
  if(this.active>=this.limit)throw Object.assign(Error('Zu viele Anmeldeversuche. Bitte später erneut versuchen.'),{status:429});
  this.active++;
  try{return await work();}finally{this.active--;}
 }
}
module.exports={PasswordWorkGate};
