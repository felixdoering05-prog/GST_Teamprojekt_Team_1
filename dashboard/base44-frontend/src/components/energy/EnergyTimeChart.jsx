import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAmount, formatEnergyDate } from '@/lib/energy';

const halfHour = 30 * 60000;
const dayMs = 24 * 60 * 60000;
const clock = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const axis = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const colors = ['#51853e', '#b76a31', '#377eab', '#8868b1'];

export default function EnergyTimeChart({ series, unit, daily = false, bars = false, reserve }) {
  const populated = series.filter((item) => item.points?.length);
  if (!populated.length) return <p className="energy-chart-empty">Für diesen Zeitraum liegen keine Messwerte vor.</p>;

  const step = daily ? dayMs : halfHour;
  const timeline = new Map();
  populated.forEach((item, index) => {
    item.points.forEach((point) => {
      const time = Date.parse(daily ? point.day : point.time);
      if (!timeline.has(time)) timeline.set(time, { time });
      timeline.get(time)['series' + index] = Number(point.value);
    });
  });
  const dates = [...timeline.keys()];
  const rows = [];
  for (let time = Math.min(...dates); time <= Math.max(...dates); time += step) rows.push(timeline.get(time) || { time });
  const date = (value) => daily ? formatEnergyDate(new Date(Number(value)).toISOString()) : clock.format(Number(value));
  const Chart = bars ? BarChart : LineChart;
  const domain = unit === '%' ? [0, 100] : bars ? [(minimum) => Math.min(0, minimum), (maximum) => Math.max(0, maximum)] : ['auto', 'auto'];
  return (
    <>
      {populated.length > 1 && <ul className="energy-legend mt-3">
        {populated.map((item, index) => <li key={item.label}><span style={{ background: colors[index % colors.length] }} />{item.label}</li>)}
      </ul>}
      <div className="energy-chart" role="region" aria-label={`${daily ? 'Tageswerte' : 'Tageskurve'} in ${unit}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={rows} accessibilityLayer margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.6)" vertical={false} />
            <XAxis dataKey="time" tickFormatter={date} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={22} tickLine={false} axisLine={false} />
            <YAxis domain={domain} width={40} tickFormatter={(value) => axis.format(value)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
            <Tooltip labelFormatter={date} formatter={(value, label) => [formatAmount(value, unit), label]}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} />
            {reserve != null && <ReferenceLine y={reserve} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />}
            {populated.map((item, index) => {
              const key = 'series' + index;
              const color = colors[index % colors.length];
              return bars ? <Bar key={key} name={item.label} dataKey={key} fill={color} maxBarSize={38} isAnimationActive={false}>
                {rows.map((row) => <Cell key={row.time} fill={row[key] < 0 ? '#377eab' : color} />)}
              </Bar> : <Line key={key} name={item.label} dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 2.3, strokeWidth: 1 }} isAnimationActive={false} />;
            })}
          </Chart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
