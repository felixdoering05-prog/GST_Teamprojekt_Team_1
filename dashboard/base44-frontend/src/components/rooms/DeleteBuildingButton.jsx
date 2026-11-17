import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function DeleteBuildingButton({ building, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  if (!building.is_owner) return null;

  function changeOpen(next) {
    if (pending.current) return;
    setOpen(next);
    setName('');
    setError('');
  }

  async function remove() {
    if (pending.current || name !== building.name) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await request(`/buildings/${building.id}`, { method: 'DELETE', body: { confirmation: 'DELETE' } });
    } catch (e) {
      setError(e.message);
      pending.current = false;
      setBusy(false);
      return;
    }
    onDeleted(building);
  }

  return <>
    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => changeOpen(true)}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Gebäude löschen</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Gebäude endgültig löschen?</DialogTitle><DialogDescription>„{building.name}“ und die zugehörigen gespeicherten Daten werden für alle Gebäudemitglieder gelöscht. Das kann nicht rückgängig gemacht werden. Angeschlossene Geräte werden dadurch nicht zurückgesetzt.</DialogDescription></DialogHeader>
        <label className="space-y-2 text-sm"><span className="block">Zum Bestätigen den Gebäudenamen eingeben: <strong className="break-words">{building.name}</strong></span><Input aria-label="Gebäudename zur Löschbestätigung" value={name} onChange={event => setName(event.target.value)} disabled={busy} autoComplete="off" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>Abbrechen</Button><Button variant="destructive" disabled={busy || name !== building.name} onClick={remove}>{busy ? 'Wird gelöscht …' : 'Endgültig löschen'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
