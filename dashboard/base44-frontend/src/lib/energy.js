export const ENERGY_MEDIA = {
  strom: ['Strom', 'kWh'],
  waerme: ['Wärme / Heizung', 'kWh'],
  warmwasser: ['Warmwasser', 'm³'],
  kaltwasser: ['Kaltwasser', 'm³'],
  wasser: ['Wasser gesamt', 'm³'],
  gas: ['Gas', 'kWh'],
  pv_erzeugung: ['PV-Erzeugung', 'kWh'],
  netzbezug: ['Netzbezug', 'kWh'],
  eigenverbrauch: ['Eigenverbrauch', 'kWh'],
  einspeisung: ['Einspeisung', 'kWh'],
  co2: ['CO₂', 'kg'],
};

export const energyKey = (value) => String(value || '').normalize('NFKC').trim().toLowerCase();

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const month = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', month: 'short', year: '2-digit' });

export const formatAmount = (value, unit) => Number.isFinite(value) ? `${number.format(value)} ${unit}`.trim() : 'Keine Daten';
export const formatCost = (value) => Number.isFinite(value) ? euro.format(value) : 'Keine Daten';
export const formatEnergyDate = (value) => value && Number.isFinite(Date.parse(value)) ? date.format(new Date(value)) : '–';
export const formatEnergyMonth = (value) => month.format(new Date(value + '-01T00:00:00Z'));

export function formatPeriod(start, end) {
  if (!start) return '–';
  const first = formatEnergyDate(start);
  const last = formatEnergyDate(end);
  return !end || first === last ? first : `${first} – ${last}`;
}

export function readingSource(row) {
  const methods = { manual: 'Manuell', csv: 'CSV-Import', building_pass: 'Gebäudepass in ChatGPT Sites' };
  const label = methods[row.capture_method] || (row.note === 'Importierter Ablesewert' ? 'CSV-Import' : 'Nala-Bestand');
  return row.source === 'demo' ? `${label} · Demo` : label;
}
