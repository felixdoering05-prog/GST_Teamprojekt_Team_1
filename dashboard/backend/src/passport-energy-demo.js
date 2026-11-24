// ChatGPT Sites, „Gebäudepass App Sancak & Häberlein“, Veröffentlichung 6.
// Monatsreihe und Gebäudekennzahlen aus dem Energiecontrolling, Wohnungswerte aus residential_units.
const reference = require('./passport-energy-demo.json');

function monthlyReading(month, medium, amount, unit, scope) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    ...scope, medium, unit, value: amount, source: 'demo', capture_method: 'building_pass',
    period_start: `${month}-01`, period_end: `${month}-${lastDay}`,
  };
}

async function seedPassportEnergy({ entities }) {
  const { building, reference_month: month, unit } = reference;
  const existing = await entities.Building.filter({ code: building.code, source: 'demo' }, { limit: 1 });
  const target = existing.items[0] || await entities.Building.create({ ...building, source: 'demo' });
  const site = { building_id: target.id, meter_level: 'main' };
  const apartment = { building_id: target.id, meter_level: 'sub', unit_id: unit.id, unit_name: unit.name };
  const readings = await entities.EnergyReading.bulkCreate([
    ...reference.electricity_mwh.map(([period, value]) => monthlyReading(period, 'strom', value * 1000, 'kWh', site)),
    ...reference.metrics.filter((metric) => metric.medium).map((metric) =>
      monthlyReading(month, metric.medium, metric.value * 1000, metric.unit === 't' ? 'kg' : 'kWh', site)),
    monthlyReading(month, 'strom', unit.electricity_kwh, 'kWh', apartment),
    monthlyReading(month, 'waerme', unit.heat_kwh, 'kWh', apartment),
    monthlyReading(month, 'wasser', unit.water_liters / 1000, 'm³', apartment),
  ]);
  return { building_id: target.id, reference_month: month, readings_created: readings.filter((row) => !row.duplicate).length };
}

module.exports = { reference, seedPassportEnergy };
