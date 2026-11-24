import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField, TextAreaField, TextField } from '@/components/Field';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export const lifecyclePhases = [
  { value: '', label: 'Nicht eingetragen' }, { value: 'planung', label: 'Planung' },
  { value: 'bau', label: 'Bau' }, { value: 'inbetriebnahme', label: 'Inbetriebnahme' },
  { value: 'betrieb', label: 'Betrieb' }, { value: 'umbau', label: 'Umbau' }, { value: 'rueckbau', label: 'Rückbau' },
];

const EMPTY = {
  name: '',
  code: '',
  site: '',
  address: '',
  latitude: '',
  longitude: '',
  model_heading_degrees: '0',
  map_provider_consent: false,
  year_built: '',
  gross_area_m2: '',
  floors_count: '',
  usage_type: '',
  usable_area_m2: '',
  owner_name: '',
  contact_name: '',
  contact_email: '',
  lifecycle_phase: '',
  description: '',
  bim_model_ref: '',
  bim_status: 'vorbereitet',
};

export default function BuildingDialog({ open, onOpenChange, building, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      building
        ? {
            name: building.name || '',
            code: building.code || '',
            site: building.site || '',
            address: building.address || '',
            latitude: building.latitude ?? '',
            longitude: building.longitude ?? '',
            model_heading_degrees: building.model_heading_degrees ?? '0',
            map_provider_consent: building.map_provider_consent === true,
            year_built: building.year_built ?? '',
            gross_area_m2: building.gross_area_m2 ?? '',
            floors_count: building.floors_count ?? '',
            usage_type: building.usage_type || '',
            usable_area_m2: building.usable_area_m2 ?? '',
            owner_name: building.owner_name || '',
            contact_name: building.contact_name || '',
            contact_email: building.contact_email || '',
            lifecycle_phase: building.lifecycle_phase || '',
            description: building.description || '',
            bim_model_ref: building.bim_model_ref || '',
            bim_status: building.bim_status || 'vorbereitet',
          }
        : EMPTY,
    );
  }, [open, building]);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Angaben fehlen', description: 'Die Gebäudebezeichnung ist erforderlich.', variant: 'destructive' });
      return;
    }
    if ((form.latitude === '') !== (form.longitude === '')) {
      toast({ title: 'Standort unvollständig', description: 'Bitte Breitengrad und Längengrad gemeinsam angeben.', variant: 'destructive' });
      return;
    }
    const latitude = form.latitude === '' ? null : Number(form.latitude);
    const longitude = form.longitude === '' ? null : Number(form.longitude);
    const heading = form.model_heading_degrees === '' ? 0 : Number(form.model_heading_degrees);
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -85.05112878 || latitude > 85.05112878)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) || !Number.isFinite(heading) || heading < 0 || heading > 360) {
      toast({ title: 'Standort prüfen', description: 'Koordinaten oder Modellrichtung liegen außerhalb des gültigen Bereichs.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        site: form.site.trim(),
        address: form.address.trim(),
        latitude,
        longitude,
        model_heading_degrees: heading,
        map_provider_consent: form.map_provider_consent,
        year_built: form.year_built === '' ? null : Number(form.year_built),
        gross_area_m2: form.gross_area_m2 === '' ? null : Number(form.gross_area_m2),
        floors_count: form.floors_count === '' ? null : Number(form.floors_count),
        usage_type: form.usage_type.trim(),
        usable_area_m2: form.usable_area_m2 === '' ? null : Number(form.usable_area_m2),
        owner_name: form.owner_name.trim(),
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        lifecycle_phase: form.lifecycle_phase,
        description: form.description,
        bim_model_ref: form.bim_model_ref.trim(),
        bim_status: form.bim_status,
      };
      if (building) await base44.entities.Building.update(building.id, payload);
      else { const created = await base44.entities.Building.create({ ...payload, source: 'real' }); localStorage.setItem('d21-selected-building',created.id); }
      toast({ title: building ? 'Gebäude aktualisiert' : 'Gebäude angelegt', description: payload.name });
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast({ title: 'Speichern fehlgeschlagen', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{building ? 'Gebäude bearbeiten' : 'Gebäude anlegen'}</DialogTitle>
          <DialogDescription>Stammdaten des Gebäudes und Stand der Revit-/IFC-Verknüpfung.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Bezeichnung *" value={form.name} onChange={set('name')} placeholder="z. B. D21" />
          <TextField label="Kurzzeichen" value={form.code} onChange={set('code')} placeholder="z. B. D21" />
          <TextField label="Standort" value={form.site} onChange={set('site')} placeholder="z. B. Hochschule Darmstadt" />
          <TextField label="Adresse" value={form.address} onChange={set('address')} placeholder="optional" />
          <TextField label="Breitengrad (WGS84)" type="number" step="any" value={form.latitude} onChange={set('latitude')} placeholder="z. B. 49.8640" />
          <TextField label="Längengrad (WGS84)" type="number" step="any" value={form.longitude} onChange={set('longitude')} placeholder="z. B. 8.6365" />
          <TextField label="Modellrichtung ab Norden (°)" type="number" min="0" max="360" step="1" value={form.model_heading_degrees} onChange={set('model_heading_degrees')} />
          <label className="sm:col-span-2 flex items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={form.map_provider_consent} onChange={event => setForm(f => ({ ...f, map_provider_consent: event.target.checked }))} />
            <span><span className="font-medium">OpenStreetMap-Karte für diesen Standort laden</span><span className="mt-1 block text-muted-foreground">Beim Anzeigen der Karte erhält der Kartendienst Anfragen für den sichtbaren Kartenausschnitt. Die Adresse wird nicht zur Suche übertragen. Ohne Häkchen bleibt der IFC-Viewer ohne externe Standortkarte.</span></span>
          </label>
          <TextField label="Baujahr" type="number" value={form.year_built} onChange={set('year_built')} />
          <TextField label="Bruttogrundfläche in m²" type="number" step="0.1" value={form.gross_area_m2} onChange={set('gross_area_m2')} />
          <TextField label="Anzahl Geschosse" type="number" value={form.floors_count} onChange={set('floors_count')} />
          <TextField label="Hauptnutzung" value={form.usage_type} onChange={set('usage_type')} placeholder="z. B. Hochschulgebäude" />
          <TextField label="Nutzfläche in m²" aria-label="Nutzfläche in m²" type="number" min="0" step="0.1" value={form.usable_area_m2} onChange={set('usable_area_m2')} />
          <SelectField label="Lebenszyklusphase" aria-label="Lebenszyklusphase" value={form.lifecycle_phase} onChange={set('lifecycle_phase')} options={lifecyclePhases} />
          <TextField label="Kunde / Eigentümer" aria-label="Kunde / Eigentümer" value={form.owner_name} onChange={set('owner_name')} maxLength={200} />
          <TextField label="Ansprechpartner" aria-label="Ansprechpartner" value={form.contact_name} onChange={set('contact_name')} maxLength={200} />
          <TextField label="Kontakt-E-Mail" aria-label="Kontakt-E-Mail" type="email" value={form.contact_email} onChange={set('contact_email')} maxLength={254} />
          <TextField
            label="Verweis Revit-/IFC-Modell"
            className="sm:col-span-2"
            value={form.bim_model_ref}
            onChange={set('bim_model_ref')}
            placeholder="Modellname, Dateiablage oder Freigabestand"
          />
          <SelectField
            label="Stand der Modellverknüpfung"
            value={form.bim_status}
            onChange={set('bim_status')}
            options={[
              { value: 'nicht_verknuepft', label: 'Nicht verknüpft' },
              { value: 'vorbereitet', label: 'Vorbereitet (Raumfelder angelegt)' },
              { value: 'verknuepft', label: 'Verknüpft' },
            ]}
          />
          <TextAreaField label="Beschreibung" className="sm:col-span-2" value={form.description} onChange={set('description')} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
