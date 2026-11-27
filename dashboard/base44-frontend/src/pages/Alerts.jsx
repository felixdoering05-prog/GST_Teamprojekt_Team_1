import BuildingSchedules from './BuildingSchedules';
import { useBuildingScope, buildingScopeHeaders } from '@/hooks/useBuildingScope';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { BellRing, Check, CheckCircle2, MapPin, RefreshCw, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import BuildingIssues from '@/components/BuildingIssues';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { AlertRow } from '@/components/dashboard/AlertList';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/Field';
import { useToast } from '@/components/ui/use-toast';
import { base44, request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRoomEvidence } from '@/hooks/useRoomEvidence';
import { alertReading } from '@/lib/roomAlerts';
import { resolveBuildingRoom } from '@/lib/roomLocation';
import { RoomFocusDialog } from '@/components/bim/RoomModelPreview';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const TABS = [
  { key: 'offen', label: 'Offen' },
  { key: 'quittiert', label: 'Quittiert' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'alle', label: 'Alle' },
];

export default function Alerts() {
  const [params, setParams] = useSearchParams();
  const scope = useBuildingScope();
  const canIssues = scope.readable('issues').length > 0;
  const canTasks = scope.readable('schedule').length > 0;
  const tasks = canTasks && (!canIssues || (!params.has('issue') && !params.has('alert') && params.get('ansicht')==='aufgaben'));
  const warnings = !params.has('issue') && (params.has('alert') || params.get('ansicht') === 'sensorwarnungen');

  function choose(view) {
    const next = new URLSearchParams(params);
    next.set('ansicht', view);
    next.delete('issue');
    next.delete('alert');
    setParams(next, { preventScrollReset: true });
  }

  return <div className="space-y-5">
    <PageHeader title="Meldungen" description={scope.label} />
    <nav className="flex flex-wrap gap-2" aria-label="Meldungsarten">
      {canIssues && <><Button variant={warnings || tasks ? 'outline' : 'default'} aria-pressed={!warnings && !tasks} onClick={() => choose('maengel')}>Mängel</Button>
      <Button variant={warnings ? 'default' : 'outline'} aria-pressed={warnings} onClick={() => choose('sensorwarnungen')}>Sensorwarnungen</Button></>}
      {canTasks && <Button variant={tasks?'default':'outline'} aria-pressed={tasks} onClick={()=>choose('aufgaben')}>Aufgaben</Button>}
    </nav>
    {tasks ? <BuildingSchedules tasksOnly/> : warnings ? <SensorAlerts /> : <BuildingIssues />}
  </div>;
}

function SensorAlerts() {
  const scope = useBuildingScope();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const buildings = scope.readable('issues');
  const headers = buildingScopeHeaders(buildings);
  const owners = buildings.filter(building => building.is_owner);
  const { toast } = useToast();
  const [tab, setTab] = useState('offen');
  const [severity, setSeverity] = useState('all');
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const query = useQuery({
    queryKey: ['sensor-warnings', scope.team?.id, headers['X-D21-Buildings']],
    queryFn: async () => {
      const rows = await request('/twin/Alert/list', { method: 'POST', body: { sort: '-triggered_at', limit: 500 }, headers });
      const ids = new Set(buildings.map(row => String(row.id)));
      return rows.filter(row => ids.has(String(row.building_id)));
    },
  });
  const alerts = query.data ?? [];
  const alertID = params.get('alert');
  const buildingID = params.get('building') || params.get('building_id') || (buildings.length === 1 ? String(buildings[0].id) : null);
  const alertBuilding = buildings.find(building => String(building.id) === buildingID);
  function showAlert(alert) {
    const next = new URLSearchParams(params);
    next.set('ansicht', 'sensorwarnungen');
    next.set('building', alert.building_id);
    next.set('alert', alert.id);
    setParams(next, { preventScrollReset: true });
  }
  function closeAlert() {
    const next = new URLSearchParams(params);
    next.set('ansicht', 'sensorwarnungen');
    next.delete('building');
    next.delete('alert');
    setParams(next, { replace: true, preventScrollReset: true });
  }
  const load = () => Promise.all([
    cache.invalidateQueries({ queryKey: ['sensor-warnings'] }),
    cache.invalidateQueries({ queryKey: ['sensor-warning'] }),
    cache.invalidateQueries({ queryKey: ['active-room-warnings'] }),
  ]);

  const setStatus = async (alert, status) => {
    try {
      const payload = { status };
      if (status === 'quittiert') {
        payload.acknowledged_by = user.email;
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
      const payload = await request('/twin-functions/runThresholdCheck', {
        method: 'POST', body: { sinceHours: 4 }, headers: buildingScopeHeaders(owners),
      });
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
      <PageHeader title="Sensorwarnungen" description="Grenzwertüberschreitungen und technische Warnungen aus dem regelbasierten Prüflauf.">
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aktualisieren
        </Button>
        {owners.length > 0 && <Button size="sm" onClick={runCheck} disabled={running}>
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> {running ? 'Prüflauf läuft …' : 'Prüflauf starten'}
        </Button>}
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

      {query.isError ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p> : query.isPending ? (
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
                    <Button size="sm" variant="outline" onClick={() => showAlert(alert)}><MapPin className="h-4 w-4" /> Details</Button>
                    {scope.can(alert.building_id, 'issues', 'edit') && alert.status === 'offen' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(alert, 'quittiert')}>
                        Quittieren
                      </Button>
                    ) : null}
                    {scope.can(alert.building_id, 'issues', 'edit') && alert.status !== 'erledigt' ? (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(alert, 'erledigt')} aria-label="Als erledigt markieren">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </Button>
                    ) : null}
                    {scope.can(alert.building_id, 'issues', 'edit') && <Button
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
                    </Button>}
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {alertID && alertBuilding && <AlertDetails key={buildingID + '/' + alertID} id={alertID} building={alertBuilding} close={closeAlert} />}

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

function AlertDetails({ id, building, close }) {
  const alert = useQuery({
    queryKey: ['sensor-warning', building.id, id],
    queryFn: async () => {
      const result = await request('/twin/Alert/filter', { method: 'POST', headers: buildingScopeHeaders([building]),
        body: { filter: { id, building_id: String(building.id) }, options: { limit: 1 } } });
      const row = result.items.find(item => String(item.building_id) === String(building.id));
      if (!row) throw new Error('Diese Sensorwarnung ist nicht verfügbar.');
      return row;
    },
    retry: false,
  });
  const { structure, temperatures } = useRoomEvidence(building.id);
  const locations = structure.data || temperatures.data;
  const room = alert.data && resolveBuildingRoom(locations, { roomID: alert.data.room_id, label: alert.data.room_label });
  const floor = locations?.floors.find(item => item.id === room?.floor_id);
  if (!alert.data) return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent><DialogTitle>Sensorwarnung</DialogTitle>
      <DialogDescription>{alert.error?.message || 'Warnung wird geladen …'}</DialogDescription>
    </DialogContent>
  </Dialog>;
  return <RoomFocusDialog building={building} room={room} floor={floor} label={alert.data.room_label}
    heading={alert.data.title || 'Sensorwarnung'} reading={alertReading(alert.data)} close={close} showModel={false}>
    <p className="text-sm">{alert.data.message}</p>
  </RoomFocusDialog>;
}
