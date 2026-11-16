import { useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { ArrowDown, ArrowUp, GripVertical, Plus, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/lib/Appearance';

export const widgetTitles = {
  issues: 'Aktuelle Meldungen', 'issue-status': 'Meldungsstatus', priority: 'Meldungen nach Priorität',
  activity: 'Letzte Aktivitäten', buildings: 'Gebäudeübersicht', model: 'BIM-Modell',
  map: 'Campuskarte', climate: 'Raumklima', metadata: 'Gebäudedaten', metrics: 'Kennzahlen',
  trend: 'Messwertverlauf', warnings: 'Sensorwarnungen', rooms: 'Raumzustände',
  system: 'Systemstatus', links: 'Schnellzugriffe',
};

function widget(id, size) {
  return id === 'issues' ? { id, size, filter: 'all' } : { id, size };
}

const standard = [
  widget('issues', 'medium'), widget('issue-status', 'small'), widget('model', 'medium'),
  widget('climate', 'small'), widget('buildings', 'medium'), widget('links', 'small'),
  widget('metadata', 'wide'), widget('metrics', 'wide'), widget('trend', 'medium'),
  widget('warnings', 'small'), widget('rooms', 'wide'),
];

export default function WidgetBoard({ renderWidget, buildings }) {
  const { value, loading, busy, error, save } = useAppearance();
  const [draft, setDraft] = useState(undefined);
  const [notice, setNotice] = useState('');
  const editing = draft !== undefined;
  const layout = (editing ? draft : value.dashboard_layout) ?? standard;

  function move(from, to) {
    if (to < 0 || to >= layout.length || from === to) return;
    const next = [...layout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setDraft(next);
  }

  function configure(index, settings) {
    setDraft(layout.map((item, position) => position === index ? { ...item, ...settings } : item));
  }

  async function persist() {
    if (await save({ dashboard_layout: draft })) {
      setDraft(undefined);
      setNotice('Layout im Konto gespeichert');
    }
  }

  return <div className="titan-widget-board space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {editing ? <>
        <Button onClick={persist} disabled={busy}>{busy ? 'Wird gespeichert …' : 'Layout speichern'}</Button>
        <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>Standard wiederherstellen</Button>
        <Button variant="ghost" onClick={() => setDraft(undefined)} disabled={busy}>Abbrechen</Button>
      </> : <Button variant="outline" onClick={() => { setDraft(value.dashboard_layout); setNotice(''); }} disabled={loading || busy}>
        <Settings2 className="h-4 w-4" /> Dashboard anpassen
      </Button>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    {editing && <section className="surface space-y-3 p-4">
      <h3 className="font-semibold">Widget-Katalog</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(widgetTitles).map(([id, title]) => <Button key={id} type="button" variant="outline" size="sm"
          disabled={busy || layout.some(item => item.id === id)} onClick={() => setDraft([...layout, widget(id, 'medium')])}>
          <Plus className="h-4 w-4" /> {title}
        </Button>)}
      </div>
    </section>}
    {editing && <DragDropContext onDragEnd={({ source, destination }) => { if (destination) move(source.index, destination.index); }}>
      <Droppable droppableId="dashboard">
        {provided => <ol className="grid gap-2" {...provided.droppableProps} ref={provided.innerRef}>
          {layout.map((item, index) => <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={busy}>
            {drag => <li ref={drag.innerRef} {...drag.draggableProps} className="surface flex flex-wrap items-center gap-2 p-3">
              <span {...drag.dragHandleProps} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-muted-foreground"
                aria-label={`${widgetTitles[item.id]} verschieben`}><GripVertical className="h-5 w-5" /></span>
              <span className="min-w-32 flex-1 font-medium">{widgetTitles[item.id]}</span>
              <label className="flex flex-wrap items-center gap-2 text-sm">Größe
                <select className="titan-select w-auto" value={item.size} disabled={busy} onChange={e => configure(index, { size: e.target.value })}>
                  <option value="small">Klein</option><option value="medium">Mittel</option><option value="wide">Breit</option>
                </select>
              </label>
              {item.id === 'issues' && <label className="flex flex-wrap items-center gap-2 text-sm">Status
                <select className="titan-select w-auto" value={item.filter} disabled={busy} onChange={e => configure(index, { filter: e.target.value })}>
                  <option value="all">Alle</option><option value="open">Offen</option><option value="done">Erledigt</option>
                </select>
              </label>}
              {item.id === 'model' && <label className="flex flex-wrap items-center gap-2 text-sm">Modell
                <select className="titan-select w-auto max-w-full" value={item.building_id || ''} disabled={busy}
                  onChange={e => configure(index, { building_id: Number(e.target.value) || undefined })}>
                  <option value="">D21-Campus</option>
                  {buildings.filter(building => building.model_document_id).map(building =>
                    <option key={building.id} value={building.id}>{building.name}</option>)}
                  {item.building_id && !buildings.some(building => building.id === item.building_id && building.model_document_id)
                    && <option value={item.building_id}>Modell nicht verfügbar</option>}
                </select>
              </label>}
              <div className="flex flex-wrap gap-1">
                <Button size="icon" variant="ghost" aria-label={`${widgetTitles[item.id]} nach oben`} disabled={busy || index === 0} onClick={() => move(index, index - 1)}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label={`${widgetTitles[item.id]} nach unten`} disabled={busy || index === layout.length - 1} onClick={() => move(index, index + 1)}><ArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label={`${widgetTitles[item.id]} entfernen`} disabled={busy} onClick={() => setDraft(layout.filter(widget => widget.id !== item.id))}><X /></Button>
              </div>
            </li>}
          </Draggable>)}
          {provided.placeholder}
        </ol>}
      </Droppable>
    </DragDropContext>}
    <div className="titan-widget-grid">
      {layout.map(item => <div key={item.id} className={`titan-widget titan-widget-${item.size}`}>{renderWidget(item)}</div>)}
      {!layout.length && <p className="text-muted-foreground">Das Dashboard ist leer.</p>}
    </div>
  </div>;
}
