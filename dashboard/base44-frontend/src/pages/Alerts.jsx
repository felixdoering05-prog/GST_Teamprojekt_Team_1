import { useEffect, useState } from 'react';
import { BellRing, Check, CheckCircle2, RefreshCw, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { AlertRow } from '@/components/dashboard/AlertList';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

const TABS = [
  { key: 'offen', label: 'Offen' },
  { key: 'quittiert', label: 'Quittiert' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'alle', label: 'Alle' },
];

export default function Alerts() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('offen');
  const [severity, setSeverity] = useState('all');
  const [email, setEmail] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const rows = await base44.entities.Alert.list('-triggered_at', 500);
    setAlerts(rows || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    base44.auth
      .me()
      .then((user) => setEmail(user?.email || ''))
      .catch(() => setEmail(''));
  }, []);

  const setStatus = async (alert, status) => {
    try {
      const payload = { status };
      if (status === 'quittiert') {
        payload.acknowledged_by = email;
        payload.acknowledged_at = new Date().toISOString();
      }
      if (status === 'erledigt') {
        payload.resolution_note = 'Manuell als erledigt markiert.';
      }
      await base44.entities.Alert.update(alert.id, payload);
      toast({ title: 'Meldung aktualisiert', description: `${alert.room_label || alert.sensor_code || ''} · Status ${status}` });
      await load();
    } catch (e) {
      toast({ title: 'Aktualisieren fehlgeschlagen', description: e.message, variant: 'destructive' });
    }
  };

  const runDelete = async () => {
    if (!confirmState) return;
    setBusy(true);
    try {
      await confirmState.action();
      toast({ title: 'Meldung gelöscht' });
      setConfirmState(null);
      await load();
    } catch (e) {
      toast({ title: 'Löschen fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const runCheck = async () => {
    setRunning(true);
    try {
      const response = await base44.functions.invoke('runThresholdCheck', { sinceHours: 4 });
      const payload = response?.data || {};
      toast({ title: 'Prüflauf abgeschlossen', description: payload.message || 'Prüflauf wurde ausgeführt.' });
      await load();
    } catch (e) {
      toast({ title: 'Prüflauf fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const filtered = alerts
    .filter((a) => (tab === 'alle' ? true : a.status === tab))
    .filter((a) => (severity === 'all' ? true : a.severity === severity));

  const open = alerts.filter((a) => a.status === 'offen').length;
  const acknowledged = alerts.filter((a) => a.status === 'quittiert').length;
  const resolved = alerts.filter((a) => a.status === 'erledigt').length;
  const critical = alerts.filter((a) => a.severity === 'critical' && a.status !== 'erledigt').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meldungen"
        description="Grenzwertüberschreitungen und technische Warnungen aus dem regelbasierten Prüflauf."
      >
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
        <Button size="sm" onClick={runCheck} disabled={running}>
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> {running ? 'Prüflauf läuft …' : 'Prüflauf starten'}
        </Button>
      </PageHeader>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Offen" value={`${open}`} hint="noch nicht bearbeitet" icon={BellRing} tone={open ? 'warn' : 'ok'} />
        <StatCard label="Quittiert" value={`${acknowledged}`} hint="zur Kenntnis genommen" icon={Check} />
        <StatCard label="Erledigt" value={`${resolved}`} hint="Wert wieder im Sollbereich oder abgeschlossen" icon={CheckCircle2} tone="ok" />
        <StatCard label="Kritisch offen" value={`${critical}`} hint="kritische Überschreitungen" icon={ShieldAlert} tone={critical ? 'crit' : 'ok'} />
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={
                  tab === item.key
                    ? 'rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground'
                    : 'rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200'
                }
              >
                {item.label}
                <span className="ml-1.5 tabular opacity-70">
                  {item.key === 'alle' ? alerts.length : alerts.filter((a) => a.status === item.key).length}
                </span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-56">
            <SelectField
              label="Ausprägung"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              options={[
                { value: 'all', label: 'Alle' },
                { value: 'critical', label: 'Kritisch' },
                { value: 'warning', label: 'Warnung' },
                { value: 'info', label: 'Hinweis' },
              ]}
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={tab === 'offen' ? 'Keine offenen Meldungen' : 'Keine Meldungen in dieser Ansicht'}
          description="Meldungen entstehen ausschließlich aus dem regelbasierten Prüflauf gegen die hinterlegten Grenzwerte – es werden keine Meldungen erzeugt, die nicht aus Messwerten ableitbar sind."
        />
      ) : (
        <section className="surface overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                actions={
                  <>
                    {alert.status === 'offen' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(alert, 'quittiert')}>
                        Quittieren
                      </Button>
                    ) : null}
                    {alert.status !== 'erledigt' ? (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(alert, 'erledigt')} aria-label="Als erledigt markieren">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Meldung löschen"
                      onClick={() =>
                        setConfirmState({
                          title: 'Meldung löschen?',
                          description: alert.message,
                          action: async () => base44.entities.Alert.delete(alert.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        onOpenChange={(openState) => !openState && setConfirmState(null)}
        title={confirmState ? confirmState.title : ''}
        description={confirmState ? confirmState.description : ''}
        onConfirm={runDelete}
        busy={busy}
      />
    </div>
  );
}
