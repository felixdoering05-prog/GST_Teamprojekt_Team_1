// Zentrale Definition der Messgrößen, Grenzwerte und Bewertungslogik.
// Alle Ansichten der App nutzen dieselben Definitionen.

export const METRIC_KEYS = ['temperature', 'co2', 'humidity'];

export const METRICS = {
  temperature: {
    key: 'temperature',
    label: 'Temperatur',
    short: 'Temp.',
    unit: '°C',
    decimals: 1,
    icon: 'Thermometer',
    color: '#e11d48',
  },
  co2: {
    key: 'co2',
    label: 'CO₂',
    short: 'CO₂',
    unit: 'ppm',
    decimals: 0,
    icon: 'Wind',
    color: '#0891b2',
  },
  humidity: {
    key: 'humidity',
    label: 'Luftfeuchte',
    short: 'Feuchte',
    unit: '%',
    decimals: 0,
    icon: 'Droplets',
    color: '#7c3aed',
  },
};

// Vorbelegte Grenzwerte (Komfortbereich). Können unter „Daten & Einstellungen“ geändert werden.
export const DEFAULT_THRESHOLDS = {
  temperature: { warning_min: 19, warning_max: 26, critical_min: 16, critical_max: 28 },
  co2: { warning_min: null, warning_max: 1000, critical_min: null, critical_max: 1500 },
  humidity: { warning_min: 30, warning_max: 60, critical_min: 25, critical_max: 70 },
};

export const LEVELS = {
  ok: { key: 'ok', label: 'Im Sollbereich', tone: 'ok', order: 0 },
  warning: { key: 'warning', label: 'Warnung', tone: 'warn', order: 1 },
  critical: { key: 'critical', label: 'Kritisch', tone: 'crit', order: 2 },
  unknown: { key: 'unknown', label: 'Keine Daten', tone: 'muted', order: 3 },
};

export function metric(key) {
  return METRICS[key] || { key, label: key, short: key, unit: '', decimals: 1 };
}

/**
 * Bewertet einen einzelnen Messwert anhand der Grenzwerte.
 * Rein regelbasiert – keine KI-Schätzung, keine erfundenen Werte.
 */
export function evaluateValue(key, value, thresholds = DEFAULT_THRESHOLDS) {
  const t = thresholds?.[key] || DEFAULT_THRESHOLDS[key];
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return { level: 'unknown', reason: 'Kein Messwert vorhanden' };
  }
  const v = Number(value);
  if (!t) return { level: 'ok', reason: 'Keine Grenzwerte definiert' };

  const below = (limit) => limit !== null && limit !== undefined;
  if (below(t.critical_max) && v > t.critical_max) {
    return { level: 'critical', reason: `${formatValue(key, v)} über kritischem Grenzwert ${formatValue(key, t.critical_max)}` };
  }
  if (below(t.critical_min) && v < t.critical_min) {
    return { level: 'critical', reason: `${formatValue(key, v)} unter kritischem Grenzwert ${formatValue(key, t.critical_min)}` };
  }
  if (below(t.warning_max) && v > t.warning_max) {
    return { level: 'warning', reason: `${formatValue(key, v)} über Grenzwert ${formatValue(key, t.warning_max)}` };
  }
  if (below(t.warning_min) && v < t.warning_min) {
    return { level: 'warning', reason: `${formatValue(key, v)} unter Grenzwert ${formatValue(key, t.warning_min)}` };
  }
  return { level: 'ok', reason: 'Innerhalb der definierten Grenzwerte' };
}

export function worstLevel(levels = []) {
  const valid = levels.filter(Boolean).map((l) => LEVELS[l]?.order ?? 3);
  if (!valid.length) return 'unknown';
  const max = Math.max(...valid);
  return Object.keys(LEVELS).find((k) => LEVELS[k].order === max) || 'unknown';
}

export function formatValue(key, value) {
  const m = metric(key);
  if (value === null || value === undefined || value === '') return '–';
  const num = Number(value);
  if (Number.isNaN(num)) return '–';
  return `${num.toLocaleString('de-DE', {
    minimumFractionDigits: m.decimals,
    maximumFractionDigits: m.decimals,
  })} ${m.unit}`;
}

export function formatNumber(key, value) {
  const m = metric(key);
  if (value === null || value === undefined || value === '') return '–';
  const num = Number(value);
  if (Number.isNaN(num)) return '–';
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: m.decimals,
    maximumFractionDigits: m.decimals,
  });
}
