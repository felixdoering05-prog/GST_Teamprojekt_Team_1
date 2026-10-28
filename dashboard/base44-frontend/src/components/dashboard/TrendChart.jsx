import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SourceBadge from '@/components/SourceBadge';

export default function TrendChart({ data = [], demoShare = 0 }) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Verlauf der letzten 24 Stunden</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Stundenmittel über alle Sensoren des Gebäudes</p>
        </div>
        <SourceBadge source={demoShare > 0.5 ? 'demo' : 'real'} />
      </div>
      <div className="h-[280px] w-full px-2 py-4 sm:px-4">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Noch keine Messwerte im Betrachtungszeitraum.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e11d48" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="temp" domain={[15, 30]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
              <YAxis yAxisId="co2" orientation="right" domain={[300, 1700]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 12px 24px -16px rgba(15,23,42,0.35)' }}
                formatter={(value, name) => [name === 'Temperatur' ? `${value} °C` : `${value} ppm`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area yAxisId="temp" type="monotone" dataKey="temperature" name="Temperatur" stroke="#e11d48" strokeWidth={2} fill="url(#tempFill)" connectNulls />
              <Line yAxisId="co2" type="monotone" dataKey="co2" name="CO₂" stroke="#0891b2" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
