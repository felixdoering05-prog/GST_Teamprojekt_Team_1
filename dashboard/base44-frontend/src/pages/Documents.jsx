import PageHeader from '@/components/PageHeader';
import BuildingSectionSelect from '@/components/rooms/BuildingSectionSelect';
import BuildingFiles from '@/components/rooms/BuildingFiles';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';

export default function Documents() {
  const selection = useBuildingSelection();
  return <div className="space-y-5">
    <PageHeader title="Dokumente" description="Gebäudeunterlagen nach Kategorie, Version und Freigabestand." />
    <BuildingSectionSelect selection={selection} />
    {selection.building && <BuildingFiles key={selection.building.id} building={selection.building} mode="registry" />}
  </div>;
}
