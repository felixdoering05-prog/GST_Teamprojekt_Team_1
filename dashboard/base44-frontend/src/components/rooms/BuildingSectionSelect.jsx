import { SelectField } from '@/components/Field';

export default function BuildingSectionSelect({ selection }) {
  const { building, buildings, choose } = selection;
  if (!buildings.length) return <p className="text-sm text-muted-foreground">In dieser Auswahl ist kein Gebäude verfügbar.</p>;
  return <div className="max-w-sm">
    <SelectField label="Gebäude" aria-label="Gebäude" value={String(building?.id ?? '')}
      options={[...(!building ? [{ value: '', label: 'Gebäude auswählen …' }] : []),
        ...buildings.map(row => ({ value: String(row.id), label: row.name }))]}
      onChange={event => { if (event.target.value) choose(event.target.value); }} />
  </div>;
}
