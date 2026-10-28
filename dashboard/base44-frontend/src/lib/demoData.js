// Beispieldaten für den ersten Bildschirmaufbau.
// ACHTUNG: Diese Werte sind ausdrücklich als Demo gekennzeichnet und keine echten Messwerte.
// Ab der Anbindung an die Datenbank werden sie durch gespeicherte Datensätze ersetzt.

export const DEMO_NOTICE = 'Demo-Daten – keine echten Messwerte';

export const DEMO_BUILDING = {
  name: 'D21',
  label: 'Gebäude D21',
  site: 'Hochschule Darmstadt',
  address: 'Adresse noch nicht hinterlegt',
  floors: 3,
  area_m2: 1840,
};

export const DEMO_ROOMS = [
  { id: 'r1', room_code: 'EG.01', name: 'Foyer', usage: 'Verkehrsfläche', floor: 'EG', area_m2: 96, metrics: { temperature: 21.4, co2: 520, humidity: 44 } },
  { id: 'r2', room_code: 'EG.02', name: 'Seminarraum E1', usage: 'Seminarraum', floor: 'EG', area_m2: 78, metrics: { temperature: 24.9, co2: 1180, humidity: 57 } },
  { id: 'r3', room_code: 'EG.03', name: 'Technikzentrale', usage: 'Technik', floor: 'EG', area_m2: 32, metrics: { temperature: 27.8, co2: 640, humidity: 38 } },
  { id: 'r4', room_code: 'EG.04', name: 'Büro Projektteam', usage: 'Büro', floor: 'EG', area_m2: 41, metrics: { temperature: 22.6, co2: 880, humidity: 46 } },
  { id: 'r5', room_code: '1.01', name: 'Seminarraum 1.1', usage: 'Seminarraum', floor: '1. OG', area_m2: 62, metrics: { temperature: 23.1, co2: 1420, humidity: 52 } },
  { id: 'r6', room_code: '1.02', name: 'Labor KI', usage: 'Labor', floor: '1. OG', area_m2: 68, metrics: { temperature: 22.2, co2: 610, humidity: 43 } },
  { id: 'r7', room_code: '1.03', name: 'Besprechung 1.2', usage: 'Besprechung', floor: '1. OG', area_m2: 28, metrics: { temperature: 23.8, co2: 990, humidity: 49 } },
  { id: 'r8', room_code: '1.04', name: 'Büro Gebäudetechnik', usage: 'Büro', floor: '1. OG', area_m2: 38, metrics: { temperature: 21.9, co2: 720, humidity: 45 } },
  { id: 'r9', room_code: '2.01', name: 'Seminarraum 2.1', usage: 'Seminarraum', floor: '2. OG', area_m2: 60, metrics: { temperature: 24.2, co2: 1050, humidity: 51 } },
  { id: 'r10', room_code: '2.02', name: 'Labor Sensorik', usage: 'Labor', floor: '2. OG', area_m2: 54, metrics: { temperature: 18.6, co2: 480, humidity: 41 } },
  { id: 'r11', room_code: '2.03', name: 'Büro Digital Twin', usage: 'Büro', floor: '2. OG', area_m2: 36, metrics: { temperature: 22.4, co2: 760, humidity: 47 } },
  { id: 'r12', room_code: '2.04', name: 'Lager Ersatzteile', usage: 'Lager', floor: '2. OG', area_m2: 24, metrics: { temperature: 17.9, co2: 450, humidity: 61 } },
];

export const DEMO_ALERTS = [
  { id: 'a1', severity: 'critical', metric: 'co2', room: '1.01 Seminarraum 1.1', message: 'CO₂ über kritischem Grenzwert (1.420 ppm)', time: 'heute, 08:45', status: 'offen' },
  { id: 'a2', severity: 'warning', metric: 'temperature', room: 'EG.03 Technikzentrale', message: 'Temperatur über Grenzwert (27,8 °C)', time: 'heute, 08:10', status: 'offen' },
  { id: 'a3', severity: 'warning', metric: 'co2', room: 'EG.02 Seminarraum E1', message: 'CO₂ über Grenzwert (1.180 ppm)', time: 'heute, 07:55', status: 'offen' },
  { id: 'a4', severity: 'warning', metric: 'humidity', room: '2.04 Lager Ersatzteile', message: 'Luftfeuchte über Grenzwert (61 %)', time: 'gestern, 18:20', status: 'quittiert' },
  { id: 'a5', severity: 'warning', metric: 'temperature', room: '2.02 Labor Sensorik', message: 'Temperatur unter Grenzwert (18,6 °C)', time: 'gestern, 16:05', status: 'quittiert' },
];

export const DEMO_SENSOR_COUNT = 36;

function buildSeries() {
  const out = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  for (let i = 23; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const h = d.getHours();
    const occupancy = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
    out.push({
      time: `${String(h).padStart(2, '0')}:00`,
      temperature: Number((20.4 + occupancy * 3.2 + (h % 3) * 0.1).toFixed(1)),
      co2: Math.round(430 + occupancy * 760 + (h % 4) * 20),
      humidity: Number((43 + occupancy * 8 - (h % 5) * 0.5).toFixed(1)),
    });
  }
  return out;
}

export const DEMO_SERIES = buildSeries();
