// Demo-Datensatz für das Projekt „D21 Digital Twin“.
// Alle Werte sind simuliert und werden über das Feld `source: "demo"` eindeutig
// von echten Messwerten getrennt.

const DEMO_BUILDING = {
  name: 'D21',
  code: 'D21',
  site: 'Hochschule Darmstadt',
  address: 'Adresse noch nicht hinterlegt',
  gross_area_m2: 1840,
  floors_count: 3,
  usage_type: 'Hochschulgebäude (Lehre, Labor, Büro)',
  description:
    'Demo-Datensatz für das Teamprojekt „KI trifft Gebäude: Sensordaten in Revit, ausgewertet mit künstlicher Intelligenz“. Alle Messwerte sind simuliert.',
  bim_model_ref: '',
  bim_status: 'vorbereitet',
};

const DEMO_FLOORS = [
  { name: 'EG', level: 0, area_m2: 620, height_m: 3.4 },
  { name: '1. OG', level: 1, area_m2: 610, height_m: 3.2 },
  { name: '2. OG', level: 2, area_m2: 610, height_m: 3.2 },
];

// profile: [Grundwert, Tagesamplitude, Streuung] je Messgröße
const DEMO_ROOMS = [
  { room_code: 'EG.01', name: 'Foyer', usage: 'Verkehrsfläche', area_m2: 96, floor: 'EG', revit_room_id: 'R-EG-01', occupants_max: 30, profile: { temperature: [21.4, 1.2, 0.3], co2: [520, 260, 25], humidity: [44, 4, 1.0] } },
  { room_code: 'EG.02', name: 'Seminarraum E1', usage: 'Seminarraum', area_m2: 78, floor: 'EG', revit_room_id: 'R-EG-02', occupants_max: 40, profile: { temperature: [23.0, 3.0, 0.4], co2: [540, 1100, 60], humidity: [47, 10, 1.5] } },
  { room_code: 'EG.03', name: 'Technikzentrale', usage: 'Technik', area_m2: 32, floor: 'EG', revit_room_id: 'R-EG-03', occupants_max: 4, profile: { temperature: [26.8, 1.6, 0.5], co2: [640, 40, 15], humidity: [38, 2, 0.8] } },
  { room_code: 'EG.04', name: 'Büro Projektteam', usage: 'Büro', area_m2: 41, floor: 'EG', revit_room_id: 'R-EG-04', occupants_max: 8, profile: { temperature: [22.0, 1.6, 0.3], co2: [500, 560, 35], humidity: [45, 4, 1.0] } },
  { room_code: '1.01', name: 'Seminarraum 1.1', usage: 'Seminarraum', area_m2: 62, floor: '1. OG', revit_room_id: 'R-1OG-01', occupants_max: 30, profile: { temperature: [22.8, 2.4, 0.4], co2: [520, 1300, 70], humidity: [47, 8, 1.4] } },
  { room_code: '1.02', name: 'Labor KI', usage: 'Labor', area_m2: 68, floor: '1. OG', revit_room_id: 'R-1OG-02', occupants_max: 16, profile: { temperature: [22.0, 1.2, 0.3], co2: [500, 260, 25], humidity: [43, 3, 0.9] } },
  { room_code: '1.03', name: 'Besprechung 1.2', usage: 'Besprechung', area_m2: 28, floor: '1. OG', revit_room_id: 'R-1OG-03', occupants_max: 12, profile: { temperature: [23.0, 1.8, 0.4], co2: [520, 800, 50], humidity: [46, 6, 1.2] } },
  { room_code: '1.04', name: 'Büro Gebäudetechnik', usage: 'Büro', area_m2: 38, floor: '1. OG', revit_room_id: 'R-1OG-04', occupants_max: 6, profile: { temperature: [21.8, 1.4, 0.3], co2: [480, 400, 30], humidity: [45, 3, 1.0] } },
  { room_code: '2.01', name: 'Seminarraum 2.1', usage: 'Seminarraum', area_m2: 60, floor: '2. OG', revit_room_id: 'R-2OG-01', occupants_max: 30, profile: { temperature: [23.4, 2.2, 0.4], co2: [540, 950, 55], humidity: [47, 7, 1.3] } },
  { room_code: '2.02', name: 'Labor Sensorik', usage: 'Labor', area_m2: 54, floor: '2. OG', revit_room_id: 'R-2OG-02', occupants_max: 10, profile: { temperature: [18.4, 0.6, 0.3], co2: [470, 120, 20], humidity: [41, 2, 0.9] } },
  { room_code: '2.03', name: 'Büro Digital Twin', usage: 'Büro', area_m2: 36, floor: '2. OG', revit_room_id: 'R-2OG-03', occupants_max: 6, profile: { temperature: [22.2, 1.5, 0.3], co2: [490, 480, 35], humidity: [46, 4, 1.0] } },
  { room_code: '2.04', name: 'Lager Ersatzteile', usage: 'Lager', area_m2: 24, floor: '2. OG', revit_room_id: 'R-2OG-04', occupants_max: 2, profile: { temperature: [17.8, 0.8, 0.3], co2: [450, 60, 15], humidity: [58, 5, 1.2] } },
];

