import { useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, FileBox, Images, MapPin } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BuildingFiles from './BuildingFiles';
import { isImage, isModel } from './buildingFilesModel';

const steps = [
  { title: 'Gebäude', icon: Building2 }, { title: 'Bilder', icon: Images },
  { title: 'Pläne & 3D', icon: FileBox }, { title: 'Bereit', icon: CheckCircle2 },
];
export default function BuildingSetupDialog({ building: initialBuilding, onClose, onCreated }) {
  const id = useId();
  const [building, setBuilding] = useState(initialBuilding ?? null);
  const [step, setStep] = useState(initialBuilding ? 1 : 0);
  const [name, setName] = useState(initialBuilding?.name ?? ''), [address, setAddress] = useState(initialBuilding?.address ?? '');
  const [saving, setSaving] = useState(false), [photoBusy, setPhotoBusy] = useState(false), [planBusy, setPlanBusy] = useState(false);
  const [documents, setDocuments] = useState(null), [error, setError] = useState('');
  const attempt = useRef(null), lock = useRef(false);
  const busy = saving || photoBusy || planBusy;
  const photos = (documents ?? []).filter(isImage), models = (documents ?? []).filter(isModel);
  function finish(section = 'overview') { if (!busy && !lock.current) onCreated(building, { section }); }
  function close() { if (!busy && !lock.current) { if (building) finish(); else onClose(); } }
  async function save(event) {
    event.preventDefault();
    if (busy || lock.current || !name.trim()) return;
    if (building) { setStep(1); return; }
    // Keep both payload and key stable after an uncertain network response.
    if (!attempt.current) attempt.current = { name: name.trim(), address: address.trim(), id: crypto.randomUUID() };
    lock.current = true; setSaving(true); setError('');
    try {
      const saved = await request('/buildings', { method: 'POST', body: { name: attempt.current.name, address: attempt.current.address }, headers: { 'X-Request-ID': attempt.current.id } });
      setBuilding({ ...saved, is_owner: true }); setStep(1);
    } catch (failure) { setError(failure.message); if (failure.status === 400) attempt.current = null; }
    finally { lock.current = false; setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto rounded-3xl p-0" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <div className="border-b bg-primary/5 p-6">
        <DialogHeader><DialogTitle className="text-2xl">{step === 3 ? 'Dein Gebäude ist bereit' : building ? building.name : 'Dein neues Gebäude'}</DialogTitle><DialogDescription>{step === 0 ? 'Starte mit einem Namen. Bilder und Unterlagen kannst du direkt ergänzen.' : 'Gespeichert in deiner Gebäudemappe. Du kannst die Einrichtung jederzeit später fortsetzen.'}</DialogDescription></DialogHeader>
        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Gebäude einrichten">{steps.map(({ title, icon: Icon }, index) => <li key={title} aria-current={step === index ? 'step' : undefined} className="min-w-0"><span className={`mb-2 grid h-9 w-9 place-items-center rounded-full ${index <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{index < step ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span className={`block text-xs ${index === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{title}</span></li>)}</ol>
      </div>
      <div className="px-6 pb-6">
        {step === 0 && <form onSubmit={save} className="space-y-5 pt-5">
          <div className="space-y-2"><Label htmlFor={`${id}-name`}>Wie heißt dein Gebäude?</Label><Input id={`${id}-name`} placeholder="Zum Beispiel: Zuhause oder Büro am Park" value={name} onChange={event => setName(event.target.value)} maxLength={200} required disabled={busy || !!building || !!attempt.current} autoFocus /></div>
          <div className="space-y-2"><Label htmlFor={`${id}-address`}>Adresse <span className="font-normal text-muted-foreground">· optional</span></Label><Input id={`${id}-address`} placeholder="Straße, Hausnummer, Ort" value={address} onChange={event => setAddress(event.target.value)} maxLength={500} disabled={busy || !!building || !!attempt.current} /><p className="text-xs text-muted-foreground">Die Adresse wird gespeichert. Externe Karten- oder KI-Dienste werden dadurch noch nicht aufgerufen.</p></div>
          {error && <p role="alert" className="text-sm text-destructive">{error} Deine Angaben bleiben für einen erneuten Versuch erhalten.</p>}
          <DialogFooter><Button type="button" variant="ghost" onClick={close} disabled={busy}>{building ? 'Später fortsetzen' : 'Abbrechen'}</Button><Button type="submit" disabled={busy || !name.trim()}>{saving ? 'Wird gespeichert …' : error ? 'Erneut versuchen' : 'Speichern und weiter'}<ArrowRight className="ml-2 h-4 w-4" /></Button></DialogFooter>
        </form>}
        {building && <>
          <div hidden={step !== 1} className="space-y-4 pt-5"><div><h3 className="font-semibold">Ein erster Eindruck</h3><p className="mt-1 text-sm text-muted-foreground">Füge Fotos vom Gebäude, Räumen oder Details hinzu. Dieser Schritt ist optional.</p></div><BuildingFiles building={building} mode="photos" active={step === 1} compact onDocumentsChange={setDocuments} onBusyChange={setPhotoBusy} /></div>
          <div hidden={step !== 2} className="space-y-4 pt-5"><div><h3 className="font-semibold">Was liegt dir schon vor?</h3><p className="mt-1 text-sm text-muted-foreground">Lade Grundrisse oder ein fertiges IFC-Modell hoch. Aus Plänen kannst du anschließend einen 3D-Entwurf erstellen.</p></div><BuildingFiles building={building} mode="plans" compact onBusyChange={setPlanBusy} /></div>
        </>}
        {step === 3 && <div className="space-y-5 py-6"><CheckCircle2 className="h-12 w-12 text-primary" /><div><h3 className="text-xl font-semibold">{building.name}</h3>{building.address && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{building.address}</p>}</div><div className="grid grid-cols-3 gap-3">{[[documents ? photos.length : '—', 'Bilder'], [documents ? documents.length - photos.length : '—', 'Unterlagen'], [documents ? models.length : '—', 'IFC-Modelle']].map(([count, label]) => <div key={label} className="rounded-2xl bg-muted/60 p-4"><p className="text-xl font-semibold">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div><p className="text-sm text-muted-foreground">Gespeicherte Dateien sind auch in der App verfügbar. Bilder, Modelle und Teamfreigaben kannst du jederzeit ergänzen.</p></div>}
        {step > 0 && <DialogFooter className="mt-6 flex-wrap gap-2 border-t pt-4"><Button variant="ghost" disabled={busy} onClick={() => setStep(index => index - 1)}><ArrowLeft className="mr-1 h-4 w-4" />Zurück</Button><Button variant="ghost" disabled={busy} onClick={() => finish()}>Später fortsetzen</Button>{step < 3 ? <Button disabled={busy} onClick={() => setStep(index => index + 1)}>{step === 2 ? 'Zur Übersicht' : 'Weiter'}<ArrowRight className="ml-2 h-4 w-4" /></Button> : <><Button variant="outline" disabled={busy} onClick={() => finish('models')}>{models.length ? 'Modell öffnen' : 'Pläne & 3D öffnen'}</Button><Button disabled={busy} onClick={() => finish()}>Gebäude öffnen<ArrowRight className="ml-2 h-4 w-4" /></Button></>}</DialogFooter>}
      </div>
    </DialogContent>
  </Dialog>;
}
