import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, Box, Layers, RefreshCw, Thermometer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import IFCModelFrame from './IFCModelFrame';
import { floorLevel, roomNumber, roomReadings } from '@/lib/roomHeat';
import { ROOM_HEAT_STOPS, ROOM_NO_DATA, roomHeatColor } from '../../../ifc-viewer/room-heat-colors.js';

const degrees = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const measuredAt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const selectClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const low = ROOM_HEAT_STOPS[0].value, high = ROOM_HEAT_STOPS.at(-1).value;
const scalePosition = value => (value - low) / (high - low) * 100;

export default function RoomHeatMap() {
  const [data, setData] = useState({ buildings: [], loading: true, error: '' });
  const [selected, setSelected] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([request('/buildings'), request('/campus/d21')]).then(([buildings, campus]) => {
      if (!active) return;
      const rows = buildings.status === 'fulfilled' ? buildings.value.map(building => ({
        id: String(building.id), buildingID: String(building.id), name: building.name,
        model: building.model_document_id ? { id: building.model_document_id, name: building.name } : null,
      })) : [];
      if (campus.status === 'fulfilled') {
        const metadata = campus.value;
        const id = metadata.building_id == null ? 'campus-d21' : String(metadata.building_id);
        const index = rows.findIndex(row => row.id === id);
        const entry = {
          id, buildingID: metadata.building_id, name: rows[index]?.name || 'D21 · Hochschule Darmstadt',
          model: { id: metadata.id, name: metadata.name, campus: true },
        };
        if (index >= 0) rows.splice(index, 1);
        rows.unshift(entry);
      }
      setData({ buildings: rows, loading: false, error: buildings.status === 'rejected' ? buildings.reason.message : '' });
      setSelected(current => rows.some(row => row.id === current) ? current : (rows.find(row => row.model) || rows[0])?.id || '');
    });
    return () => { active = false; };
  }, [retry]);

  const building = data.buildings.find(row => row.id === selected);
  return <>
    <section className="surface px-4 py-4 sm:px-5" aria-label="Gebäude auswählen">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:max-w-xs">
          <label className="mb-1.5 block text-xs font-semibold" htmlFor="heat-building">Gebäude</label>
          <select className={selectClass} id="heat-building" value={selected} onChange={event => setSelected(event.target.value)} disabled={!data.buildings.length}>
            {!data.buildings.length && <option value="">{data.loading ? 'Gebäude werden geladen …' : 'Keine Gebäude verfügbar'}</option>}
            {data.buildings.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>
      </div>
      {data.error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{data.error}</span>
        <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>Erneut laden</Button>
      </div>}
      {!data.loading && !data.error && !building && <p className="mt-3 text-sm text-muted-foreground">Lege unter <Link className="underline" to="/gebaeude">Gebäude</Link> ein Gebäude mit IFC-Modell an.</p>}
      {building && !building.model && <p className="mt-3 text-sm text-muted-foreground">Für dieses Gebäude ist kein IFC-Modell verfügbar. Modelle findest du in der <Link className="underline" to="/gebaeude">Gebäudemappe</Link>.</p>}
    </section>
    {building?.model && <BuildingRoomHeat key={`${building.id}-${building.model.id}`} building={building} />}
  </>;
}

