import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAmount, formatEnergyMonth } from '@/lib/energy';

export default function EnergyChart({ points, unit, compact = false }) {
  if (!points.length) return compact ? null : <p className="py-12 text-center text-sm text-muted-foreground">Für diesen Zeitraum liegen keine Verbrauchswerte vor.</p>;
  return (
    <div className={compact ? 'mt-3 h-16 min-w-0' : 'mt-4 h-64 min-w-0'} role="img" aria-label={`Monatlicher Verbrauch in ${unit}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={compact ? { top: 5, right: 6, bottom: 4, left: 6 } : { top: 8, right: 12, bottom: 4, left: 4 }}>
          {!compact && <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />}
          <XAxis dataKey="month" tickFormatter={formatEnergyMonth} tick={{ fontSize: 11 }} tickLine={false} hide={compact} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} hide={compact} />
          <Tooltip labelFormatter={formatEnergyMonth} formatter={(value) => [formatAmount(value, unit), 'Verbrauch']} />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={52} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
