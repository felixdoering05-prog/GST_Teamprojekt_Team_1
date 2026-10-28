import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {KeyRound} from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {request} from '@/api/base44Client';
export default function ForgotPassword(){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [enabled,setEnabled]=useState(null),[step,setStep]=useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{request('/auth/password-reset/status').then(r=>setEnabled(r.enabled)).catch(e=>{setEnabled(false);setError(e.message)})},[]);
 async function send(e){e.preventDefault();setError('');setBusy(true);try{const r=await request('/auth/password-reset/request',{method:'POST',body:{email}});setMessage(r.message);setStep(2)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function confirm(e){e.preventDefault();setError('');if(password!==repeat){setError('Die Passwörter stimmen nicht überein.');return}setBusy(true);try{const r=await request('/auth/password-reset/confirm',{method:'POST',body:{email,code,password}});setMessage(r.message);setPassword('');setRepeat('');setCode('');setStep(3)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <AuthLayout icon={KeyRound} title="Passwort zurücksetzen" subtitle="Für dein persönliches Projektkonto. Der gemeinsame Website-Zugang bleibt unverändert." footer={<Link className="text-primary" to="/login">Zur Anmeldung</Link>}>
  {enabled===null?<p>Mailversand wird geprüft …</p>:enabled===false?<p role="status" className="rounded-lg bg-slate-100 p-4 text-sm">Der E-Mail-Versand ist noch nicht eingerichtet. Bitte melde dich beim Projektteam. Es wurde keine E-Mail verschickt.</p>:<>
   {message&&<p role="status" className="mb-4 text-sm">{message}</p>}
   {step===1&&<form onSubmit={send} className="space-y-4"><Label htmlFor="reset-email">E-Mail deines Kontos</Label><Input id="reset-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/><Button className="w-full" disabled={busy}>{busy?'Wird angefordert …':'Code per E-Mail anfordern'}</Button><Button variant="link" type="button" onClick={()=>setStep(2)}>Ich habe bereits einen Code</Button></form>}
   {step===2&&<form onSubmit={confirm} className="space-y-4">
    <div><Label htmlFor="confirm-email">E-Mail deines Kontos</Label><Input id="confirm-email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <div><Label htmlFor="reset-code">8-stelliger Code aus der E-Mail</Label><Input id="reset-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></div>
    <div><Label htmlFor="reset-password">Neues Passwort (mindestens 12 Zeichen)</Label><Input id="reset-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></div>
    <div><Label htmlFor="reset-repeat">Passwort wiederholen</Label><Input id="reset-repeat" type="password" autoComplete="new-password" minLength={12} required value={repeat} onChange={e=>setRepeat(e.target.value)}/></div>
    <Button className="w-full" disabled={busy}>{busy?'Wird geändert …':'Neues Passwort speichern'}</Button><Button type="button" variant="link" disabled={busy} onClick={()=>{setStep(1);setMessage('')}}>Neuen Code anfordern</Button>
    <p className="text-xs text-muted-foreground">Ein Code gilt 15 Minuten und nur einmal. Nach fünf falschen Eingaben ist ein neuer Code nötig.</p>
   </form>}
   {step===3&&<Button asChild className="w-full"><Link to="/login">Mit neuem Passwort anmelden</Link></Button>}
  </>}
  {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
 </AuthLayout>;
}
