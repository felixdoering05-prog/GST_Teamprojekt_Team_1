import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, RefreshCw } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function BuildingInvitations({ onBuildingsChanged }) {
  const cache = useQueryClient();
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => request('/contacts'), refetchOnWindowFocus: true });
  const invitations = useQuery({ queryKey: ['building-invitations'], queryFn: () => request('/building-invitations'), refetchOnWindowFocus: true });
  const respond = useMutation({
    mutationFn: ({ path, method = 'POST', body, message }) =>
      request(path, { method, body }).then(() => message),
    onSuccess: async (_, { buildingChanged }) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['contacts'] }),
        cache.invalidateQueries({ queryKey: ['building-invitations'] }),
        buildingChanged && onBuildingsChanged(),
      ]);
    },
  });
  const contactRequests = (contacts.data ?? []).filter(contact => contact.status === 'pending');
  const buildingInvitations = invitations.data ?? [];
  const error = respond.error ?? contacts.error ?? invitations.error;
  const loading = contacts.isPending || invitations.isPending;

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="invitations-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="invitations-title" className="flex items-center gap-2 font-heading font-semibold">
          <Mail className="h-4 w-4 text-primary" aria-hidden="true" /> Einladungen & Kontaktanfragen
        </h2>
        <Button variant="ghost" size="sm" onClick={() => { contacts.refetch(); invitations.refetch(); }}
          disabled={contacts.isFetching || invitations.isFetching || respond.isPending}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Aktualisieren
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {respond.data && <p role="status" className="text-sm text-green-700">{respond.data}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Einladungen werden geladen …</p>}
      {!loading && !error && !contactRequests.length && !buildingInvitations.length && (
        <p className="text-sm text-muted-foreground">Hier erscheinen Anfragen und Einladungen aus der Web- und iPhone-App.</p>
      )}
      {(contactRequests.length > 0 || buildingInvitations.length > 0) && (
        <ul className="divide-y">
          {contactRequests.map(contact => (
            <li key={`contact-${contact.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="text-sm font-medium">{contact.name}</p><p className="text-xs text-muted-foreground">Kontaktanfrage</p></div>
              <div className="flex gap-2">
                <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({
                  path: `/contacts/${contact.id}/accept`, body: {}, message: 'Kontaktanfrage angenommen.',
                })}>Annehmen<span className="sr-only"> · Kontaktanfrage von {contact.name}</span></Button>
                <Button size="sm" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({
                  path: `/contacts/${contact.id}`, method: 'DELETE', message: 'Kontaktanfrage abgelehnt.',
                })}>Ablehnen<span className="sr-only"> · Kontaktanfrage von {contact.name}</span></Button>
              </div>
            </li>
          ))}
          {buildingInvitations.map(building => (
            <li key={`building-${building.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{building.name}</p>
                <p className="text-xs text-muted-foreground">Einladung von {building.owner_name}{building.address && ` · ${building.address}`}</p>
              </div>
              <div className="flex gap-2">
                {[['accept', 'Annehmen'], ['decline', 'Ablehnen']].map(([action, label]) => (
                  <Button key={action} size="sm" variant={action === 'accept' ? 'default' : 'outline'} disabled={respond.isPending}
                    onClick={() => respond.mutate({
                      path: `/buildings/${building.id}/invitation`, body: { action }, buildingChanged: action === 'accept',
                      message: action === 'accept' ? 'Einladung angenommen. Das Gebäude steht jetzt in deiner Liste.' : 'Einladung abgelehnt.',
                    })}>{label}<span className="sr-only"> · Einladung zu {building.name}</span></Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
