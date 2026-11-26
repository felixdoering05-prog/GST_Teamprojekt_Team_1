import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Send, ShieldCheck, Sparkles } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import BuildingSectionSelect from '@/components/rooms/BuildingSectionSelect';
import { Button } from '@/components/ui/button';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';

export default function BuildingAssistant() {
  const selection = useBuildingSelection('assistant');
  const [params, setParams] = useSearchParams();
  const roomID = params.get('room');
  const building = selection.building;
  return <div className="space-y-5">
    <PageHeader title="Gebäude-Assistent" description={building?.name || 'Wähle ein Gebäude für deine Frage aus.'} />
    <BuildingSectionSelect selection={selection} />
    {building && <BuildingChat key={building.id + '/' + (roomID ?? '')} building={building} roomID={roomID}
      clearRoom={() => {
        const next = new URLSearchParams(params);
        next.delete('room');
        setParams(next, { replace: true });
      }} />}
  </div>;
}

function BuildingChat({ building, roomID, clearRoom }) {
  const scope = useBuildingScope();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [question, setQuestion] = useState('');
  const path = '/buildings/' + building.id + '/assistant';
  const historyKey = ['assistant-history', user.id, building.id];
  const mutationKey = ['assistant-question', user.id, building.id];
  const context = useQuery({
    queryKey: ['assistant-context', user.id, building.id, roomID],
    queryFn: () => request(path + (roomID ? '?' + new URLSearchParams({ room_id: roomID }) : '')),
    retry: false,
  });
  const history = useQuery({ queryKey: historyKey, queryFn: () => request(path + '/history'), retry: false });
  const busy = useIsMutating({ mutationKey }) > 0;
  const room = context.data?.context?.room;
  const mayAsk = scope.can(building.id, 'assistant', 'edit');
  const send = useMutation({
    mutationKey,
    mutationFn: text => request(path, {
      method: 'POST',
      headers: { 'X-Request-ID': crypto.randomUUID() },
      body: { question: text, context_hash: context.data.context_hash, chat: true, ...(roomID ? { room_id: roomID } : {}) },
    }),
    onSuccess: () => cache.invalidateQueries({ queryKey: historyKey }),
    onError: error => { if (error.status === 409) context.refetch(); },
  });
  const canSend = mayAsk && context.data?.enabled && !busy && question.trim() && (!roomID || room?.id === roomID);
  const entries = history.data ?? [];

  return <>
    <section className="surface space-y-3 p-4 sm:p-5">
      <div className="flex items-start gap-3 rounded-xl bg-primary/10 p-4 text-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p>Der Assistent verwendet den freigegebenen Kontext von {building.name}.</p>
      </div>
      {roomID && <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{room ? [room.floor, room.code, room.name].filter(Boolean).join(' · ') : 'Raumbezug'}</span>
        <Button size="sm" variant="ghost" onClick={clearRoom}>Frage zum ganzen Gebäude</Button>
      </div>}
      {context.error && <p role="alert" className="text-sm text-destructive">{context.error.message}</p>}
      {context.data?.notice && <p className="text-xs text-muted-foreground">{context.data.notice}</p>}
      {context.data && !context.data.account_enabled && <Link to="/daten" className="text-sm font-medium text-primary underline">KI in den Einstellungen aktivieren</Link>}
      {context.data?.account_enabled && !context.data.enabled && <p className="text-sm text-muted-foreground">Der Assistent ist derzeit nicht verfügbar.</p>}
    </section>

    <section className="surface overflow-hidden">
      <h2 className="border-b border-border px-4 py-3 font-heading text-sm font-semibold">{room ? 'Frage zum Raum' : 'Frage zum Gebäude'}</h2>
      <div className="max-h-[480px] min-h-[120px] space-y-3 overflow-y-auto p-4">
        {history.isPending && <p role="status" className="text-sm text-muted-foreground">Chatverlauf wird geladen …</p>}
        {history.isError && <p role="alert" className="text-sm text-destructive">{history.error.message}</p>}
        {history.isSuccess && !entries.length && <p className="flex items-center gap-2 text-sm text-muted-foreground"><MessageSquareText className="h-4 w-4" />Noch keine Fragen zu diesem Gebäude.</p>}
        {entries.map(item => <article key={item.id} className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Du: {item.question}</p>
          <p className="whitespace-pre-line break-words text-sm">{item.answer}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> KI-Antwort</p>
        </article>)}
      </div>
      {mayAsk && <form className="flex flex-wrap gap-2 border-t border-border p-4" onSubmit={event => {
        event.preventDefault();
        if (canSend) send.mutate(question.trim(), { onSuccess: () => setQuestion('') });
      }}>
        <input aria-label={room ? 'Frage zum Raum' : 'Frage zum Gebäude'} value={question} onChange={event => setQuestion(event.target.value)}
          maxLength={2000} placeholder={room ? 'Frage zum Raum …' : 'Frage zum Gebäude …'}
          className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm" />
        <Button type="submit" disabled={!canSend}>{busy ? 'Bitte warten …' : <><Send className="mr-2 h-4 w-4" />Senden</>}</Button>
      </form>}
      {send.error && <p role="alert" className="px-4 pb-4 text-sm text-destructive">{send.error.message}</p>}
    </section>
  </>;
}
