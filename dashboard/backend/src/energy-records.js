const MEDIUMS = {
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

const DAY = 86400000;
const berlinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const textKey = (value) => (value || '').normalize('NFKC').trim().toLowerCase();
const iso = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function dayOf(value) {
  const timestamp = iso(value);
  if (!timestamp) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return timestamp.slice(0, 10) === value ? value : null;
  return berlinDate.format(new Date(timestamp));
}

function quantityUnit(reading) {
  const raw = reading.unit?.trim() || MEDIUMS[reading.medium]?.[1] || '';
  const units = { wh: ['kWh', 0.001], kwh: ['kWh', 1], mwh: ['kWh', 1000], m3: ['m³', 1], l: ['m³', 0.001], liter: ['m³', 0.001] };
  return units[textKey(raw).replace(/\^/g, '')] || [raw, 1];
}

function normalizeReading(reading) {
  const [unit, factor] = quantityUnit(reading);
  const convert = (value) => Number.isFinite(value) ? Number((value * factor).toPrecision(14)) : null;
  return { ...reading, unit, value: convert(reading.value), meter_reading: convert(reading.meter_reading) };
}

const unitKey = (row) => row.unit_id || textKey(row.unit_name);

function readingIdentity(row) {
  const common = [row.building_id || '', unitKey(row), row.medium, row.source];
  const r = normalizeReading(row);
  const dates = r.period_start || r.period_end ? [iso(r.period_start), iso(r.period_end)] : [dayOf(r.reading_date)];
  return JSON.stringify([...common, textKey(r.meter_code), r.unit, ...dates]);
}

function recordKey(row) {
  return JSON.stringify([readingIdentity(row), normalizeReading(row).value]);
}

function comparableReadings(a, b) {
  return ['meter_reading', 'cost_eur', 'reading_date'].every((field) =>
    a[field] == null || b[field] == null || a[field] === b[field]);
}

function uniqueReadings(rows) {
  const groups = new Map();
  for (const raw of rows) {
    const row = normalizeReading(raw);
    const key = recordKey(row);
    if (!groups.has(key)) groups.set(key, []);
    const group = groups.get(key);
    const duplicate = group.find((other) => comparableReadings(other, row));
    if (duplicate) {
      for (const [field, value] of Object.entries(row)) if (duplicate[field] == null) duplicate[field] = value;
    } else group.push(row);
  }
  return [...groups.values()].flat();
}

module.exports = { DAY, MEDIUMS, dayOf, normalizeReading, readingIdentity, recordKey, comparableReadings, uniqueReadings, unitKey };