const METRIC_SUFFIX = { temperature: 'T', co2: 'CO2', humidity: 'RH' };

const DEMO_ENERGY_METERS = [
  { meter_code: 'STROM-HAUS', medium: 'strom', unit: 'kWh', base: 486, spread: 62 },
  { meter_code: 'WAERME-HZ', medium: 'waerme', unit: 'kWh', base: 318, spread: 74 },
  { meter_code: 'KALTWASSER', medium: 'kaltwasser', unit: 'm³', base: 4.2, spread: 1.1 },
];

function noise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function round(value, metric) {
  if (metric === 'co2') return Math.round(value);
  return Math.round(value * 10) / 10;
}

/** Simulierte Stundenwerte der letzten 24 Stunden für einen Sensor. */
function demoMeasurementSeries({ profile, metric, index, now }) {
  const cfg = profile[metric];
  if (!cfg) return [];
  const end = new Date(now.getTime());
  end.setMinutes(0, 0, 0);
  const out = [];
  for (let i = 23; i >= 0; i -= 1) {
    const ts = new Date(end.getTime() - i * 3600 * 1000);
    const hour = ts.getHours();
    const occupancy = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const jitter = (noise(index * 31 + i * 7 + metric.length) - 0.5) * 2;
    out.push({
      metric,
      value: round(cfg[0] + occupancy * cfg[1] + jitter * cfg[2], metric),
      measured_at: ts.toISOString(),
      quality: 'ok',
    });
  }
  return out;
}

/** Simulierte Tageswerte der letzten 30 Tage je Zähler. */
function buildDemoEnergyReadings(now) {
  const out = [];
  const today = new Date(now.getTime());
  today.setHours(0, 0, 0, 0);
  DEMO_ENERGY_METERS.forEach((meter, meterIndex) => {
    for (let day = 29; day >= 0; day -= 1) {
      const start = new Date(today.getTime() - day * 24 * 3600 * 1000);
      const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1000);
      const jitter = (noise(meterIndex * 17 + day * 3 + 5) - 0.5) * 2;
      const weekdayFactor = start.getDay() === 0 || start.getDay() === 6 ? 0.62 : 1;
      const value = meter.base * weekdayFactor + jitter * meter.spread;
      out.push({
        meter_code: meter.meter_code,
        medium: meter.medium,
        unit: meter.unit,
        value: Math.round(value * 10) / 10,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        note: 'Simulierter Tageswert (Demo-Datensatz)',
      });
    }
  });
  return out;
}
module.exports={DEMO_BUILDING,DEMO_FLOORS,DEMO_ROOMS,METRIC_SUFFIX,DEMO_ENERGY_METERS,demoMeasurementSeries,buildDemoEnergyReadings};
