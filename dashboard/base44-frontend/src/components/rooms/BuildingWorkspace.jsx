import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, FileBox, Images, LayoutDashboard, Layers, MapPin, Plus, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { request } from '@/api/base44Client';
import BuildingFiles from './BuildingFiles';
import PlanConversionPanel from './PlanConversionPanel';
import { documentKey, isImage, isModel } from './buildingFilesModel';

export default function BuildingWorkspace({ building, section, onSection, onSetup, onTeam, structure }) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: documentKey(building.id), queryFn: () => request(`/buildings/${building.id}/documents`) });
  const files = query.data ?? [], images = files.filter(isImage), models = files.filter(isModel);
  const model = query.isSuccess ? models[0]?.id : building.model_document_id;
  const panels = [['overview', 'Übersicht', LayoutDashboard], ['gallery', 'Galerie', Images], ['models', 'Pläne & 3D', FileBox], ['rooms', 'Räume', Layers]];
  return <Tabs value={section} onValueChange={onSection} className="space-y-5">
    <div className="overflow-x-auto pb-1"><TabsList aria-label="Gebäudebereiche" className="h-auto w-max gap-1 rounded-full p-1.5">{panels.map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="rounded-full px-4 py-2.5"><Icon className="mr-2 h-4 w-4" aria-hidden="true" />{label}</TabsTrigger>)}</TabsList></div>
    <TabsContent value="overview" className="space-y-5">
      <section className="surface relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-5"><span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-primary/10 text-primary"><Building2 className="h-10 w-10" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Deine Gebäudemappe</p><h2 className="mt-2 break-words font-heading text-2xl font-semibold sm:text-3xl">{building.name}</h2><p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{building.address || 'Adresse kannst du später ergänzen'}</p></div><div className="flex flex-wrap gap-2">{model && <Button asChild><Link to={`/bim-viewer?model=${model}`}><FileBox className="mr-2 h-4 w-4" />In 3D öffnen</Link></Button>}{building.is_owner && <Button variant="outline" onClick={onSetup}><Plus className="mr-2 h-4 w-4" />Einrichtung fortsetzen</Button>}</div></div>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">{[
        { title: 'Bildergalerie', detail: query.isSuccess ? `${images.length} Bilder und Scans` : 'Bilder deines Gebäudes', icon: Images, target: 'gallery' },
        { title: 'Pläne & 3D', detail: model ? 'IFC-Modell vorhanden' : 'Pläne hochladen oder Modell erstellen', icon: FileBox, target: 'models' },
        { title: 'Räume & Technik', detail: 'Geschosse, Räume und Sensorzuordnung', icon: Layers, target: 'rooms' },
      ].map(({ title, detail, icon: Icon, target }) => <button key={target} type="button" onClick={() => onSection(target)} className="surface group flex items-center gap-4 p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1 motion-reduce:transition-none" /></button>)}</div>
      <section className="surface flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">Ein Gebäude, dieselben Unterlagen</h3><p className="mt-1 text-xs text-muted-foreground">Gespeicherte Bilder und Pläne sind auch in der App und für eingeladene Gebäudemitglieder verfügbar.</p></div></div><Button variant="outline" size="sm" onClick={onTeam}><Users className="mr-2 h-4 w-4" />{building.is_owner ? 'Gebäude teilen' : 'Gebäudeteam'}</Button></section>
    </TabsContent>
    <TabsContent value="gallery" forceMount hidden={section !== 'gallery'}><BuildingFiles building={building} mode="photos" /></TabsContent>
    <TabsContent value="models" forceMount hidden={section !== 'models'} className="space-y-5">
      {model && <section className="surface flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold">Dein 3D-Modell</h2><p className="mt-1 text-sm text-muted-foreground">Gebäude erkunden und Bauteile auswählen.</p></div><Button asChild><Link to={`/bim-viewer?model=${model}`}>Modell öffnen<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section>}
      <BuildingFiles building={building} mode="plans" />
      {building.is_owner && section === 'models' && <details className="group rounded-2xl border bg-card p-5"><summary className="cursor-pointer list-none"><span className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><span><span className="block font-semibold">Aus Grundrissen einen 3D-Entwurf erstellen</span><span className="mt-1 block text-xs text-muted-foreground">Vorhandene Pläne prüfen und mit deiner Freigabe auswerten.</span></span><Plus className="ml-auto h-4 w-4 text-primary" /></span></summary><div className="mt-5"><PlanConversionPanel buildingId={building.id} onAdopt={() => { cache.invalidateQueries({ queryKey: documentKey(building.id) }); cache.invalidateQueries({ queryKey: ['account-buildings'] }); }} /></div></details>}
    </TabsContent>
    <TabsContent value="rooms">{section === 'rooms' && structure}</TabsContent>
  </Tabs>;
}
