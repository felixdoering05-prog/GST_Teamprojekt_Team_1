import { METRIC_KEYS, evaluateValue, metric as metricDef, formatValue, worstLevel } from '@/lib/metrics';

// Regelbasierte Auswertung als Vorstufe zur KI-Anbindung.
// Es werden ausschließlich hinterlegte Grenzwerte und Verläufe der Messreihen
// verwendet – es finden keine KI-Schätzungen oder erfundenen Prognosen statt.

const TREND_LIMIT = { temperature: 0.4, co2: 90, humidity: 2.5 };

export const TREND_LABELS = {
  steigend: 'steigender Trend',
  fallend: 'fallender Trend',
  stabil: 'stabiler Verlauf',
  unbekannt: 'zu wenige Messwerte',
};

function breachDirection(metricKey, value, thresholds) {
  const t = thresholds ? thresholds[metricKey] : null;
  if (!t || value === null || value === undefined) return null;
  const v = Number(value);
  const has = (x) => x !== null && x !== undefined;
  if ((has(t.critical_max) && v > t.critical_max) || (has(t.warning_max) && v > t.warning_max)) return 'max';
  if ((has(t.critical_min) && v < t.critical_min) || (has(t.warning_min) && v < t.warning_min)) return 'min';
  return null;
}

/** Lineare Regression über die Messreihe; Steigung pro Stunde. */
export function trendFor(metricKey, points = []) {
  if (!points || points.length < 4) {
    return { direction: 'unbekannt', slope: 0, label: TREND_LABELS.unbekannt, count: points ? points.length : 0 };
  }
  const hours = points.map((p) => new Date(p.measured_at).getTime() / 3600000);
  const values = points.map((p) => Number(p.value));
  const meanH = hours.reduce((a, b) => a + b, 0) / hours.length;
  const meanV = values.reduce((a, b) => a + b, 0) / values.length;
  let num = 0;
  let den = 0;
  hours.forEach((h, i) => {
    num += (h - meanH) * (values[i] - meanV);
    den += (h - meanH) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const limit = TREND_LIMIT[metricKey] ?? 1;
  const direction = slope > limit ? 'steigend' : slope < -limit ? 'fallend' : 'stabil';
  return { direction, slope, label: TREND_LABELS[direction], count: points.length, limit };
}

/** Mögliche technische Ursachen – rein regelbasiert aus Grenzwertlage und Trend. */
export function possibleCauses(metricKey, context) {
  const { level, direction, levels } = context;
  const otherTemp = levels.temperature;
  const otherCo2 = levels.co2;
  const causes = [];

  if (level === 'critical') {
    causes.push('Kritische Überschreitung – Messwert und Anlagenzustand unmittelbar prüfen.');
  }

  if (metricKey === 'temperature') {
    if (direction === 'max') {
      if (otherCo2 && otherCo2 !== 'ok') {
        causes.push('Hohe Personenbelegung bei unzureichendem Luftwechsel (Wärme- und CO₂-Eintrag).');
      } else {
        causes.push('Innerer Wärmeeintrag durch Geräte, Beleuchtung oder Sonneneinstrahlung.');
        causes.push('Regelung von Heizung/Kühlung oder Lüftung im betroffenen Strang prüfen.');
      }
    } else if (direction === 'min') {
      causes.push('Heizungsregelung, Nacht-/Wochenendabsenkung oder geschlossene Ventile.');
      causes.push('Sensorposition prüfen (Nähe zu Außenwand, Fenster oder Kältebrücke).');
    }
  }

  if (metricKey === 'co2') {
    if (direction === 'max') {
      causes.push('Zu geringer Luftwechsel: Fensterlüftung oder RLT-Anlage prüfen.');
      if (otherTemp && otherTemp !== 'ok') {
        causes.push('Hohe Personendichte im Raum bei gleichzeitig erhöhter Temperatur.');
      }
      causes.push('Raumnutzung und Belegungsplan gegen die Messreihe abgleichen.');
    }
  }

  if (metricKey === 'humidity') {
    if (direction === 'max') {
      causes.push('Feuchteeintrag durch Personen, Reinigung oder Bauteilfeuchte prüfen.');
      if (otherTemp === 'ok') {
        causes.push('Lüftungsverhalten prüfen – kurzzeitiges Querlüften senkt die Luftfeuchte.');
      } else if (otherTemp && otherTemp !== 'ok') {
        causes.push('Feuchte bei abweichender Temperatur – Lüftungs- und Heizverhalten gemeinsam prüfen.');
      }
    } else if (direction === 'min') {
      causes.push('Sehr trockene Luft – erhöhte Lüftung oder Beheizung im Winterfall prüfen.');
    }
  }

  if (direction === 'steigend') {
    causes.push('Anhaltender Anstieg: Verlauf der letzten Stunden deutet auf eine anhaltende Last hin.');
  }
  if (direction === 'unbekannt') {
    causes.push('Für eine belastbare Ursachenzuordnung fehlen Messwerte im Betrachtungszeitraum.');
  }

  return causes;
}

export function recommendation(metricKey, level) {
  const label = metricDef(metricKey).label;
  if (level === 'critical') return `Sofortmaßnahme: ${label} prüfen und Gegenmaßnahme dokumentieren.`;
  if (level === 'warning') {
    if (metricKey === 'co2') return 'Lüftungsintervall verkürzen bzw. Anlagenbetrieb kontrollieren.';
    if (metricKey === 'temperature') return 'Sollwerte und Regelungseinstellung der Anlage kontrollieren.';
    return 'Lüftungsverhalten und Feuchtequelle kontrollieren.';
  }
  return 'Kein Handlungsbedarf – Wert liegt im Sollbereich.';
}

/**
 * Auswertung je Raum: Grenzwertlage, Trend und mögliche Ursachen
 * für Temperatur, CO₂ und Luftfeuchte.
 */
export function analyseRoom({ room, roomSensors, series, thresholds }) {
  const findings = METRIC_KEYS.map((metricKey) => {
    const sensorIds = roomSensors.filter((s) => s.metric === metricKey).map((s) => s.id);
    const points = series
      .filter((m) => sensorIds.includes(m.sensor_id))
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
    const latest = points.length ? points[points.length - 1] : null;
    const evaluation = latest ? evaluateValue(metricKey, latest.value, thresholds) : { level: 'unknown', reason: 'Kein Messwert vorhanden' };
    const trend = trendFor(metricKey, points);
    const realCount = points.filter((p) => p.source === 'real').length;
    return {
      metric: metricKey,
      label: metricDef(metricKey).label,
      latest,
      points,
      level: evaluation.level,
      reason: evaluation.reason,
      trend,
      source: points.length === 0 ? 'unknown' : realCount > points.length / 2 ? 'real' : 'demo',
      valueLabel: latest ? formatValue(metricKey, latest.value) : '–',
    };
  });

  const levels = {};
  findings.forEach((f) => { levels[f.metric] = f.level; });

  const enriched = findings.map((f) => ({
    ...f,
    causes:
      f.level === 'ok' && f.trend.direction === 'stabil'
        ? []
        : possibleCauses(f.metric, {
            level: f.level,
            direction: f.level === 'ok' ? null : breachDirection(f.metric, f.latest ? f.latest.value : null, thresholds),
            levels,
          }),
    recommendation: recommendation(f.metric, f.level),
  }));

  const status = worstLevel(findings.map((f) => f.level));
  return { room, findings: enriched, status };
}

export function analysisSummary(results = []) {
  const critical = results.filter((r) => r.status === 'critical').length;
  const warning = results.filter((r) => r.status === 'warning').length;
  const trends = results.flatMap((r) => r.findings.filter((f) => f.trend.direction === 'steigend' || f.trend.direction === 'fallend'));
  const causes = [...new Set(results.flatMap((r) => r.findings.flatMap((f) => f.causes)))];
  return { critical, warning, ok: results.length - critical - warning, trends: trends.length, causes };
}
