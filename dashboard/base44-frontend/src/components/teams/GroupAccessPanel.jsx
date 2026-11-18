import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const groupsKey=id=>['building-groups',String(id)];
const accessKey=id=>['building-team-access',String(id)];

export default function GroupAccessPanel(){
 const [groupID,setGroupID]=useState(''),[userID,setUserID]=useState('');
 const teams=useQuery({queryKey:['teams'],queryFn:()=>request('/teams')});
 const selected=teams.data?.find(team=>String(team.id)===localStorage.getItem('d21-selected-team'))||teams.data?.[0];
 const groups=useQuery({queryKey:groupsKey(selected?.id),queryFn:()=>request('/teams/'+selected.id+'/groups'),enabled:!!selected?.id});
 const group=groups.data?.find(item=>String(item.id)===groupID)||groups.data?.[0];
 const contacts=useQuery({queryKey:['contacts'],queryFn:()=>request('/contacts'),enabled:selected?.can_manage_groups===true});
 const permissions=useQueries({queries:(group?.buildings||[]).map(building=>({queryKey:accessKey(building.id),queryFn:()=>request('/buildings/'+building.id+'/team-access'),enabled:selected?.can_manage_groups===true}))});
 if(!selected?.can_manage_groups||!groups.data?.length)return null;
 const allowed=group&&permissions.length===group.buildings.length&&permissions.every(q=>q.data?.can_manage_members);
 return <section className="surface space-y-4 rounded-2xl border border-border p-5 shadow-sm">
  <div><h2 className="font-heading font-semibold">Rechte für eine Gebäudegruppe vergeben</h2><p className="text-xs text-muted-foreground">Die gewählte Rolle wird je Gebäude gesetzt und ersetzt dort eine bestehende Einzelrolle. Die Rechte werden für jedes Gebäude einzeln geprüft.</p></div>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="grid gap-1.5 text-xs font-semibold">Gebäudegruppe<select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={group?.id||''} onChange={event=>setGroupID(event.target.value)}><option value="">Gruppe auswählen</option>{groups.data.map(item=><option key={item.id} value={item.id}>{item.name} · {item.buildings.length} Gebäude</option>)}</select></label>
   <label className="grid gap-1.5 text-xs font-semibold">Bestätigter Kontakt<select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={userID} onChange={event=>setUserID(event.target.value)}><option value="">Person auswählen</option>{(contacts.data||[]).filter(contact=>contact.status==='accepted').map(contact=><option key={contact.id} value={contact.user_id}>{contact.name}</option>)}</select></label>
  </div>
  {group&&<form className="space-y-3" onSubmit={async event=>{event.preventDefault();const assignments=group.buildings.map(building=>({building_id:building.id,role_id:Number(event.currentTarget.elements.namedItem('group-role-'+building.id).value)}));await request('/teams/'+selected.id+'/groups/'+group.id+'/assign',{method:'POST',body:{user_id:Number(userID),assignments}});}}>
   <div className="grid gap-2 sm:grid-cols-2">{group.buildings.map((building,index)=><label key={building.id} className="grid gap-1 text-xs font-medium">{building.name} · Rolle<select name={'group-role-'+building.id} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" required disabled={!permissions[index]?.data?.can_manage_members}><option value="">Rolle wählen</option>{(permissions[index]?.data?.roles||[]).filter(role=>selected.is_owner||Number(role.sort_order)>Number(permissions[index]?.data?.actor_role?.sort_order)).map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>)}</div>
   <Button type="submit" disabled={!userID||!allowed}><Users className="h-4 w-4"/>Rolle auf Gruppe anwenden</Button>
  </form>}
 </section>;
}
