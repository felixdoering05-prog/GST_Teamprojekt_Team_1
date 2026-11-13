import { useRef, useState } from 'react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BuildingSetupDialog({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(null);

  async function save(event) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    const body = { name: name.trim(), address: address.trim() };
    const previous = attempt.current;
    if (!previous || previous.name !== body.name || previous.address !== body.address) {
      attempt.current = { ...body, id: crypto.randomUUID() };
    }
    setBusy(true);
    setError('');
    let building;
    try {
      building = await request('/buildings', { method: 'POST', body, headers: { 'X-Request-ID': attempt.current.id } });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
      return;
    }
    onCreated(building);
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gebäude anlegen</DialogTitle>
          <DialogDescription>Gib deinem Gebäude einen Namen. Danach kannst du Dateien hinzufügen.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setup-name">Gebäudename</Label>
            <Input id="setup-name" value={name} onChange={event => setName(event.target.value)} maxLength={200} required disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setup-address">Adresse (optional)</Label>
            <Input id="setup-address" value={address} onChange={event => setAddress(event.target.value)} maxLength={500} disabled={busy} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Wird gespeichert …' : 'Speichern und weiter'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
