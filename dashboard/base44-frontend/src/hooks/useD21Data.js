import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '@/api/base44Client';
import { DEFAULT_THRESHOLDS } from '@/lib/metrics';

const HOUR = 3600 * 1000;
export const SERIES_HOURS = 24;
const PAGE_SIZE = 500;
const MAX_PAGES = 5;

const EMPTY = {
  loading: true,
  error: null,
  building: null,
  buildings: [],
  floors: [],
  rooms: [],
  sensors: [],
  thresholds: DEFAULT_THRESHOLDS,
  alerts: [],
  series: [],
  latest: {},
  counts: { demo: 0, real: 0 },
};

/**
 * Gemeinsame Datenbasis für alle Ansichten:
 * Gebäude, Geschosse, Räume, Sensoren, Grenzwerte, Meldungen und
 * die Messwerte der letzten 24 Stunden.
 */
export default function useD21Data(requestedBuildingID = '', { refreshMs = 0, buildingIDs } = {}) {
  const key = JSON.stringify([requestedBuildingID, buildingIDs]);
  const [state, setState] = useState({ ...EMPTY, key });
  const sequence = useRef(0);
  const busy = useRef(false);

  // silent: Hintergrundabgleich ohne Ladeanzeige; bei einem Fehler bleiben die angezeigten Werte stehen.
  const load = useCallback(async (options) => {
    const silent = options?.silent === true;
    if (silent && busy.current) return;
    const current = ++sequence.current;
    busy.current = true;
    if (!silent) setState(s => ({ ...(s.key === key ? s : EMPTY), key, loading: true, error: null }));
    if (buildingIDs === '') {
      setState({ ...EMPTY, key, loading: false });
      busy.current = false;
      return;
    }
    try {
      const since = new Date(Date.now() - SERIES_HOURS * HOUR).toISOString();

      const explicit = buildingIDs ?? (requestedBuildingID || undefined);
      const scoped = explicit !== undefined;
      const ids = new Set(scoped ? String(explicit).split(',').filter(Boolean) : []);
      const read = (entity, action, body) => request('/twin/' + entity + '/' + action, {
        method: 'POST', body, headers: scoped ? { 'X-D21-Buildings': String(explicit) } : {},
      });
      const list = (entity, sort, limit) => read(entity, 'list', { sort, limit });
      const filter = (entity, filter, options) => read(entity, 'filter', { filter, options });
      const [buildings, floors, rooms, sensors, thresholdRows, alertPage] = await Promise.all([
        list('Building', '-created_date', 500),
        list('Floor', 'level', 100),
        list('Room', 'room_code', 500),
        list('Sensor', 'sensor_code', 500),
        list('ThresholdConfig', 'metric', 20),
        filter('Alert', { status: { $ne: 'erledigt' } }, { sort: '-triggered_at', limit: 200 }),
      ]);

      const series = [];
      let cursor;
      let pages = 0;
      let hasMore = true;
      while (hasMore && pages < MAX_PAGES) {
        const options = { sort: '-measured_at', limit: PAGE_SIZE };
        if (cursor) options.cursor = cursor;
        const page = await filter('Measurement', { measured_at: { $gte: since } }, options);
        series.push(...(page.items || []));
        hasMore = Boolean(page.has_more);
        cursor = page.next_cursor;
        pages += 1;
      }

      if (current !== sequence.current) return;
      const available = scoped ? buildings.filter(row => ids.has(String(row.id))) : buildings;
      const selected = requestedBuildingID ? available.find(row => String(row.id) === String(requestedBuildingID))
        : available.length === 1 || !scoped ? available[0] : null;
      const belongs = row => scoped ? ids.has(String(row.building_id)) : String(row.building_id) === String(selected?.id);
      const thresholds = { ...DEFAULT_THRESHOLDS };
      (thresholdRows || []).forEach((row) => {
        if (!row || !row.metric) return;
        thresholds[row.metric] = {
          warning_min: row.warning_min ?? null,
          warning_max: row.warning_max ?? null,
          critical_min: row.critical_min ?? null,
          critical_max: row.critical_max ?? null,
        };
      });

      const latest = {};
      const scopedSeries = series.filter(belongs);
      scopedSeries.forEach((m) => {
        if (!m.sensor_id) return;
        const current = latest[m.sensor_id];
        if (!current || new Date(m.measured_at) >= new Date(current.measured_at)) latest[m.sensor_id] = m;
      });

      const demoCount = scopedSeries.filter((m) => m.source !== 'real').length;

      setState({
        key,
        loading: false,
        error: null,
        building: selected,
        buildings: available,
        floors: floors.filter(belongs),
        rooms: rooms.filter(belongs),
        sensors: sensors.filter(belongs),
        thresholds,
        alerts: (alertPage.items || []).filter(belongs),
        series: scopedSeries,
        latest,
        counts: { demo: demoCount, real: scopedSeries.length - demoCount },
      });
    } catch (error) {
      if (current === sequence.current && !silent) setState(s => ({ ...s, loading: false, error: error.message || 'Daten konnten nicht geladen werden.' }));
    } finally {
      if (current === sequence.current) busy.current = false;
    }
  }, [requestedBuildingID, buildingIDs, key]);

  useEffect(() => {
    load();
    return () => { sequence.current += 1; busy.current = false; };
  }, [load]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const refresh = () => { if (!document.hidden) load({ silent: true }); };
    const timer = setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load, refreshMs]);

  return { ...(state.key === key ? state : EMPTY), reload: load };
}
