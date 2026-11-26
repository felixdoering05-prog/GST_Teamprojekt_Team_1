import { useRef } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function IssuePhotoFields({ file, onChange, disabled }) {
  const camera = useRef(null);
  const files = useRef(null);

  function select(event) {
    const photo = event.target.files?.[0];
    if (photo) onChange(photo);
    event.target.value = '';
  }

  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-medium">Foto</legend>
    <input ref={camera} type="file" hidden accept="image/*" capture="environment" aria-label="Kamera für Mängelfoto" onChange={select} />
    <input ref={files} type="file" hidden accept="image/*" aria-label="Bilddatei für Mängelfoto" onChange={select} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => camera.current?.click()}>
        <Camera className="h-4 w-4" aria-hidden="true" /> Foto aufnehmen
      </Button>
      <Button type="button" variant="outline" onClick={() => files.current?.click()}>
        <ImagePlus className="h-4 w-4" aria-hidden="true" /> Datei wählen
      </Button>
    </div>
    {file && <p className="break-words text-sm text-muted-foreground" role="status">{file.name}</p>}
  </fieldset>;
}
