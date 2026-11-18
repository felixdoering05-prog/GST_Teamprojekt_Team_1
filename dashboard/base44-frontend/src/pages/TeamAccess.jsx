import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, ShieldCheck, Users } from 'lucide-react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ConfirmDialog from '@/components/ConfirmDialog';

const modules = [
  ['overview','Übersicht'],['buildings','Gebäude'],['structure','Geschosse & Räume'],['sensors','Sensorik'],
  ['energy','Energie'],['analysis','Analyse'],['assistant','Gebäude-Assistent'],['issues','Meldungen'],
  ['documents','Dateien & Pläne'],['settings','Einstellungen & Importe'],['bim','BIM-Viewer'],
  ['schedule','Zeitpläne'],['coordination','Koordination & Teamchat'],
];
const accessLabels = { none: 'Kein Zugriff', read: 'Einsehen', edit: 'Einsehen & ändern' };
const blankPermissions = Object.fromEntries(modules.map(([key]) => [key,'none']));
const buildingListKey = ['account-buildings'];
const teamKey = id => ['building-team-access',String(id)];

function RoleEditor({ initial, busy, onCancel, onSave }) {
  const [name,setName] = useState(initial?.name||'');
  const [canManageMembers,setCanManageMembers] = useState(initial?.can_manage_members===true);
  const [permissions,setPermissions] = useState({...blankPermissions,...initial?.permissions});
  return <form className="surface space-y-4 p-4" onSubmit={event=>{event.preventDefault();onSave({name,can_manage_members:canManageMembers,permissions});}}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-heading font-semibold">{initial?'Rolle bearbeiten':'Neue Rolle'}</h3><Input className="max-w-xs" value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="Rollenname" required /></div>
    <div className="grid gap-2 sm:grid-cols-2">
      {modules.map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        <span>{label}</span><select className="max-w-48 rounded-md border border-input bg-background px-2 py-1.5 text-xs" value={permissions[key]||'none'} onChange={e=>setPermissions(current=>({...current,[key]:e.target.value}))}>
          {Object.entries(accessLabels).map(([value,title])=><option key={value} value={value}>{title}</option>)}
        </select>
      </label>)}
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={canManageMembers} onChange={e=>setCanManageMembers(e.target.checked)} className="mt-1" /><span>Mitglieder mit niedrigerem Rang verwalten</span></label>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Abbrechen</Button><Button type="submit" disabled={busy||!name.trim()}>{busy?'Speichert …':'Speichern'}</Button></div>
  </form>;
}

