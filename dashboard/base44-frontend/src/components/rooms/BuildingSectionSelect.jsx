import { Link } from 'react-router-dom';
import { SelectField } from '@/components/Field';

export default function BuildingSectionSelect({ selection }) {
  const { building, buildings, query, choose } = selection;
  if (query.isPending) return <p role="status">Gebäude werden geladen …</p>;
  if (query.isError) return <p role="alert" className="text-destructive">{query.error.message}</p>;
  if (!building) return <p>Lege zuerst ein <Link className="text-primary underline" to="/gebaeude?all=1">Gebäude</Link> an.</p>;
  return <div className="max-w-sm">
    <SelectField label="Gebäude" aria-label="Gebäude" value={String(building.id)}
      options={buildings.map(row => ({ value: String(row.id), label: row.name }))} onChange={event => choose(event.target.value)} />
  </div>;
}
