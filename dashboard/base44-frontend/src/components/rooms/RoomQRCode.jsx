import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Printer, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { roomDisplayName, roomQRCodeLink } from '@/lib/roomLocation';
import './room-qr.css';

function Label({ building, floor, room, url }) {
  return <div className="room-qr-label grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-950">
    <QRCodeSVG value={url} marginSize={4} level="M" size={128} className="h-28 w-28 sm:h-32 sm:w-32"
      title="QR-Code zur Raumkarte" />
    <div className="min-w-0 break-words">
      <p className="text-lg font-bold leading-tight">{roomDisplayName(room)}</p>
      <p className="mt-2 text-sm font-semibold">{building.name}</p>
      <p className="text-sm">{floor?.name || 'Geschoss nicht hinterlegt'}</p>
    </div>
  </div>;
}

export default function RoomQRCode({ building, floor, room }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef(null);
  const label = { building, floor, room, url: roomQRCodeLink(building.id, room.id, window.location) };

  async function copy() {
    try {
      await navigator.clipboard.writeText(label.url);
      setMessage('Raumlink kopiert.');
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage('Der Raumlink ist markiert und kann kopiert werden.');
    }
  }

  return <Dialog open={open} onOpenChange={next => { setOpen(next); setMessage(''); }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm"><QrCode className="h-4 w-4" aria-hidden="true" /> Raum-QR-Code</Button>
    </DialogTrigger>
    {open && <>
      <DialogContent className="max-h-[94dvh] max-w-[min(95vw,30rem)] overflow-y-auto rounded-xl">
        <DialogTitle>Raum-QR-Code</DialogTitle>
        <DialogDescription>Der Link öffnet die Raumkarte nach der Anmeldung.</DialogDescription>
        <Label {...label} />
        <input ref={input} readOnly value={label.url} aria-label="Raumlink"
          className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copy}><Copy className="h-4 w-4" aria-hidden="true" /> Link kopieren</Button>
          <Button type="button" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Etikett drucken</Button>
        </div>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </DialogContent>
      {createPortal(<div className="room-qr-print" aria-hidden="true"><Label {...label} /></div>, document.body)}
    </>}
  </Dialog>;
}
