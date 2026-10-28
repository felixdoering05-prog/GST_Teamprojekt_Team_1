import {useState} from 'react';
import {Link} from 'react-router-dom';
import {LogIn} from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {base44} from '@/api/base44Client';
import {safeReturnTo} from '@/lib/authReturnTo';
export default function Login(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await base44.auth.loginViaEmailPassword(email,password);window.location.assign(safeReturnTo())}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <AuthLayout icon={LogIn} title="Willkommen zurück" subtitle="Mit deinem Projektkonto anmelden – dasselbe Konto wie auf dem iPhone." footer={<Link className="text-primary" to="/register">Neues Konto anlegen</Link>}>
 <form onSubmit={submit} className="space-y-4">
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 <div><Label htmlFor="email">E-Mail</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div>
 <div><Label htmlFor="password">Passwort</Label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>
 <Button className="w-full" disabled={busy}>{busy?'Anmelden …':'Anmelden'}</Button>
 <p className="text-xs text-muted-foreground">Eine Passwort-Wiederherstellung per E-Mail ist im Prototyp noch nicht eingerichtet.</p>
 </form></AuthLayout>;
}
