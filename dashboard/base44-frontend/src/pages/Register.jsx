import {useState} from 'react';
import {Link} from 'react-router-dom';
import {UserPlus} from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {base44} from '@/api/base44Client';
export default function Register(){
 const [form,setForm]=useState({name:'',email:'',password:'',confirm:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setError('');if(form.password!==form.confirm){setError('Die Passwörter stimmen nicht überein.');return}setBusy(true);try{await base44.auth.register(form);window.location.assign('/')}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <AuthLayout icon={UserPlus} title="Konto erstellen" subtitle="Dein Konto gilt für Website und iPhone-App." footer={<Link className="text-primary" to="/login">Ich habe bereits ein Konto</Link>}>
 <form onSubmit={submit} className="space-y-4">{error&&<p role="alert" className="text-destructive">{error}</p>}
 {Object.entries({name:'Dein Name',email:'E-Mail',password:'Passwort (mindestens 12 Zeichen)',confirm:'Passwort wiederholen'}).map(([key,label])=><div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type={key==='email'?'email':['password','confirm'].includes(key)?'password':'text'} autoComplete={key==='name'?'name':key==='email'?'email':'new-password'} minLength={['password','confirm'].includes(key)?12:undefined} maxLength={key==='name'?100:undefined} required value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>)}
 <Button className="w-full" disabled={busy}>{busy?'Wird angelegt …':'Konto anlegen'}</Button>
 <p className="text-xs text-muted-foreground">Projektprototyp: noch keine E-Mail-Bestätigung.</p>
 </form></AuthLayout>;
}
