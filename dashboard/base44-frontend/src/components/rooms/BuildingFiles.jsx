import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Download, FileText, ImagePlus, LoaderCircle, Pencil, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { request, uploadFile } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { SelectField, TextField } from '@/components/Field';
import { formatDateShort } from '@/lib/dates';
import { documentKey, isImage, isModel, uploadProblem } from './buildingFilesModel';

const documentCategories = { allgemein: 'Allgemein', tga: 'TGA', elektro: 'Elektro', bim: 'BIM', brandschutz: 'Brandschutz', wartung: 'Wartung', bilder: 'Bilder und Scans', plaene: 'Pläne' };
const reviewStatuses = { draft: 'Entwurf', in_review: 'In Prüfung', approved: 'Freigegeben' };
const options = values => Object.entries(values).map(([value, label]) => ({ value, label }));
const categoryOf = file => file.category || (isModel(file) ? 'bim' : isImage(file) ? 'bilder' : ['application/acad', 'application/dxf'].includes(file.mime_type) ? 'plaene' : 'allgemein');

function ImageThumbnail({ file, onOpen }) {
  const [url, setURL] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, object;
    request(`/documents/${file.id}`, { raw: true }).then(blob => {
      if (active) { object = URL.createObjectURL(blob); setURL(object); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (object) URL.revokeObjectURL(object); };
  }, [file.id]);
  return <button type="button" onClick={onOpen} className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${file.name} ansehen`}>
    {url ? <img src={url} alt={file.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" /> : <span className="grid h-full place-items-center text-xs text-muted-foreground">{failed ? 'Vorschau nicht verfügbar · öffnen' : 'Bild wird geladen …'}</span>}
  </button>;
}

export default function BuildingFiles({ building, onFilesAvailable, onDocumentsChange, onBusyChange, mode = 'all', compact = false, active = true }) {
  const cache = useQueryClient();
  const inputId = useId();
  const input = useRef(null), lock = useRef(false), alive = useRef(true);
  const [queue, setQueue] = useState([]), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false);
  const [error, setError] = useState(''), [selectionError, setSelectionError] = useState(''), [success, setSuccess] = useState('');
  const [rename, setRename] = useState(null), [newName, setNewName] = useState(''), [remove, setRemove] = useState(null), [preview, setPreview] = useState(null);
  const [imageLimit, setImageLimit] = useState(6);
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [status, setStatus] = useState('');
  const [uploadCategory, setUploadCategory] = useState('allgemein'), [metadata, setMetadata] = useState(null);
  const registry = mode === 'registry';
  const query = useQuery({ queryKey: documentKey(building.id), queryFn: () => request(`/buildings/${building.id}/documents`) });
  const access = useQuery({ queryKey: ['building-team-access',String(building.id)], queryFn: () => request(`/buildings/${building.id}/team-access`) });
  const canEditFiles=access.data?.is_owner===true||access.data?.actor_role?.permissions?.documents==='edit';
  const files = query.data ?? [];
  const images = files.filter(isImage);
  const matching = files.filter(file => (!category || categoryOf(file) === category) && (!status || file.review_status === status) &&
    [file.name, documentCategories[categoryOf(file)], file.version_label].join(' ').toLocaleLowerCase('de').includes(search.trim().toLocaleLowerCase('de')));
  const pending = queue.some(item => item.status !== 'done');
  const locked = busy || pending;
  useEffect(() => { if (query.data) { onFilesAvailable?.(files.length > 0); onDocumentsChange?.(files); } }, [query.data, onFilesAvailable, onDocumentsChange]);
  useEffect(() => { onBusyChange?.(locked); }, [locked, onBusyChange]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    if (!locked) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [locked]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const updateFiles = async change => { await cache.cancelQueries({ queryKey: documentKey(building.id) }); cache.setQueryData(documentKey(building.id), change); cache.invalidateQueries({ queryKey: ['account-buildings'] }); };
  const updateItem = (id, changes) => setQueue(items => items.map(item => item.id === id ? { ...item, ...changes } : item));

  async function upload(items) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSuccess('');
    let completed = 0;
    try {
      for (const item of items) {
        updateItem(item.id, { status: 'uploading', progress: 0, error: '' });
        try {
          const document = await uploadFile(building.id, item.file, item.id, progress => updateItem(item.id, { progress }), item.category);
          await updateFiles(rows => [document, ...(rows ?? []).filter(file => file.id !== document.id)]);
          updateItem(item.id, { status: 'done', progress: 1 }); completed++;
        } catch (failure) { updateItem(item.id, { status: 'error', error: failure.message }); }
      }
      if (completed) setSuccess(`${completed === 1 ? 'Eine Datei' : `${completed} Dateien`} gespeichert – auch in der App verfügbar.`);
    } finally { lock.current = false; setBusy(false); }
  }
  function choose(list) {
    if (!canEditFiles || locked || lock.current) return;
    setError(''); setSuccess('');
    const selected = Array.from(list ?? []), problems = [], items = [];
    for (const file of selected.slice(0, 20)) {
      const problem = uploadProblem(file, mode);
      if (problem) problems.push(problem);
      else items.push({ file, id: crypto.randomUUID(), status: 'pending', progress: 0, category: registry ? uploadCategory : null });
    }
    if (selected.length > 20) problems.push('Bitte höchstens 20 Dateien auf einmal auswählen. Weitere Dateien kannst du danach ergänzen.');
    setSelectionError(problems.join(' '));
    if (items.length) { setQueue(items); upload(items); }
  }
  async function open(file, download = false) {
    if (lock.current) return;
    lock.current = true; setError(''); setBusy(true);
    try {
      const blob = await request(`/documents/${file.id}`, { raw: true });
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      if (download || ['application/acad', 'application/dxf', 'application/x-step'].includes(file.mime_type)) {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else setPreview({ file, url });
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveName(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setError(''); setBusy(true);
    try {
      const extension = rename.name.slice(rename.name.lastIndexOf('.'));
      const updated = await request(`/documents/${rename.id}`, { method: 'PATCH', body: { name: newName.trim() + extension } });
      await updateFiles(rows => rows.map(file => file.id === updated.id ? updated : file)); setRename(null); setSuccess('Dateiname gespeichert.');
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function deleteFile() {
    if (lock.current) return;
    lock.current = true; setError(''); setBusy(true);
    try {
      await request(`/documents/${remove.id}`, { method: 'DELETE' });
      await updateFiles(rows => rows.filter(file => file.id !== remove.id)); setRemove(null); setSuccess('Datei gelöscht.');
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveMetadata(event) {
    event.preventDefault();
    if (lock.current) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    lock.current = true;
    setError(''); setBusy(true);
    try {
      const saved = await request('/documents/' + metadata.id + '/metadata', { method: 'PATCH', body });
      await updateFiles(rows => rows.map(row => row.id === saved.id ? saved : row));
      setMetadata(null); setSuccess('Dokumentdaten gespeichert.');
    } catch (failure) { setError(failure.message); }
    finally { lock.current = false; setBusy(false); }
  }
  function actions(file) {
    return <div className="flex flex-wrap gap-1">
      <Button size="icon" variant="ghost" aria-label={`${file.name} herunterladen`} disabled={locked} onClick={() => open(file, true)}><Download className="h-4 w-4" /></Button>
      {canEditFiles&&<><Button size="icon" variant="ghost" aria-label={`${file.name} umbenennen`} disabled={locked} onClick={() => { setNewName(file.name.slice(0, file.name.lastIndexOf('.'))); setRename(file); }}><Pencil className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" aria-label={`${file.name} löschen`} disabled={locked} onClick={() => setRemove(file)}><Trash2 className="h-4 w-4" /></Button></>}
    </div>;
  }
  return <section className={compact ? 'space-y-4' : 'surface space-y-5 p-5'}>
    {!compact && <div><h2 className="font-heading text-lg font-semibold">{registry ? 'Dokumentenregister' : mode === 'photos' ? 'Deine Bildergalerie' : mode === 'plans' ? 'Pläne und Modelle' : 'Bilder und Unterlagen'}</h2><p className="mt-1 text-sm text-muted-foreground">{registry ? building.name + ' · ' + files.length + ' Dokumente' : mode === 'photos' ? 'Fotos und Scans deines Gebäudes an einem Ort.' : 'Unterlagen hochladen, ansehen und gemeinsam verwenden.'}</p></div>}
    {registry && <div className="grid gap-3 sm:grid-cols-3">
      <TextField label="Dokument suchen" aria-label="Dokument suchen" value={search} onChange={event => setSearch(event.target.value)} placeholder="Dateiname, Kategorie oder Version" />
      <SelectField label="Kategorie" aria-label="Dokumentkategorie filtern" value={category} onChange={event => setCategory(event.target.value)} options={[{ value: '', label: 'Alle Kategorien' }, ...options(documentCategories)]} />
      <SelectField label="Freigabestand" aria-label="Freigabestand filtern" value={status} onChange={event => setStatus(event.target.value)} options={[{ value: '', label: 'Alle Freigabestände' }, ...options(reviewStatuses)]} />
    </div>}
    {canEditFiles?<div onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files); }} className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-primary/20 bg-primary/5'}`}>
      {mode === 'photos' ? <ImagePlus className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" /> : <UploadCloud className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" />}
      <Label htmlFor={inputId} className="block text-sm font-semibold">{mode === 'photos' ? 'Bilder hier ablegen' : 'Unterlagen hier ablegen'}</Label>
      {registry && <div className="mx-auto my-3 max-w-xs text-left"><SelectField label="Kategorie für Upload" aria-label="Kategorie für Upload" value={uploadCategory} disabled={locked} onChange={event => setUploadCategory(event.target.value)} options={options(documentCategories)} /></div>}
      <p className="mb-3 mt-1 text-xs text-muted-foreground">{mode === 'photos' ? 'JPG, PNG oder WebP' : 'PDF, Fotos/Scans, DXF, DWG oder IFC'} · mehrere Dateien möglich</p>
      <input ref={input} id={inputId} className="sr-only" type="file" multiple accept={mode === 'photos' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp,.dxf,.dwg,.ifc'} disabled={locked} onChange={event => { choose(event.target.files); event.target.value = ''; }} />
      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}{mode === 'photos' ? 'Bilder auswählen' : 'Dateien auswählen'}</Button>
      <p className="mt-3 text-xs text-muted-foreground">Bis 25 MB pro Datei, IFC bis 20 MB. Bei aktivierter Plananalyse werden neue Bilder und PDFs wie freigegeben an Google Gemini übertragen.</p>
    </div>:<p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Du kannst Unterlagen und Pläne ansehen und herunterladen. Zum Hinzufügen oder Ändern fehlt dir die Dateiberechtigung für dieses Gebäude.</p>}
    {queue.length > 0 && <div className="space-y-3 rounded-xl border p-3" aria-label="Dateiübertragungen">
      {queue.map(item => <div key={item.id} className="space-y-1"><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{item.file.name}</span><span className="shrink-0 text-xs">{item.status === 'done' ? <span className="flex items-center gap-1 text-primary"><Check className="h-3 w-3" />Gespeichert</span> : item.status === 'error' ? 'Nicht gespeichert' : item.status === 'pending' ? 'Wartet' : item.progress >= 1 ? 'Server bestätigt …' : `${Math.round(item.progress * 100)} %`}</span></div>{item.status === 'uploading' && <progress className="h-1 w-full accent-primary" value={Math.min(item.progress, .99)} max="1" aria-label={`Upload von ${item.file.name}`} />}{item.error && <p role="alert" className="text-xs text-destructive">{item.error}</p>}</div>)}
      {pending && !busy && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => upload(queue.filter(item => item.status !== 'done'))}><RefreshCw className="mr-1 h-3 w-3" />Fehlgeschlagene erneut versuchen</Button><Button size="sm" variant="ghost" onClick={() => setQueue([])}>Nicht gespeicherte Auswahl verwerfen</Button></div>}
    </div>}
    {(error || selectionError || query.error) && <p role="alert" className="text-sm text-destructive">{error || selectionError || query.error.message}</p>}
    {query.error && <Button variant="outline" size="sm" onClick={() => query.refetch()}>Dateien erneut laden</Button>}
    {success && <p role="status" className="text-sm text-primary">{success}</p>}
    {query.isPending && <p role="status" className="text-sm text-muted-foreground">Unterlagen werden geladen …</p>}
    {registry && query.isSuccess && (matching.length ? <ul className="divide-y">
      {matching.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words font-semibold">{file.name}</p>
          <p className="text-sm text-muted-foreground">{documentCategories[categoryOf(file)]} · {file.version_label ? 'Version ' + file.version_label : 'Version offen'} · {reviewStatuses[file.review_status] || 'Freigabestand offen'} · {formatDateShort(file.created_at)} · {Math.ceil(file.size / 1024)} KB</p></div>
        <div className="flex flex-wrap items-center gap-1">
          {isModel(file) ? <Button size="sm" variant="outline" asChild><Link to={'/bim-viewer?model=' + file.id}>In 3D öffnen</Link></Button> :
            <Button size="sm" variant="outline" disabled={locked} onClick={() => open(file)} aria-label={file.name + ' öffnen'}>Öffnen</Button>}
          {canEditFiles && <Button size="sm" variant="ghost" disabled={locked} onClick={() => setMetadata(file)}>Dokumentdaten</Button>}
          {actions(file)}
        </div>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">Keine Dokumente in dieser Auswahl.</p>)}
    {!registry && active && mode !== 'plans' && images.length > 0 && <><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{images.slice(0, imageLimit).map(file => <article key={file.id} className="min-w-0 rounded-2xl border p-2"><ImageThumbnail file={file} onOpen={() => { if (!locked) open(file); }} /><div className="px-1 pt-2"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{Math.ceil(file.size / 1024)} KB</span>{actions(file)}</div></div></article>)}</div>{images.length > imageLimit && <Button variant="outline" size="sm" onClick={() => setImageLimit(limit => limit + 6)}>Weitere Bilder anzeigen ({images.length - imageLimit})</Button>}</>}
    {!registry && mode !== 'photos' && <ul className="divide-y">{files.filter(file => mode === 'plans' || !isImage(file)).map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-all text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{isModel(file) ? 'IFC-Modell' : isImage(file) ? 'Bild / Scan' : 'Unterlage'} · {Math.ceil(file.size / 1024)} KB</p></div></div><div className="flex flex-wrap items-center gap-1">{isModel(file) ? <Button size="sm" variant="outline" asChild><Link to={`/bim-viewer?model=${file.id}`}>In 3D öffnen</Link></Button> : !['application/acad', 'application/dxf'].includes(file.mime_type) && <Button size="sm" variant="outline" disabled={locked} onClick={() => open(file)}>Ansehen</Button>}{actions(file)}</div></li>)}</ul>}
    {metadata && <Dialog open onOpenChange={open => { if (!open && !busy) setMetadata(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Dokumentdaten bearbeiten</DialogTitle><DialogDescription>{metadata.name}</DialogDescription></DialogHeader>
      <form onSubmit={saveMetadata} className="space-y-3">
        <SelectField label="Kategorie" aria-label="Kategorie" name="category" defaultValue={categoryOf(metadata)} options={options(documentCategories)} />
        <TextField label="Version" aria-label="Version" name="version_label" defaultValue={metadata.version_label || '1.0'} maxLength={30} required />
        <SelectField label="Freigabestand" aria-label="Freigabestand" name="review_status" defaultValue={metadata.review_status || 'draft'} options={options(reviewStatuses)} />
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button disabled={busy} type="submit">Speichern</Button>
      </form></DialogContent>
    </Dialog>}
    {query.isSuccess && (mode === 'photos' ? !images.length : !files.length) && <p className="py-3 text-center text-sm text-muted-foreground">{mode === 'photos' ? 'Hier entsteht deine Galerie. Füge ein erstes Bild hinzu.' : 'Noch keine Unterlagen. Du kannst sie auch später ergänzen.'}</p>}
    <Dialog open={!!rename} onOpenChange={open => { if (!open && !busy) setRename(null); }}><DialogContent><DialogHeader><DialogTitle>Datei umbenennen</DialogTitle><DialogDescription>Die Dateiendung bleibt erhalten. Der neue Name erscheint auch in der App.</DialogDescription></DialogHeader><form onSubmit={saveName} className="space-y-4"><Label htmlFor={`${inputId}-name`}>Dateiname</Label><Input id={`${inputId}-name`} value={newName} onChange={event => setNewName(event.target.value)} required maxLength={190} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy || !newName.trim()}>Speichern</Button></form></DialogContent></Dialog>
    <ConfirmDialog open={!!remove} onOpenChange={open => { if (!open && !busy) setRemove(null); }} title="Datei wirklich löschen?" description={`„${remove?.name || ''}“ wird auch aus der iPhone-Gebäudemappe entfernt. Dies lässt sich nicht rückgängig machen.`} onConfirm={deleteFile} busy={busy} />
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{preview?.file.name}</DialogTitle><DialogDescription>Gespeicherte Datei aus deiner Gebäudemappe.</DialogDescription></DialogHeader>{preview?.file.mime_type.startsWith('image/') ? <img alt={preview.file.name} src={preview.url} className="max-h-[70vh] w-full object-contain" /> : preview && <iframe title={preview.file.name} src={preview.url} className="h-[70vh] w-full" />}</DialogContent></Dialog>
  </section>;
}