function BuildingRoomHeat({ building }) {
  const [model, setModel] = useState({ floors: null, floorId: null, plan: null, roomId: null, error: '' });
  const [measurements, setMeasurements] = useState({ data: null, error: '', loading: Boolean(building.buildingID) });
  const [readingRevision, setReadingRevision] = useState(0);
  const [modelRevision, setModelRevision] = useState(0);
  const { campus } = building.model;
  const floor = model.floors?.find(item => item.id === model.floorId);
  const plan = model.plan?.floorId === model.floorId ? model.plan.plan : null;
  const readingByRoom = useMemo(() => roomReadings(floor, measurements.data, campus), [floor, measurements.data, campus]);
  const selectedRoom = plan?.rooms.find(room => room.id === model.roomId);
  const selectedLabel = selectedRoom && (roomNumber(selectedRoom.number, floor.name, campus) || String(plan.rooms.indexOf(selectedRoom) + 1).padStart(2, '0'));
  const roomHeat = useMemo(() => floor ? {
    floorId: floor.id, roomId: model.roomId,
    roomLabel: selectedLabel,
    values: Object.fromEntries(Object.entries(readingByRoom).map(([id, reading]) => [id, reading.value])),
  } : null, [floor, model.roomId, readingByRoom, selectedLabel]);

  useEffect(() => {
    if (!building.buildingID) return;
    let active = true;
    request(`/buildings/${encodeURIComponent(building.buildingID)}/telemetry/room-temperatures`).then(data => {
      if (active) setMeasurements({ data, error: '', loading: false });
    }).catch(error => {
      if (active) setMeasurements(current => ({ ...current, error: error.message, loading: false }));
    });
    return () => { active = false; };
  }, [building.buildingID, readingRevision]);

  const receive = useCallback(event => {
    setModel(current => {
      switch (event.type) {
        case 'd21-room-heat-floors': {
          const floors = event.floors;
          const defaultFloor = floors.find(item => floorLevel(item.name) === 0) || floors[0];
          return { floors, floorId: defaultFloor?.id ?? null, plan: null, roomId: null, error: '' };
        }
        case 'd21-room-heat-plan':
          return current.floorId === event.floorId ? { ...current, plan: event } : current;
        case 'd21-room-heat-selected':
          return current.floorId === event.floorId ? { ...current, roomId: event.roomId } : current;
        case 'd21-room-heat-error':
          return { ...current, error: event.message };
        default:
          return current;
      }
    });
  }, []);

  const selectedReading = readingByRoom[model.roomId];
  const refresh = () => {
    setMeasurements(current => ({ ...current, loading: true, error: '' }));
    setReadingRevision(value => value + 1);
  };

  return <>
    <section className="surface overflow-hidden" aria-labelledby="room-heat-3d">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <h3 id="room-heat-3d" className="flex items-center gap-2 text-base font-semibold"><Box className="h-4 w-4 text-primary" />3D-Geschossschnitt</h3>
          <p className="mt-1 text-xs text-muted-foreground">Drehe den Schnitt oder wähle eine Raumfläche aus.</p>
        </div>
        <div className="w-full sm:w-48">
          <label className="mb-1.5 block text-xs font-semibold" htmlFor="heat-floor">Geschoss</label>
          <select className={selectClass} id="heat-floor" value={model.floorId ?? ''} disabled={!model.floors?.length || Boolean(model.error)}
            onChange={event => setModel(current => ({ ...current, floorId: Number(event.target.value), roomId: null, plan: null }))}>
            {!model.floors?.length && <option value="">{model.error ? 'Modell nicht verfügbar' : model.floors ? 'Keine Geschosse im IFC' : 'Geschosse werden geladen …'}</option>}
            {model.floors?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <IFCModelFrame key={modelRevision} document={building.model} roomHeat={roomHeat} onRoomHeatMessage={receive} />
      {model.error && <div className="border-t border-border px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => {
          setModel({ floors: null, floorId: null, plan: null, roomId: null, error: '' });
          setModelRevision(value => value + 1);
        }}>3D-Modell erneut öffnen</Button>
      </div>}
      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="w-full max-w-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Thermometer className="h-3.5 w-3.5 text-primary" />Raumtemperatur · °C</p>
            <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right, ${ROOM_HEAT_STOPS.map(({ color, value }) => `${color} ${scalePosition(value)}%`).join(', ')})` }} />
            <div className="relative mt-1.5 h-4 text-[10px] tabular-nums text-muted-foreground">
              {ROOM_HEAT_STOPS.map(({ value }) => <span key={value} className="absolute" style={{ left: `${scalePosition(value)}%`, transform: `translateX(-${scalePosition(value)}%)` }}>{value === low ? '≤' : value === high ? '≥' : ''}{value}°</span>)}
            </div>
          </div>
          {building.buildingID && <Button variant="outline" size="sm" className="gap-2" onClick={refresh} disabled={measurements.loading}><RefreshCw className="h-3.5 w-3.5" />Messwerte aktualisieren</Button>}
          {plan && <a className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary underline underline-offset-4" href="#heat-floor-plan">Zum 2D-Grundriss<ArrowDown className="h-3.5 w-3.5" /></a>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-400" style={{ background: ROOM_NO_DATA }} />Kein zugeordneter Messwert</span>
          {measurements.loading ? <span role="status">Raumtemperaturen werden geladen …</span> : floor && <span>{Object.keys(readingByRoom).length} von {floor.rooms.length} Räumen mit Messwert</span>}
          {!building.buildingID && <span>Für dieses Modell fehlt die Verknüpfung zu einem Messdaten-Gebäude.</span>}
          {measurements.error && <span role="alert" className="text-destructive">{measurements.error}{measurements.data && ' Letzter erfolgreicher Abruf wird angezeigt.'}</span>}
        </div>
      </div>
    </section>

    <section id="heat-floor-plan" className="surface scroll-mt-6 overflow-hidden" aria-labelledby="room-heat-2d">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-4 sm:px-5">
        <h3 id="room-heat-2d" className="flex items-center gap-2 text-base font-semibold"><Layers className="h-4 w-4 text-primary" />2D-Grundriss</h3>
        {floor && <span className="text-xs font-medium text-muted-foreground">{building.name} · {floor.name}</span>}
      </div>
      {plan && !model.error ? <div className="overflow-auto bg-slate-50">
        <svg viewBox={plan.viewBox.join(' ')} role="group" aria-label={`Grundriss ${floor.name} mit Raumtemperaturen`} className="mx-auto block h-auto w-full min-w-[640px] max-w-5xl">
          <path d={plan.walls} fill="none" stroke="#81909e" strokeWidth=".07" aria-hidden="true" />
          {plan.rooms.map((room, index) => {
            const number = roomNumber(room.number, floor.name, campus) || String(index + 1).padStart(2, '0');
            const reading = readingByRoom[room.id];
            const selected = model.roomId === room.id;
            const toggle = () => setModel(current => ({ ...current, roomId: selected ? null : room.id }));
            return <g key={room.id} role="button" tabIndex={0} aria-pressed={selected}
              aria-label={`Raum ${number}, ${reading ? `${degrees.format(reading.value)} Grad Celsius` : 'kein Messwert'}`}
              onClick={toggle} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
              }} className="cursor-pointer focus-visible:outline-none focus-visible:[&>path:nth-child(2)]:stroke-slate-900">
              <path d={room.path} fill={roomHeatColor(reading?.value)} />
              <path d={room.outline} fill="none" stroke={selected ? '#172c40' : '#81909e'} strokeWidth={selected ? '.22' : '.08'} pointerEvents="none" />
              <text x={room.label[0]} y={room.label[1]} textAnchor="middle" dominantBaseline="central" fontSize=".9" fontWeight={selected ? 700 : 600} fill="#192738" pointerEvents="none">{number}</text>
            </g>;
          })}
        </svg>
      </div> : <p role="status" className="px-4 py-8 text-sm text-muted-foreground sm:px-5">{model.error ? 'Der Grundriss konnte nicht geladen werden.' : model.plan || model.floors?.length === 0 ? 'Für dieses Modell ist kein Grundriss verfügbar.' : 'Grundriss wird aus dem IFC erstellt …'}</p>}
      {plan && !plan.rooms.length && <p className="px-4 py-3 text-xs text-muted-foreground sm:px-5">Für dieses Geschoss enthält das IFC keine darstellbaren Raumflächen.</p>}
      {selectedRoom && <div role="status" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-sm sm:px-5">
        <strong>Raum {selectedLabel}</strong>
        {selectedReading ? <><span className="font-semibold tabular-nums">{degrees.format(selectedReading.value)} °C</span><span className="text-xs text-muted-foreground">Gemessen am {measuredAt.format(new Date(selectedReading.measured_at))} Uhr</span></> : <span className="text-muted-foreground">Kein zugeordneter Messwert</span>}
      </div>}
    </section>
  </>;
}
