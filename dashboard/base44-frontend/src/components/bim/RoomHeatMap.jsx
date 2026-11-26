import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, Box, Layers, RefreshCw, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import IFCModelFrame from './IFCModelFrame';
import { floorLevel, roomNumber, roomReadings } from '@/lib/roomHeat';
import { readingStatus } from '@/lib/roomAlerts';
import { RoomReading } from './RoomModelPreview';
import { ROOM_HEAT_STOPS, ROOM_NO_DATA, roomHeatColor } from '../../../ifc-viewer/room-heat-colors.js';

const degrees = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const selectClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const low = ROOM_HEAT_STOPS[0].value, high = ROOM_HEAT_STOPS.at(-1).value;
const scalePosition = value => (value - low) / (high - low) * 100;

export default function RoomHeatMap({ building, document, measurements }) {
  const [model, setModel] = useState({ floors: null, floorId: null, plan: null, roomId: null, error: '' });
  const [modelRevision, setModelRevision] = useState(0);
  const { campus } = document;
  const floor = model.floors?.find(item => item.id === model.floorId);
  const plan = model.plan?.floorId === model.floorId ? model.plan.plan : null;
  const readingByRoom = useMemo(() => roomReadings(floor, measurements.data, campus), [floor, measurements.data, campus]);
  const currentReadings = useMemo(() => Object.fromEntries(Object.entries(readingByRoom)
    .filter(([, reading]) => readingStatus(reading) === 'current')), [readingByRoom]);
  const selectedRoom = plan?.rooms.find(room => room.id === model.roomId);
  const selectedLabel = selectedRoom && (roomNumber(selectedRoom.number, floor.name, campus) || String(plan.rooms.indexOf(selectedRoom) + 1).padStart(2, '0'));
  const roomHeat = useMemo(() => floor ? {
    floorId: floor.id, roomId: model.roomId,
    roomLabel: selectedLabel,
    values: Object.fromEntries(Object.entries(currentReadings).map(([id, reading]) => [id, reading.value])),
  } : null, [floor, model.roomId, currentReadings, selectedLabel]);

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
      <IFCModelFrame key={modelRevision} document={document} roomHeat={roomHeat} onRoomHeatMessage={receive} />
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
          {measurements.isEnabled && <Button variant="outline" size="sm" className="gap-2" onClick={() => measurements.refetch()} disabled={measurements.isFetching}><RefreshCw className="h-3.5 w-3.5" />Messwerte aktualisieren</Button>}
          {plan && <a className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary underline underline-offset-4" href="#heat-floor-plan">Zum 2D-Grundriss<ArrowDown className="h-3.5 w-3.5" /></a>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-400" style={{ background: ROOM_NO_DATA }} />Kein aktueller Messwert</span>
          {measurements.isLoading ? <span role="status">Raumtemperaturen werden geladen …</span> : floor && <span>{Object.keys(currentReadings).length} von {floor.rooms.length} Räumen mit aktuellem Messwert</span>}
          {!measurements.isEnabled && <span>Für dieses Konto sind keine Messwerte freigegeben.</span>}
          {measurements.error && <span role="alert" className="text-destructive">{measurements.error.message}</span>}
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
            const reading = currentReadings[room.id];
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
        <RoomReading reading={selectedReading} />
      </div>}
    </section>
  </>;
}
