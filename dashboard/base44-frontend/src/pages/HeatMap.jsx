import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Leaf, Snowflake, Sun, Pause, Play, RotateCcw, Thermometer, Layers } from 'lucide-react';
import { request } from '@/api/base44Client';
import { useBuildingScope } from '@/hooks/useBuildingScope';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { useBuildingModels } from '@/hooks/useBuildingModels';
import { useRoomEvidence } from '@/hooks/useRoomEvidence';
import { Button } from '@/components/ui/button';
import IFCModelFrame from '@/components/bim/IFCModelFrame';
import RoomHeatMap from '@/components/bim/RoomHeatMap';
import RoomAnomalyList from '@/components/bim/RoomAnomalyList';
import BuildingSectionSelect from '@/components/rooms/BuildingSectionSelect';
import { readingStatus } from '@/lib/roomAlerts';
import { HEAT_GRADIENT, HEAT_STOPS, ROOM_TEMPERATURE_SCENARIOS, SEASONS, heatColor, scenarioConditions, scenarioDate, seasonForDay, surfaceTemperature } from '../../ifc-viewer/heat-simulation.js';
import { createWeatherProfile } from '../../ifc-viewer/weather-profile.js';

const ICONS = { spring: Leaf, summer: Sun, autumn: Leaf, winter: Snowflake };
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthDays = MONTHS.map((_, index) => Math.round((Date.UTC(2025, index, 15) - Date.UTC(2025, 0, 1)) / 86400000));
const temperature = value => Number.isFinite(value) ? value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
const DWD_SOURCE = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/historical/';
const EMPTY_READING = { temperature: null, timestamp: null, quality: null, ambiguous: false };
const measurementTime = timestamp => timestamp ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(timestamp)) : '';
const measurementUTC = timestamp => timestamp ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(timestamp)) + ' UTC' : '';

