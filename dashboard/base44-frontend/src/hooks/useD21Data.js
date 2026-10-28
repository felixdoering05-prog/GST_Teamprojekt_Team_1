import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
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
export default function useD21Data() {
  const [state, setState] = useState(EMPTY);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const since = new Date(Date.now() - SERIES_HOURS * HOUR).toISOString();

      const [buildings, floors, rooms, sensors, thresholdRows, alertPage] = await Promise.all([
        base44.entities.Building.list('-created_date', 500),
        base44.entities.Floor.list('level', 100),
        base44.entities.Room.list('room_code', 500),
        base44.entities.Sensor.list('sensor_code', 500),
        base44.entities.ThresholdConfig.list('metric', 20),
        base44.entities.Alert.filter({ status: { $ne: 'erledigt' } }, { sort: '-triggered_at', limit: 200 }),
      ]);

      const series = [];
      let cursor;
      let pages = 0;
      let hasMore = true;
      while (hasMore && pages < MAX_PAGES) {
        const options = { sort: 'measured_at', limit: PAGE_SIZE };
        if (cursor) options.cursor = cursor;
        const page = await base44.entities.Measurement.filter({ measured_at: { $gte: since } }, options);
        series.push(...(page.items || []));
        hasMore = Boolean(page.has_more);
        cursor = page.next_cursor;
        pages += 1;
      }

      const selected = buildings.find(b => b.id === localStorage.getItem('d21-selected-building')) || buildings[0] || null;
      const belongs = row => row.building_id === selected?.id;
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
      series.filter(belongs).forEach((m) => {
        if (!m.sensor_id) return;
        const current = latest[m.sensor_id];
        if (!current || new Date(m.measured_at) >= new Date(current.measured_at)) latest[m.sensor_id] = m;
      });

      const scopedSeries = series.filter(belongs);
      const demoCount = scopedSeries.filter((m) => m.source !== 'real').length;

      setState({
        loading: false,
        error: null,
        building: selected,
        buildings,
        floors: floors.filter(belongs),
        rooms: rooms.filter(belongs),
        sensors: sensors.filter(belongs),
        thresholds,
        alerts: (alertPage.items || []).filter(belongs),
        series: series.filter(belongs),
        latest,
        counts: { demo: demoCount, real: scopedSeries.length - demoCount },
      });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: error.message || 'Daten konnten nicht geladen werden.' }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
