import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTime } from '@/lib/dates';
import { metric as metricDef } from '@/lib/metrics';

export default function RoomSeriesChart({ points = [], metricKey, thresholds }) {
  const def = metricDef(metricKey);
  const t = thresholds ? thresholds[metricKey] : null;
  const data = points.map((p) => ({ label: formatTime(p.measured_at), value: Number(p.value) }));
  const values = data.map((d) => d.value).filter((v) => !Number.isNaN(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.25, def.unit === 'ppm' ? 60 : 0.6);
  const domain = [Math.floor(min - pad), Math.ceil(max + pad)];

  return (
    <div className="h-[240px] w-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Für diese Messgröße liegen im Betrachtungszeitraum keine Messwerte vor.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={domain} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={54} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(value) => [`${value} ${def.unit}`, def.label]}
            />
            {t && t.warning_max !== null && t.warning_max !== undefined ? (
              <ReferenceLine y={t.warning_max} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Grenzwert', fontSize: 10, fill: '#b45309', position: 'insideTopRight' }} />
            ) : null}
            {t && t.warning_min !== null && t.warning_min !== undefined ? (
              <ReferenceLine y={t.warning_min} stroke="#f59e0b" strokeDasharray="4 4" />
            ) : null}
            {t && t.critical_max !== null && t.critical_max !== undefined ? (
              <ReferenceLine y={t.critical_max} stroke="#ef4444" strokeDasharray="4 4" />
            ) : null}
            <Line type="monotone" dataKey="value" stroke={def.color} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
