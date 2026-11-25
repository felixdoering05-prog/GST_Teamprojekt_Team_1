import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { useAppearance } from '@/lib/Appearance';

// Experimentelle WLAN-Präsenz (RuView). Standardmäßig aus; ohne Aktivierung
// erscheint nirgends etwas und der Server nimmt keine Präsenzdaten an.
export default function RuViewSettingsCard() {
  const { value, loading, busy, error, save } = useAppearance();
  const [saved, setSaved] = useState(false);
  const enabled = Boolean(value.ruview_enabled);

  return <section className="surface space-y-3 p-5" aria-labelledby="ruview-title">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold" id="ruview-title">WLAN-Präsenz (RuView) · experimentell</h2>
        <p className="text-sm text-muted-foreground">
          ESP32-Knoten erkennen über Veränderungen im WLAN-Signal, ob jemand im Raum ist, wie stark sich etwas bewegt und
          ungefähr die Atemfrequenz – ohne Kamera. Eine Brücke im Heimnetz sendet nur diese Ergebnisse, nie Rohdaten.
        </p>
        <p className="text-xs text-muted-foreground">
          Die Werte sind Schätzungen, kein Medizinprodukt und kein Ersatz für Rauch-, Sturz- oder Notrufsysteme.
          Der Verlauf wird nach 24 Stunden gelöscht. Beim Ausschalten nimmt der Server keine neuen Präsenzdaten mehr an.
        </p>
      </div>
      <Switch checked={enabled} disabled={loading || busy} aria-labelledby="ruview-title"
        onCheckedChange={async checked => setSaved(await save({ ruview_enabled: checked }))} />
    </div>
    {enabled && <p className="text-sm">Aktiv. Brücken und Knoten findest du unter <Link className="underline" to="/sensorik">Sensorik</Link>.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && !error && <p role="status" className="text-sm text-muted-foreground">Im Konto gespeichert</p>}
  </section>;
}
