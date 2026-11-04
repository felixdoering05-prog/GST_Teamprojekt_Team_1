import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { request } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function AISettingsCard() {
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; request('/profile/ai').then(v => { if (live) setValue(v); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  const change = async () => {
    if (!value || busy) return;
    setBusy(true); setError('');
    try { setValue(await request('/profile/ai', { method: 'PATCH', body: { enabled: !(value.enabled && value.policy_version === 1), device_control_enabled: !(value.enabled && value.policy_version === 1), revision: value.revision, policy_version: 1 } })); }
    catch (e) { setError(e.message); try { setValue(await request('/profile/ai')); } catch { setValue(null); } }
    finally { setBusy(false); }
  };
  const active = value?.enabled && value?.policy_version === 1;
  return <section className="surface space-y-3 p-5">
    <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5" /> KI und Sprache für mein Konto</h2>
    <p className="text-sm text-muted-foreground">Einmal aktivieren – auf dem Server gespeichert, auch für die iPhone-App. KI wird erst bei einer bewusst gestarteten Anfrage verwendet.</p>
    <Button onClick={change} disabled={!value || busy} variant={active ? 'outline' : 'default'}>{busy ? 'Wird gespeichert …' : active ? 'KI deaktivieren' : 'KI und Sprache aktivieren'}</Button>
    <span role="status" className="ml-3 text-sm">{value ? active ? 'Aktiviert' : 'Deaktiviert' : 'Einstellung wird geladen …'}</span>
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Daten, Anbieter und Grenzen</summary><p className="mt-2">Google Gemini erhält Frage, begrenzte KI-Historie und Gebäudekontext (Name/Adresse, Dateinamen, IFC-Typzahlen oder ausgewählte Messwertaggregate). ElevenLabs erhält beim Live-Gespräch Audio, Gebäudename, Namen der freigegebenen Lampen und Räume und zehn Dateinamen. Keine automatischen Datei-Inhalte, Geometrie, Kontakte oder Team-Chats. Anbieterbedingungen gelten; ElevenLabs: keine Audioaufzeichnung, Verlauf ein Tag. Maximal zwei Minuten pro Gespräch; gemeinsame Kontingente. Kein Training eines eigenen Modells. Deaktivieren sperrt neue Anfragen sofort, die App beendet laufende Gespräche bei der nächsten Prüfung (etwa fünf Sekunden). Bereits übertragene Daten werden nicht zurückgerufen. Die Freigabe erlaubt ausdrücklich angeforderte Schalt-, Farb- und Dimmaufträge für deine verbundenen Lampen im gewählten Gebäude. Ergebnisse werden durch Home Assistant bestätigt.</p></details>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
