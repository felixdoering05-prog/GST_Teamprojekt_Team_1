import { useEffect, useState } from 'react';
import { Phone, Save } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TeamContactCard(){
 const [value,setValue]=useState({phone:'',email:'',share_with_team:false}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{let live=true;request('/profile/team-contact').then(result=>{if(live)setValue(result)}).catch(failure=>{if(live)setError(failure.message)});return()=>{live=false}},[]);
 async function save(event){event.preventDefault();setBusy(true);setSaved(false);setError('');try{setValue(await request('/profile/team-contact',{method:'PATCH',body:value}));setSaved(true)}catch(failure){setError(failure.message)}finally{setBusy(false)}}
 return <section className="surface space-y-4 p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Phone className="h-5 w-5"/></span><div><h2 className="font-heading font-semibold">Kontaktdaten für dein Team</h2><p className="text-sm text-muted-foreground">Telefonnummer und Team-E-Mail erscheinen nur für Teammitglieder, wenn du die Freigabe aktivierst.</p></div></div>
  <form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium">Telefonnummer<Input autoComplete="tel" type="tel" maxLength={40} value={value.phone} onChange={event=>setValue(current=>({...current,phone:event.target.value}))}/></label><label className="grid gap-1 text-xs font-medium">E-Mail<Input autoComplete="email" type="email" maxLength={254} value={value.email} onChange={event=>setValue(current=>({...current,email:event.target.value}))}/></label><label className="flex items-start gap-2 text-sm sm:col-span-2"><input className="mt-1" type="checkbox" checked={value.share_with_team} onChange={event=>setValue(current=>({...current,share_with_team:event.target.checked}))}/><span>Teammitglieder dürfen diese Kontaktdaten sehen, wenn sie in „Dein Team“ meinen Namen öffnen.</span></label><div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" disabled={busy}><Save className="h-4 w-4"/>{busy?'Speichert …':'Kontaktdaten speichern'}</Button>{saved&&<span role="status" className="text-sm text-primary">Gespeichert</span>}{error&&<span role="alert" className="text-sm text-destructive">{error}</span>}</div></form>
 </section>;
}

