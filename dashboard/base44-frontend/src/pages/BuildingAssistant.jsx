import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MessageSquareText, Send, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { SelectField } from '@/components/Field';
import { Button } from '@/components/ui/button';
import { base44, request } from '@/api/base44Client';

export default function BuildingAssistant() {
  const [buildings, setBuildings] = useState(null);
  const [buildingId, setBuildingId] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.entities.Building.list('-created_date', 500)
      .then((list) => {
        setBuildings(list || []);
        setBuildingId((list || [])[0]?.id || '');
      })
      .catch((e) => {
        setBuildings([]);
        setError(e.message || 'Gebäude konnten nicht geladen werden.');
      });
  }, []);

  useEffect(() => {
    if (!buildingId) { setContext(null); return; }
    let cancelled = false;
    setContext(null);
    request(`/buildings/${encodeURIComponent(buildingId)}/assistant`)
      .then((data) => { if (!cancelled) setContext(data); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Gebäudekontext konnte nicht geladen werden.'); });
    return () => { cancelled = true; };
  }, [buildingId]);

  const send = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || !context?.enabled || busy || !buildingId) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/buildings/${encodeURIComponent(buildingId)}/assistant`, {
        method: 'POST',
        headers: { 'X-Request-ID': crypto.randomUUID() },
        body: { question: text, context_hash: context.context_hash, chat: true },
      });
      setEntries((current) => [...current, { question: text, ...result }]);
      setQuestion('');
    } catch (e) {
      setError(e.message || 'Die Anfrage konnte nicht verarbeitet werden.');
    } finally {
      setBusy(false);
    }
  };

  if (buildings === null) return <div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" /></div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Gebäude-Assistent" description="Fragen zu freigegebenen Gebäudedaten stellen. Die Anfrage läuft über den D21-Server." />
      {!buildings.length ? (
        <EmptyState icon={MessageSquareText} title="Kein Gebäude vorhanden" description="Legen Sie zuerst unter „Gebäude & Räume“ ein Gebäude an." />
      ) : (
        <>
          <section className="surface space-y-4 p-4 sm:p-5">
            <SelectField label="Gebäude" value={buildingId} onChange={(e) => { setBuildingId(e.target.value); setEntries([]); }} options={buildings.map((b) => ({ value: b.id, label: b.name }))} />
            <div className="flex items-start gap-3 rounded-xl bg-cyan-50 p-4 text-sm text-cyan-950">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Der Server verwendet nur den angezeigten Gebäudekontext. Antworten sind KI-generiert und müssen fachlich geprüft werden. Der Browser erhält keinen KI-API-Schlüssel.</p>
            </div>
            {context && !context.enabled ? <p className="text-sm text-amber-700">Der Assistent ist derzeit nicht verfügbar. Prüfe deine KI-Einstellungen.</p> : null}
            {context?.notice ? <p className="text-xs text-muted-foreground">{context.notice}</p> : null}
            {context && !context.account_enabled ? <Link to="/daten" className="text-sm font-medium text-primary underline">KI einmal für mein Konto aktivieren → Einstellungen</Link> : null}
          </section>

          <section className="surface overflow-hidden">
            <div className="border-b border-border px-4 py-3"><h2 className="font-heading text-sm font-semibold">Frage zum Gebäude</h2></div>
            <div className="max-h-[480px] min-h-[120px] space-y-3 overflow-y-auto p-4">
              {!entries.length ? <p className="text-sm text-muted-foreground">Zum Beispiel: „Fasse die vorhandenen Messwerte und offenen Meldungen zusammen.“</p> : null}
              {entries.map((item, i) => <article key={i} className="space-y-2 rounded-xl border border-border p-4">
                <p className="text-sm font-medium">Du: {item.question}</p>
                <p className="whitespace-pre-line text-sm">{item.answer}</p>
                {item.notice ? <p className="flex gap-2 text-xs text-amber-800"><TriangleAlert className="h-4 w-4 shrink-0" />{item.notice}</p> : null}
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" /> KI-Antwort · {item.model}</p>
              </article>)}
            </div>
            <form onSubmit={send} className="flex gap-2 border-t border-border p-4">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} placeholder="Frage zum Gebäude …" className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm" />
              <Button type="submit" disabled={busy || !context?.enabled || !question.trim()}>{busy ? 'Bitte warten …' : <><Send className="mr-2 h-4 w-4" />Senden</>}</Button>
            </form>
          </section>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
