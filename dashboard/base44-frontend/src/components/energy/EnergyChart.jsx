import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAmount, formatEnergyMonth } from '@/lib/energy';

const axisNumber = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

function chartRows(series, range) {
  const rows = new Map();
  if (range) {
    const month = new Date(range.from);
    while (month.toISOString().slice(0, 10) <= range.to) {
      const key = month.toISOString().slice(0, 7);
      rows.set(key, { month: key });
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
  for (const [index, item] of series.entries()) {
    for (const point of item.points) {
      if (!rows.has(point.month)) rows.set(point.month, { month: point.month });
      rows.get(point.month)[index] = point.value;
    }
  }
  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export default function EnergyChart({ series, range, compact = false, legend = false }) {
  const visible = series.filter((item) => item.points.some((point) => Number.isFinite(point.value)));
  if (!visible.length) return compact ? null : <p className="energy-chart-empty">Für diesen Zeitraum liegen keine Verbrauchswerte vor.</p>;
  const { unit } = visible[0];

  return (
    <>
      {legend && visible.length > 1 && <ul className="energy-legend mt-3">
        {visible.map((item) => <li key={item.label}><span style={{ background: item.color }} />{item.label}</li>)}
      </ul>}
      <div className={compact ? 'mt-3 h-16 min-w-0' : 'energy-chart'} role={compact ? 'img' : 'region'} aria-label={`Monatlicher ${unit === '€' ? 'Kostenverlauf' : 'Verbrauch'} in ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartRows(visible, range)} accessibilityLayer={!compact} barCategoryGap="24%"
          margin={compact ? { top: 3, right: 0, bottom: 0, left: 0 } : { top: 12, right: 8, bottom: 0, left: 0 }}>
          {!compact && <CartesianGrid stroke="hsl(var(--border) / 0.6)" vertical={false} />}
          <XAxis dataKey="month" tickFormatter={formatEnergyMonth} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false} minTickGap={16} tickMargin={9} hide={compact} />
          <YAxis tickFormatter={(value) => axisNumber.format(value)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false} tickLine={false} width={39} tickCount={5} hide={compact} />
          {!compact && <Tooltip labelFormatter={formatEnergyMonth} formatter={(value, name) => [formatAmount(value, unit), name]}
            cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} contentStyle={{
              backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))',
              border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '0.8rem',
            }} />}
          {visible.map((item, index) => (
            <Bar key={item.label || item.unit} name={item.label || 'Verbrauch'} dataKey={String(index)} fill={item.color || 'var(--energy-chart, hsl(var(--primary)))'}
              radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
    </>
  );
}