function CampusHeatMap({ buildingIDs }) {
  const [scenario, setScenario] = useState({ day: 196, hour: 14, campus: true });
  const [playing, setPlaying] = useState(false);
  const [campus, setCampus] = useState({ loading: true, available: false, message: '' });
  const [revision, setRevision] = useState(0);
  const [weather, setWeather] = useState({ loading: true, profile: null, error: '' });
  const [weatherRevision, setWeatherRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWeather({ loading: true, profile: null, error: '' });
    (async () => {
      const response = await fetch('/weather/frankfurt-2025.json', { signal: controller.signal });
      if (!response.ok) throw new Error('Die DWD-Messdaten konnten nicht geladen werden.');
      const profile = createWeatherProfile(await response.json());
      if (active) setWeather({ loading: false, profile, error: '' });
    })().catch(error => {
      if (active) setWeather({ loading: false, profile: null, error: error.message || 'Die DWD-Messdaten konnten nicht geladen werden.' });
    });
    return () => { active = false; controller.abort(); };
  }, [weatherRevision]);
  useEffect(() => {
    let active = true;
    setCampus(current => ({ ...current, loading: true }));
    request('/campus/d21').then(metadata => { if (active) setCampus({
      loading: false, available: buildingIDs.split(',').includes(String(metadata.building_id)), message: '',
    }); })
      .catch(error => { if (active) setCampus({ loading: false, available: false, message: error.message }); });
    return () => { active = false; };
  }, [revision, buildingIDs]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setScenario(current => ({ ...current, day: (current.day + 7) % 365 })), 850);
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pause); };
  }, [playing]);
  const reading = useMemo(() => weather.profile?.lookup(scenario.day, scenario.hour) || EMPTY_READING, [weather.profile, scenario.day, scenario.hour]);
  const heatScenario = useMemo(() => ({ ...scenario, source: 'dwd', airTemperature: reading.temperature }), [scenario, reading.temperature]);
  const season = seasonForDay(scenario.day);
  const conditions = scenarioConditions(heatScenario);
  const sunSurface = surfaceTemperature(heatScenario, [0, 0, 0], conditions.direction);
  const sheltered = surfaceTemperature(heatScenario, [0, 0, 0], conditions.direction.map(value => -value));
  const monthSamples = useMemo(() => monthDays.map(day => {
    const sample = weather.profile?.lookup(day, scenario.hour) || EMPTY_READING;
    const state = { day, hour: scenario.hour, source: 'dwd', airTemperature: sample.temperature };
    const condition = scenarioConditions(state);
    return { day, temperature: surfaceTemperature(state, [0, 0, 0], condition.direction) };
  }), [weather.profile, scenario.hour]);
  const setDay = day => { setPlaying(false); setScenario(current => ({ ...current, day })); };
  const reset = () => { setPlaying(false); setScenario({ day: 196, hour: 14, campus: true }); };
  const model = { id: 'campus-d21', name: 'H_DA_D21_Final.ifc', campus: true, mapOnly: !campus.available };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">D21 · Campus Darmstadt</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Temperaturen im Jahresverlauf</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Erkunde, wie sich die Wärmeverteilung mit Jahreszeit und Tageszeit verändert.</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />DWD-Lufttemperatur · Oberflächen simuliert</span>
    </div>

    <section className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3" aria-label="Wetterdatenquelle">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-foreground">Wetterstation Frankfurt/Main · DWD 01420</p><span className="text-xs text-muted-foreground">Historische Messungen · 2025</span></div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Die gemessene Lufttemperatur aus Frankfurt bildet die regionale Grundlage. Sie ist kein Messwert am D21-Campus. Die farbigen Gebäude- und Kartenflächen bleiben eine Simulation.</p>
      {weather.loading ? <p role="status" className="mt-2 text-xs text-muted-foreground">DWD-Messdaten werden geladen. Bis dahin bleibt die Temperatureinfärbung aus.</p> : weather.error ? <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive"><span>{weather.error} Ohne Messwert wird keine Temperatur dargestellt.</span><button type="button" className="min-h-9 font-medium underline" onClick={() => setWeatherRevision(value => value + 1)}>Wetterdaten erneut laden</button></div> : <>
        <p className="mt-2 text-xs font-medium text-foreground">{reading.timestamp ? `Messzeit: ${measurementTime(reading.timestamp)} Uhr · ${measurementUTC(reading.timestamp)}` : `Für ${scenarioDate(scenario.day)} 2025 um ${String(scenario.hour).padStart(2, '0')}:00 Uhr liegt kein Messzeitpunkt vor.`}</p>
        {reading.temperature === null && <p role="status" className="mt-1 text-xs text-amber-800">Für diese Stunde ist keine Lufttemperatur verfügbar. Bei der Umstellung auf Sommerzeit entfällt 02:00 Uhr; fehlende Messwerte werden nicht ersetzt.</p>}
        {reading.ambiguous && <p className="mt-1 text-xs text-muted-foreground">Diese Ortszeit kommt bei der Zeitumstellung zweimal vor. Angezeigt wird die erste Messung; die UTC-Zeit kennzeichnet sie eindeutig.</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Quelle: <a href={weather.profile?.source?.url || DWD_SOURCE} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">Deutscher Wetterdienst, Climate Data Center</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-2">CC BY 4.0</a> · Jahresausschnitt · Lufttemperatur in 2 m Höhe · Zeitregler: MEZ/MESZ · keine Livewerte oder Vorhersage.</p>
      </>}
    </section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="surface min-w-0 overflow-hidden" aria-label="Temperaturverteilung auf dem Campus">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-orange-500" />D21 · Heat map</div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{season.label} · {scenarioDate(scenario.day)} 2025 · {String(scenario.hour).padStart(2, '0')}:00</span>
        </div>
        {campus.loading ? <div role="status" className="grid h-[560px] place-items-center text-sm text-muted-foreground">Campus und D21-Modell werden vorbereitet …</div> : <>
          {campus.message && <div role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900"><span>{campus.message} {campus.message.includes('nicht freigegeben') ? 'Die Freigabe erfolgt über die bestehende Gebäudemitgliedschaft: Die zuständige Eigentümerperson muss dieses Konto einladen; danach muss die Einladung angenommen werden.' : 'Bitte die D21-Gebäudezuordnung und IFC-Datei auf dem Projektserver prüfen.'} Die Simulation zeigt bis dahin die Campuskarte; das D21-3D-Modell ist nicht verfügbar.</span><button type="button" className="min-h-9 underline" onClick={() => setRevision(value => value + 1)}>Modell erneut laden</button></div>}
          <IFCModelFrame key={String(model.mapOnly)} document={model} heatmap={heatScenario} />
        </>}
        <div className="border-t border-border bg-card px-5 py-4" aria-label="Temperaturlegende von minus 10 bis 50 Grad Celsius">
          <div className="mb-2 flex justify-between text-xs font-medium text-foreground"><span>Kalt</span><span>Oberflächentemperatur · °C</span><span>Heiß</span></div>
          <div className="h-3 rounded-full" style={{ background: HEAT_GRADIENT }} />
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted-foreground">{HEAT_STOPS.map((stop, index) => <span key={stop.value}>{index === 0 ? '≤' : index === HEAT_STOPS.length - 1 ? '≥' : ''}{stop.value}°</span>)}</div>
          <p className="mt-2 text-[11px] text-muted-foreground">Feste Skala für alle Jahreszeiten. Eine Fläche anklicken, um den simulierten Wert zu sehen. Grau bedeutet: kein Wetterwert verfügbar.</p>
        </div>
      </section>

      <aside className="surface flex flex-col p-5" aria-label="Jahreszeiten-Simulation steuern">
        <div className="flex items-center justify-between"><h3 className="font-heading text-base font-semibold">Simulation</h3><button type="button" onClick={reset} aria-label="Simulation zurücksetzen" title="Simulation zurücksetzen" className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCcw className="h-4 w-4" /></button></div>
        <p className="mb-4 text-xs text-muted-foreground">Eine Jahreszeit auswählen oder selbst erkunden.</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Jahreszeit auswählen">
          {SEASONS.map(item => { const Icon = ICONS[item.id]; const active = season.id === item.id; return <button type="button" key={item.id} aria-pressed={active} onClick={() => setDay(item.day)} className={`min-h-[88px] rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary/40 bg-primary/5 text-primary ring-1 ring-primary/20' : 'border-border text-muted-foreground hover:bg-muted/60'}`}><Icon className="mb-2 h-4 w-4" /><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[10px]">{item.description}</span></button>; })}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between"><label htmlFor="heat-day" className="text-xs font-semibold">Jahresverlauf 2025</label><output htmlFor="heat-day" className="text-xs tabular-nums text-muted-foreground">{scenarioDate(scenario.day)}</output></div>
          <input id="heat-day" type="range" min="0" max="364" step="1" value={scenario.day} aria-valuetext={scenarioDate(scenario.day)} onChange={event => setDay(Number(event.target.value))} className="h-6 w-full cursor-pointer accent-primary" />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>Januar</span><span>Dezember</span></div>
          <Button type="button" className="mt-4 w-full gap-2" variant={playing ? 'outline' : 'default'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Jahresverlauf pausieren' : 'Jahresverlauf abspielen'}</Button>
        </div>
        <div className="mt-6">
          <div className="mb-3 flex justify-between"><label htmlFor="heat-hour" className="text-xs font-semibold">Tageszeit · MEZ/MESZ</label><output htmlFor="heat-hour" className="text-xs tabular-nums text-muted-foreground">{String(scenario.hour).padStart(2, '0')}:00 Uhr</output></div>
          <input id="heat-hour" type="range" min="0" max="23" step="1" value={scenario.hour} aria-valuetext={`${scenario.hour} Uhr`} onChange={event => setScenario(current => ({ ...current, hour: Number(event.target.value) }))} className="h-6 w-full cursor-pointer accent-primary" />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>00:00</span><span>12:00</span><span>23:00</span></div>
        </div>
        <label className="mt-6 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-xs"><span className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />Campus einfärben</span><input type="checkbox" checked={scenario.campus} onChange={event => setScenario(current => ({ ...current, campus: event.target.checked }))} className="h-4 w-4 accent-primary" /></label>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Blau und Türkis zeigen kühle, Grün und Gelb mildere, Orange und Rot heiße Flächen.</p>
      </aside>
    </div>

    <section className="grid gap-3 sm:grid-cols-3" aria-label="Luftmessung und simulierte Referenzflächen">
      {[{ label: 'DWD-Lufttemperatur', value: reading.temperature, hint: reading.timestamp ? `Frankfurt/Main · ${measurementTime(reading.timestamp)} Uhr` : 'Für diese Stunde kein Messwert', icon: Thermometer }, { label: 'Besonnte Referenzfläche', value: sunSurface, hint: 'Simuliert · volle Ausrichtung zur Sonne', icon: Sun }, { label: 'Abgewandte Referenzfläche', value: sheltered, hint: 'Simuliert · ohne direkte Besonnung', icon: Snowflake }].map(item => <div key={item.label} className="surface flex items-start gap-3 p-4"><span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ background: heatColor(item.value) }} /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{temperature(item.value)} <span className="text-sm font-normal text-muted-foreground">°C</span></p><p className="mt-1 text-[10px] text-muted-foreground">{item.hint}</p></div><item.icon className="h-4 w-4 text-muted-foreground" /></div>)}
    </section>

    <section className="surface px-5 py-4" aria-label="Monatsvergleich">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">2025 im Überblick</h3><p className="text-[11px] text-muted-foreground">Simulierte besonnte Referenzfläche · jeweils 15. des Monats · gewählte Ortszeit</p></div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">{monthSamples.map(({ day, temperature: value }, index) => {
        const active = new Date(Date.UTC(2025, 0, scenario.day + 1)).getUTCMonth() === index;
        return <button key={day} type="button" onClick={() => setDay(day)} aria-pressed={active} aria-label={Number.isFinite(value) ? `${MONTHS[index]}: ${temperature(value)} Grad Celsius simuliert auf DWD-Grundlage` : `${MONTHS[index]}: kein Wetterwert verfügbar`} className={`rounded-lg p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted'}`}><div className="mb-2 h-9 rounded-md" style={{ background: heatColor(value) }} /><span className="block text-[11px] font-medium">{MONTHS[index]}</span><span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">{temperature(value)}{Number.isFinite(value) ? '°' : ''}</span></button>;
      })}</div>
    </section>
    <details className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Wie entstehen die Farben?</summary><p className="mt-3 max-w-4xl leading-relaxed">Die historische stündliche DWD-Lufttemperatur der Wetterstation Frankfurt/Main aus 2025 ersetzt die bisher frei gewählte Umgebungsluft. Die Werte dienen als regionale Referenz und wurden nicht am D21 gemessen. Für die Oberflächen wird weiterhin eine vereinfachte, von Jahreszeit, Tageszeit und Flächenausrichtung abhängige Erwärmung simuliert. Die Campusfläche erhält eine schematische räumliche Variation. Reale Materialeigenschaften und Verschattungen werden nicht berechnet; die Darstellung sagt keine Raumtemperaturen vorher. Fehlende Messwerte werden weder interpoliert noch durch erfundene Temperaturen ersetzt. Alle Ansichten verwenden dieselbe Skala von −10 bis 50 °C. Das private D21-IFC bleibt unverändert; die Einfärbung ist eine lokale Ansicht.</p></details>
  </div>;
}


function RoomDataHeatMap({ simulated, building, document, modelLoading, temperatures }) {
  const scope = useBuildingScope();
  const cache = useQueryClient();
  const [roomScenarioID, setRoomScenarioID] = useState('comfort');
  const roomScenario = ROOM_TEMPERATURE_SCENARIOS.find(item => item.id === roomScenarioID) || ROOM_TEMPERATURE_SCENARIOS[1];
  const [heatStatus, setHeatStatus] = useState(null);
  const weatherKey = ['building-weather', building.id];
  const weatherPath = `/buildings/${building.id}/weather`;
  const weatherState = useQuery({ queryKey: weatherKey, queryFn: () => request(weatherPath),
    enabled: scope.can(building.id, 'settings'), retry: false });
  const refreshWeather = useMutation({
    mutationFn: () => request(weatherPath + '/refresh', { method: 'POST', body: {} }),
    onSuccess: result => cache.setQueryData(weatherKey, result),
  });
  const roomReadings = useMemo(() => (temperatures.data?.rooms ?? [])
    .filter(room => room.ifc_global_id?.trim() && readingStatus(room.reading) === 'current')
    .map(({ reading, ...room }) => ({
      globalId: room.ifc_global_id.trim(), roomCode: room.room_code, roomName: room.name,
      temperature: reading.value, unit: reading.unit, measuredAt: reading.measured_at,
      sensorCode: reading.sensor_code, source: reading.source,
    })), [temperatures.data, temperatures.dataUpdatedAt]);

  const roomHeatmap = useMemo(() => simulated
    ? { mode: 'simulated-rooms', roomSimulation: { preset: roomScenario.id } }
    : { mode: 'measured', roomReadings }, [simulated, roomScenario.id, roomReadings]);
  const currentWeather = weatherState.data?.weather?.current;
  const weatherError = refreshWeather.error || weatherState.error;

  return <div className="space-y-4">
    {scope.can(building.id, 'settings', 'edit') && <Button type="button" variant="outline"
      onClick={() => refreshWeather.mutate()} disabled={refreshWeather.isPending}>
      {refreshWeather.isPending ? 'Wetter wird aktualisiert …' : 'Außenwetter aktualisieren'}
    </Button>}

    {simulated && <section className="surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="Raumtemperatur-Szenario">
      <div className="max-w-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Präsentationssimulation · keine Messwerte</p>
        <h3 className="mt-1 text-sm font-semibold">Szenario für die Raumtemperaturen</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Die IFC-Räume erhalten reproduzierbare Beispielwerte. Das Modell nutzt weder Sensor- noch Wetterdaten und speichert keine Simulationswerte.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Simulationsszenario wählen">
        {ROOM_TEMPERATURE_SCENARIOS.map(item => <button key={item.id} type="button" aria-pressed={roomScenarioID === item.id} onClick={() => setRoomScenarioID(item.id)} className={`min-h-12 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${roomScenarioID === item.id ? 'border-primary/40 bg-primary/10 text-primary shadow-sm' : 'border-white/80 bg-white/55 text-foreground hover:bg-white/80'}`}>
          <span className="block text-xs font-semibold">{item.label}</span><span className="block text-[10px] text-muted-foreground">Basis {temperature(item.baseTemperature)} °C</span>
        </button>)}
      </div>
      <p className="w-full text-[11px] text-muted-foreground">Aktive Annahmen: Außen {temperature(roomScenario.outsideTemperature)} °C · Solaraufschlag bis {temperature(roomScenario.solarGain)} °C · {roomScenario.description}. Diese Annahmen sind Teil der Simulation und keine abgerufenen Wetterwerte.</p>
    </section>}

    {weatherState.isSuccess && !weatherState.data.location && <p role="status" className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-900">Für dieses Gebäude ist kein Wetterstandort gespeichert.</p>}

    <section className="grid gap-3 sm:grid-cols-3" aria-label={simulated ? 'Raumsimulation und Außenwetter' : 'Echte Raumdaten und Außenwetter'}>
      <div className="surface p-4"><p className="text-xs text-muted-foreground">{simulated ? 'Szenario-Basiswert' : 'Echte Raumwerte mit IFC-ID'}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{simulated ? `${temperature(roomScenario.baseTemperature)} °C` : roomReadings.length}</p><p className="mt-1 text-[11px] text-muted-foreground">{simulated ? `${roomScenario.label} · Beispielannahme` : 'Temperatur · Qualität „ok“ · maximal 24 Stunden alt'}</p></div>
      <div className="surface p-4"><p className="text-xs text-muted-foreground">{simulated ? 'Simulierte IFC-Räume' : 'IFC-Räume mit Messwerten'}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{heatStatus && Boolean(heatStatus.simulated) === simulated ? heatStatus.matchedRooms : '—'}</p><p className="mt-1 text-[11px] text-muted-foreground">{simulated ? 'aus IFC-Raumgeometrie · nicht gespeichert' : heatStatus ? 'GlobalId stimmt mit dem Modell überein' : 'Wird beim Modellladen ermittelt'}</p></div>
      <div className="surface p-4"><p className="text-xs text-muted-foreground">Außenwetter · Open-Meteo</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Number.isFinite(currentWeather?.temperature) ? `${temperature(currentWeather.temperature)} °C` : '—'}</p><p className="mt-1 text-[11px] text-muted-foreground">{currentWeather?.time ? `Modell-/Prognosedaten · Stand ${measurementTime(currentWeather.time)}` : weatherState.isLoading ? 'Wetterdaten werden geladen …' : weatherState.isEnabled ? 'Keine Wetterdaten verfügbar' : 'Außenwetter ist für dieses Konto nicht freigegeben'}</p></div>
    </section>

    {weatherError && <p role="status" className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs text-amber-900">{weatherError.message}</p>}

    {document ? <section className="surface min-w-0 overflow-hidden" aria-label={simulated ? 'Simulierte Raumtemperaturen im IFC-Modell' : 'Gemessene Raumtemperaturen im IFC-Modell'}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-4 py-3">
        <div><h3 className="text-sm font-semibold">{building.name} · Raumtemperaturen</h3><p className="text-xs text-muted-foreground">{simulated ? 'Eine reproduzierbare Präsentationssimulation färbt Räume anhand ihrer IFC GlobalId und Geschosslage.' : 'Nur echte, aktuelle Messwerte mit exakter IFC GlobalId-Zuordnung werden eingefärbt.'}</p></div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${simulated ? 'border-amber-200 bg-amber-50/90 text-amber-900' : 'border-emerald-200 bg-emerald-50/90 text-emerald-800'}`}>{simulated ? 'Simulation · keine Messwerte · nicht gespeichert' : 'Messdaten · feste Skala −10 bis 50 °C'}</span>
      </div>
      <IFCModelFrame document={document} heatmap={roomHeatmap} onHeatStatus={setHeatStatus} />
      <div className="border-t border-white/70 bg-white/50 px-5 py-4" aria-label="Feste Temperaturskala">
        <p className="mb-2 flex justify-between text-xs font-medium"><span>Kalt</span><span>{simulated ? 'Simulierte Raumtemperatur · °C' : 'Gemessene Raumtemperatur · °C'}</span><span>Warm</span></p>
        <div className="h-3 rounded-full" style={{ background: HEAT_GRADIENT }} />
        <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted-foreground">{HEAT_STOPS.map((stop,index)=><span key={stop.value}>{index===0?'≤':index===HEAT_STOPS.length-1?'≥':''}{stop.value}°</span>)}</div>
        <p className="mt-2 text-[11px] text-muted-foreground">{simulated ? 'Feste Skala −10 bis 50 °C. Die Temperaturfelder zeigen deterministische Szenariowerte, keine Messung und keine bauphysikalische Prognose. Nicht zugeordnete oder geometrisch fehlende Räume bleiben neutral.' : 'Werte außerhalb der Skala werden an den Grenzen eingefärbt. Die Farben werden nicht räumlich über mehrere Sensorpunkte interpoliert. Nicht zugeordnete Räume bleiben in ihrer IFC-Originaldarstellung.'}</p>
      </div>
    </section> : <section className="surface grid min-h-72 place-items-center p-8 text-center">
      <p role="status" className="font-semibold">{modelLoading ? 'IFC-Modell wird gesucht …' : 'Für dieses Gebäude ist kein Modell hinterlegt.'}</p>
    </section>}

    <details className="surface px-4 py-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">Datenherkunft und Grenzen</summary>
      <p className="mt-3 max-w-4xl leading-relaxed">{simulated ? 'Die Raumsimulation erzeugt stabile, reproduzierbare Beispieltemperaturen ausschließlich aus einer fest eingebauten Szenariovorgabe, der IFC GlobalId und der Geschosslage. Die Farbflächen entsprechen den IFC-Raumgeometrien; der Einzelfarbwert ist keine reale Messung und keine validierte thermische Berechnung. Es werden keine Sensor- oder Wetterdaten verwendet und nichts in der Datenbank gespeichert. Open-Meteo-Außenwetter wird separat angezeigt. Die Campus-Simulation enthält weiterhin historische Frankfurter DWD-Außenluftwerte von 2025 und eine schematische Oberflächendarstellung.' : 'Raumfarben stammen ausschließlich aus als echt markierten Temperaturmessungen der letzten 24 Stunden mit Qualitätsstatus „ok“, aktiver Temperatur-Sensorzuordnung und Einheit °C. Der Raum muss über seine hinterlegte IFC GlobalId eindeutig im geladenen IFC vorkommen. Werte werden je Raum nicht gemittelt oder über Messlücken interpoliert. Open-Meteo liefert hier Außenwetter-Modell-/Prognosedaten, keine Gebäudemessung; diese Werte beeinflussen die Raumfarben nicht. Die separate DWD-Ansicht enthält historische Frankfurter Stationsmessungen aus 2025 und weiterhin eine ausdrücklich bezeichnete schematische Oberflächensimulation.'}</p>
    </details>
  </div>;
}

export default function HeatMap() {
  const scope = useBuildingScope();
  const selection = useBuildingSelection('bim');
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') || 'floors';
  function setMode(value) {
    const next = new URLSearchParams(params);
    next.set('mode', value);
    next.delete('focusRoom');
    setParams(next, { preventScrollReset: true });
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="mb-1 text-xs font-semibold text-primary">{mode === 'campus' ? 'Campus-Simulation' : scope.label}</p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Temperaturverteilung</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Raumtemperaturen im Geschossschnitt und Grundriss ansehen oder eine Simulation öffnen.</p>
      </div>
      <div className="inline-flex flex-wrap rounded-2xl border border-white/80 bg-white/65 p-1 shadow-sm backdrop-blur-xl" role="group" aria-label="Heatmap-Modus">
        <Button type="button" size="sm" variant={mode === "floors" ? "default" : "ghost"} aria-pressed={mode === "floors"} onClick={() => setMode("floors")}>Geschosspläne</Button>
        <button type="button" aria-pressed={mode==='rooms'} onClick={()=>setMode('rooms')} className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${mode==='rooms'?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-white/70'}`}>Raummesswerte</button>
        <button type="button" aria-pressed={mode==='room-simulation'} onClick={()=>setMode('room-simulation')} className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${mode==='room-simulation'?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-white/70'}`}>Raumsimulation</button>
        <button type="button" aria-pressed={mode==='campus'} onClick={()=>setMode('campus')} className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${mode==='campus'?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-white/70'}`}>Campus-Simulation</button>
      </div>
    </div>
    {mode === 'campus' ? <CampusHeatMap buildingIDs={scope.readable('bim').map(row => row.id).join(',')} /> : <>
      <BuildingSectionSelect selection={selection} />
      {selection.building && <BuildingHeatMap key={selection.building.id} building={selection.building} mode={mode} />}
    </>}
  </div>;
}

function BuildingHeatMap({ building, mode }) {
  const [modelID, setModelID] = useState('');
  const { models, loading, error, refresh } = useBuildingModels([building]);
  const { structure, temperatures } = useRoomEvidence(building.id);
  const document = models.find(item => String(item.id) === modelID) || models[0];
  const simulated = mode === 'room-simulation';
  return <>
    {models.length > 1 && <label className="grid max-w-sm gap-1 text-xs font-medium">IFC-Modell
      <select className="min-h-10 rounded-xl border border-input bg-card px-3 text-sm" value={document?.id ?? ''}
        onChange={event => setModelID(event.target.value)}>
        {models.map(file => <option key={file.id} value={file.id}>{file.name}</option>)}
      </select>
    </label>}
    {error && <div role="alert" className="surface flex flex-wrap items-center gap-2 p-4 text-sm text-destructive">
      <p>{error.message}</p><Button variant="outline" size="sm" onClick={refresh}>Erneut laden</Button>
    </div>}
    {!simulated && <RoomAnomalyList building={building} document={document} structure={structure} temperatures={temperatures} />}
    {mode === 'floors' ? document ? <RoomHeatMap key={document.id} building={building} document={document} measurements={temperatures} />
      : <p role="status" className="surface p-5 text-sm">{loading ? 'IFC-Modell wird gesucht …' : 'Für dieses Gebäude ist kein Modell hinterlegt.'}</p>
      : <RoomDataHeatMap key={document?.id ?? 'no-ifc'} building={building} document={document}
          temperatures={temperatures} modelLoading={loading} simulated={simulated} />}
  </>;
}
