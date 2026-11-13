import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/base44Client';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

const statusLabel = { owner: 'Eigentümer', accepted: 'Mitglied', pending: 'Eingeladen' };

export default function BuildingTeam({ building, onClose, onLeave }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState('');
  const [removal, setRemoval] = useState(null);
  const membersPath = `/buildings/${building.id}/members`;
  const membersKey = ['building-members', building.id];
  const members = useQuery({ queryKey: membersKey, queryFn: () => request(membersPath), refetchOnWindowFocus: true });
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => request('/contacts'), enabled: building.is_owner, refetchOnWindowFocus: true });
  const action = useMutation({
    mutationFn: ({ path, method = 'POST', body }) => request(path, { method, body }),
    onSuccess: async (_, { kind }) => {
      if (kind === 'leave') {
        onLeave();
        return;
      }
      if (kind === 'contact') setEmail('');
      if (kind === 'invite') setTarget('');
      if (kind === 'remove') setRemoval(null);
      await Promise.all([
        cache.invalidateQueries({ queryKey: membersKey }),
        cache.invalidateQueries({ queryKey: ['contacts'] }),
      ]);
    },
  });
  const rows = members.data ?? [];
  const available = (contacts.data ?? []).filter(contact =>
    contact.status === 'accepted' && !rows.some(member => String(member.id) === String(contact.user_id)));
  const invitee = available.find(contact => String(contact.user_id) === target);
  const error = action.error ?? members.error ?? contacts.error;
  const message = action.isSuccess && (action.data?.message ?? action.variables.message);
  const ownMembership = rows.find(member => member.status === 'accepted' && String(member.id) === String(user?.id));
  const leaving = removal && String(removal.id) === String(user?.id) && !building.is_owner;

  function openRemoval(member) {
    action.reset();
    setRemoval(member);
  }

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open && !action.isPending) onClose(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{building.is_owner ? 'Gebäude teilen' : 'Gebäudeteam'} · {building.name}</DialogTitle>
            <DialogDescription>
              {building.is_owner
                ? 'Lade bestätigte Kontakte ein. Nach Annahme haben sie Zugriff auf die gemeinsame Gebäudemappe.'
                : 'Mitglieder können Dateien in der gemeinsamen Gebäudemappe öffnen und bearbeiten.'}
            </DialogDescription>
          </DialogHeader>
          {error && !removal && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
          {message && <p role="status" className="text-sm text-green-700">{message}</p>}
          <section aria-labelledby="members-title">
            <h3 id="members-title" className="mb-2 text-sm font-semibold">Personen mit Zugriff und Einladungen</h3>
            {members.isPending && <p role="status" className="text-sm text-muted-foreground">Mitglieder werden geladen …</p>}
            <ul className="divide-y">
              {rows.map(member => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{statusLabel[member.status]}</p>
                  </div>
                  {building.is_owner && member.status !== 'owner' && (
                    <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => openRemoval(member)}>
                      {member.status === 'pending' ? 'Einladung zurückziehen' : 'Zugriff entziehen'}
                      <span className="sr-only"> · {member.name}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {ownMembership && !building.is_owner && (
              <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => openRemoval(ownMembership)}>Gebäude verlassen</Button>
            )}
          </section>
          {building.is_owner && (
            <div className="space-y-4 border-t pt-4">
              {members.isSuccess && contacts.isSuccess && available.length > 0 && (
                <form className="space-y-2" onSubmit={event => {
                  event.preventDefault();
                  if (invitee && !action.isPending) action.mutate({
                    kind: 'invite', path: membersPath, body: { user_id: invitee.user_id }, message: 'Gebäudeeinladung gesendet.',
                  });
                }}>
                  <Label htmlFor="invite-contact">Bestätigten Kontakt auswählen</Label>
                  <div className="flex flex-wrap gap-2">
                    <select id="invite-contact" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                      value={invitee ? target : ''} onChange={event => setTarget(event.target.value)} disabled={action.isPending}>
                      <option value="">Kontakt auswählen</option>
                      {available.map(contact => <option key={contact.id} value={contact.user_id}>{contact.name}</option>)}
                    </select>
                    <Button type="submit" disabled={!invitee || action.isPending}>Einladen</Button>
                  </div>
                </form>
              )}
              <form className="space-y-2" onSubmit={event => {
                event.preventDefault();
                if (email.trim() && !action.isPending) action.mutate({ kind: 'contact', path: '/contacts', body: { email: email.trim() } });
              }}>
                <Label htmlFor="contact-email">Kontakt per E-Mail hinzufügen</Label>
                <p className="text-xs text-muted-foreground">Nutze die E-Mail-Adresse des Projektkontos. Die Person kann deine Anfrage unter „Gebäude & Räume“ oder in der iPhone-App annehmen.</p>
                <div className="flex flex-wrap gap-2">
                  <Input className="min-w-44 flex-1" id="contact-email" type="email" value={email}
                    onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={action.isPending} />
                  <Button type="submit" variant="outline" disabled={!email.trim() || action.isPending}>Kontaktanfrage senden</Button>
                </div>
                <Button size="sm" variant="ghost" type="button" disabled={contacts.isFetching || members.isFetching || action.isPending}
                  onClick={() => { contacts.refetch(); members.refetch(); }}>Kontakte aktualisieren</Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!removal} onOpenChange={open => { if (!open && !action.isPending) { setRemoval(null); action.reset(); } }}
        title={leaving ? 'Gebäude verlassen?' : removal?.status === 'pending' ? 'Einladung zurückziehen?' : 'Zugriff entziehen?'}
        description={action.error?.message ?? (leaving ? 'Dein Zugriff auf das Gebäude und seine Dateien endet.' : `Der Zugriff für ${removal?.name ?? ''} wird entfernt.`)}
        confirmLabel={leaving ? 'Verlassen' : removal?.status === 'pending' ? 'Zurückziehen' : 'Zugriff entziehen'}
        busy={action.isPending} onConfirm={() => {
          if (removal) action.mutate({
            kind: leaving ? 'leave' : 'remove', path: `${membersPath}/${removal.id}`, method: 'DELETE',
            message: removal.status === 'pending' ? 'Einladung zurückgezogen.' : 'Zugriff entzogen.',
          });
        }} />
    </>
  );
}
