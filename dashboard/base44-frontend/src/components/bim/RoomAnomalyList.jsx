import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { request } from '@/api/base44Client';
import { buildingScopeHeaders, useBuildingScope } from '@/hooks/useBuildingScope';
import { readingStatus, roomAnomalies } from '@/lib/roomAlerts';
import { RoomFocusDialog, RoomReading } from './RoomModelPreview';

export default function RoomAnomalyList({ building, document, structure, temperatures }) {
  const scope = useBuildingScope();
  const [params, setParams] = useSearchParams();
  const alerts = useQuery({
    queryKey: ['active-room-warnings', building.id],
    enabled: scope.can(building.id, 'issues'),
    queryFn: async () => {
      const result = await request('/twin/Alert/filter', {
        method: 'POST', headers: buildingScopeHeaders([building]),
        body: { filter: { building_id: String(building.id), status: { $in: ['offen', 'quittiert'] } }, options: { sort: '-triggered_at', limit: 200 } },
      });
      return result.items.filter(item => String(item.building_id) === String(building.id));
    },
    refetchInterval: 60000,
  });
  const rows = roomAnomalies(structure.data, temperatures.data, alerts.data ?? []);
  const statuses = (temperatures.data?.rooms ?? []).map(room => readingStatus(room.reading));
  const missing = statuses.filter(value => value === 'missing').length;
  const stale = statuses.filter(value => value === 'stale').length;
  const unknown = statuses.filter(value => value === 'unknown-time').length;
  const selected = rows.find(row => row.room.id === params.get('focusRoom'));
  const loading = structure.isLoading || temperatures.isLoading || alerts.isLoading;
  const error = temperatures.error || alerts.error || structure.error;

  function setRoom(roomID) {
    const next = new URLSearchParams(params);
    if (roomID) next.set('focusRoom', roomID);
    else next.delete('focusRoom');
    setParams(next, { replace: !roomID, preventScrollReset: true });
  }

  return <section className="surface space-y-2 p-4 sm:p-5" aria-labelledby="heat-anomalies">
    <h3 id="heat-anomalies" className="font-heading text-base font-semibold">Auffällige Räume</h3>
    {loading && <p role="status" className="text-sm text-muted-foreground">Messwerte und Warnungen werden geladen …</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    {!temperatures.isEnabled && !alerts.isEnabled && <p className="text-sm text-muted-foreground">Für dieses Konto sind keine Messwerte oder Sensorwarnungen freigegeben.</p>}
    {!loading && !error && !rows.length && (temperatures.isEnabled || alerts.isEnabled) && <p className="text-sm text-muted-foreground">Keine Räume mit aktiver Sensorwarnung oder aktueller Grenzwertverletzung gefunden.</p>}
    {(missing > 0 || stale > 0 || unknown > 0) && <p className="text-xs text-muted-foreground">
      {[missing > 0 && `${missing} ohne Temperaturmesswert`, stale > 0 && `${stale} mit veraltetem Temperaturmesswert`, unknown > 0 && `${unknown} ohne gültigen Messzeitpunkt`].filter(Boolean).join(' · ')}
    </p>}
    {rows.length > 0 && <ul className="max-h-80 divide-y divide-border overflow-auto">
      {rows.map(({ room, floor, reasons }) => <li key={room.id}>
        <button type="button" onClick={() => setRoom(room.id)}
          className="flex min-h-12 w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted focus-visible:outline-ring">
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{[room.room_code, room.name].filter(Boolean).join(' · ')} <span className="text-xs font-normal text-muted-foreground">· {floor?.name || 'Geschoss nicht hinterlegt'}</span></span>
            {reasons.map(item => <span key={item.key} className="mt-1 block text-xs">
              <span className="block break-words">{item.reason}</span>
              <span className="text-muted-foreground">{item.sampleLabel} · <RoomReading reading={item.reading} /></span>
            </span>)}
          </span>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
    {selected && <RoomFocusDialog key={selected.room.id} building={building} room={selected.room} floor={selected.floor}
      document={document} reading={selected.room.reading ?? selected.reasons[0]?.reading} close={() => setRoom(null)} />}
  </section>;
}