export default function TeamAccess() {
  const cache=useQueryClient();
  const [buildingId,setBuildingId]=useState('');
  const [inviteUser,setInviteUser]=useState('');
  const [inviteRole,setInviteRole]=useState('');
  const [editing,setEditing]=useState(null);
  const [removal,setRemoval]=useState(null);
  const [dragged,setDragged]=useState(null);
  const buildings=useQuery({queryKey:buildingListKey,queryFn:()=>request('/buildings'),refetchOnWindowFocus:true});
  const selectedId=buildingId||localStorage.getItem('d21-selected-building')||String(buildings.data?.[0]?.id||'');
  const selected=buildings.data?.find(row=>String(row.id)===selectedId);
  const team=useQuery({queryKey:teamKey(selectedId),queryFn:()=>request(`/buildings/${selectedId}/team-access`),enabled:!!selectedId,refetchOnWindowFocus:true});
  const contacts=useQuery({queryKey:['contacts'],queryFn:()=>request('/contacts'),enabled:team.data?.can_manage_members===true,refetchOnWindowFocus:true});
  const roles=[...(team.data?.roles||[])].sort((a,b)=>a.sort_order-b.sort_order);
  const members=team.data?.members||[];
  const actorRank=team.data?.actor_role?.sort_order??-1;
  const assignable=team.data?.is_owner?roles:roles.filter(role=>role.sort_order>actorRank);
  const available=(contacts.data||[]).filter(contact=>contact.status==='accepted'&&!members.some(member=>String(member.id)===String(contact.user_id)));
  const memberTarget=available.find(contact=>String(contact.user_id)===String(inviteUser));
  const mutation=useMutation({
    mutationFn:({path,method='POST',body})=>request(path,{method,body}),
    onSuccess:async(_,variables)=>{await Promise.all([cache.invalidateQueries({queryKey:teamKey(selectedId)}),cache.invalidateQueries({queryKey:buildingListKey}),cache.invalidateQueries()]);setEditing(null);setInviteUser('');if(variables.method==='DELETE'&&variables.path.includes('/members/'))setRemoval(null);},
  });
  const error=buildings.error||team.error||contacts.error||mutation.error;
  function saveRole(value){
    const base=`/buildings/${selectedId}/team-access/roles`;
    mutation.mutate({path:editing?.id?`${base}/${editing.id}`:base,method:editing?.id?'PATCH':'POST',body:value});
  }
  function reorder(targetId){
    if(!team.data?.can_manage_roles||dragged===null||String(targetId)===String(dragged))return;
    const from=roles.findIndex(role=>String(role.id)===String(dragged)),to=roles.findIndex(role=>String(role.id)===String(targetId));
    if(from<0||to<0)return;
    const next=[...roles], [item]=next.splice(from,1);next.splice(to,0,item);setDragged(null);
    mutation.mutate({path:`/buildings/${selectedId}/team-access/roles/order`,method:'PATCH',body:{role_ids:next.map(role=>role.id)}});
  }
  function canEditMember(member){return member.role_key!=='owner'&&(team.data?.is_owner||Number(member.sort_order)>actorRank);}

  return <div className="space-y-5">
    <PageHeader title="Teams & Rechte" description="Mitglieder und gebäudebezogene Rollen verwalten. Jede Person kann in jedem Gebäude eine eigene Rolle haben.">
      {buildings.data?.length>0&&<label className="flex items-center gap-2 text-sm">Gebäude<select className="max-w-64 rounded-md border border-input bg-background px-3 py-2" value={selectedId} onChange={e=>{setBuildingId(e.target.value);localStorage.setItem('d21-selected-building',e.target.value);window.dispatchEvent(new Event('d21-building-change'));setEditing(null);}}>{buildings.data.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    </PageHeader>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p>}
    {buildings.isPending&&<p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>}
    {!buildings.isPending&&!buildings.data?.length&&<section className="surface p-5 text-sm text-muted-foreground">Es gibt noch kein zugängliches Gebäude. Erstelle ein Gebäude oder nimm eine Einladung an, um ein Team einzurichten.</section>}
    {selected&&<>
      {team.data&&<section className="surface space-y-4 p-5">
        <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary"/><div><h2 className="font-heading font-semibold">{selected.name} · Team</h2><p className="text-xs text-muted-foreground">Eigentümer sind immer die höchste Instanz. Rangfolge und Datenrechte werden getrennt geprüft.</p></div></div>
        <ul className="divide-y divide-border">
          {members.map(member=><li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.status==='owner'?'Eigentümer':member.status==='pending'?'Einladung ausstehend':member.role_name||'Employee'}</p></div>
            {member.status!=='owner'&&canEditMember(member)&&team.data.can_manage_members&&<>
              <select aria-label={`Rolle für ${member.name}`} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" value={member.role_id||''} onChange={e=>mutation.mutate({path:`/buildings/${selectedId}/team-access/members/${member.id}/role`,method:'PATCH',body:{role_id:Number(e.target.value)}})} disabled={mutation.isPending}>
                {assignable.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={()=>setRemoval(member)}>Zugriff entziehen</Button>
            </>}
          </li>)}
        </ul>
        {team.data.can_manage_members&&<form className="flex flex-wrap items-end gap-2 border-t border-border pt-4" onSubmit={e=>{e.preventDefault();if(memberTarget&&inviteRole)mutation.mutate({path:`/buildings/${selectedId}/team-access/members`,body:{user_id:Number(inviteUser),role_id:Number(inviteRole)}});}}>
          <label className="grid min-w-48 flex-1 gap-1 text-xs font-medium">Bestätigter Kontakt<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={inviteUser} onChange={e=>setInviteUser(e.target.value)}><option value="">Person auswählen</option>{available.map(contact=><option key={contact.id} value={contact.user_id}>{contact.name}</option>)}</select></label>
          <label className="grid min-w-40 gap-1 text-xs font-medium">Rolle<select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="">Rolle wählen</option>{assignable.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <Button type="submit" disabled={!memberTarget||!inviteRole||mutation.isPending}><Plus className="h-4 w-4"/>Einladen</Button>
        </form>}
      </section>}
      {team.data?.can_manage_roles&&<section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary"/><div><h2 className="font-heading font-semibold">Rollen und Rangfolge</h2><p className="text-xs text-muted-foreground">Ziehe Rollen an die gewünschte Stelle. Eine höhere Rolle kann nur niedrigere verwalten.</p></div></div><Button size="sm" onClick={()=>setEditing({new:true})}><Plus className="h-4 w-4"/>Rolle anlegen</Button></div>
        <ol className="space-y-2">
          {roles.map((role,index)=><li key={role.id} draggable onDragStart={()=>setDragged(role.id)} onDragOver={event=>event.preventDefault()} onDrop={()=>reorder(role.id)} onDragEnd={()=>setDragged(null)} className={`flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-3 ${dragged===role.id?'opacity-50':''}`}>
            <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label={`Rang ${index+1}`}><GripVertical className="h-4 w-4"/>{index+1}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{role.name}{role.is_system?' · Standard':''}</p><p className="text-xs text-muted-foreground">{members.filter(member=>Number(member.role_id)===Number(role.id)).length} Personen · {role.can_manage_members?'Mitgliederverwaltung':'keine Mitgliederverwaltung'}</p></div>
            <Button size="sm" variant="outline" onClick={()=>setEditing(role)}>Bearbeiten</Button>
            {!role.is_system&&<Button size="sm" variant="outline" disabled={members.some(member=>Number(member.role_id)===Number(role.id))||mutation.isPending} onClick={()=>mutation.mutate({path:`/buildings/${selectedId}/team-access/roles/${role.id}`,method:'DELETE'})}>Löschen</Button>}
          </li>)}
        </ol>
        {editing&&<RoleEditor key={editing.id||'new'} initial={editing.new?null:editing} busy={mutation.isPending} onCancel={()=>setEditing(null)} onSave={saveRole}/>}
      </section>}
    </>}
    <ConfirmDialog open={!!removal} onOpenChange={open=>{if(!open&&!mutation.isPending)setRemoval(null);}} title="Gebäudezugriff entziehen?" description={`Der Zugriff von ${removal?.name||'diesem Mitglied'} auf ${selected?.name||'dieses Gebäude'} wird entfernt. Zugriffe auf andere Gebäude bleiben bestehen.`} confirmLabel="Zugriff entziehen" busy={mutation.isPending} onConfirm={()=>removal&&mutation.mutate({path:`/buildings/${selectedId}/team-access/members/${removal.id}`,method:'DELETE'})}/>
  </div>;
}
