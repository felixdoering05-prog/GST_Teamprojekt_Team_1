import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/lib/Appearance';
import { LANGUAGES, rememberLanguage, storedLanguage } from '@/lib/i18n';

export default function AppearanceCard() {
  const { value, loading, busy, error, save } = useAppearance();
  const [saved, setSaved] = useState(false);
  async function update(fields) { setSaved(await save(fields)); }
  // Die Sprache gilt sofort: im Konto speichern, im Browser merken, Seite neu laden.
  async function changeLanguage(language) {
    const ok = await save({ language });
    if (!ok) { setSaved(false); return; }
    rememberLanguage(language);
    window.location.reload();
  }

  return <section className="surface space-y-4 p-5" aria-labelledby="appearance-title">
    <h2 className="text-lg font-semibold" id="appearance-title">Darstellung</h2>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-medium">Sprache
        <select className="titan-select" value={value.language || storedLanguage()} disabled={loading || busy}
          onChange={event => changeLanguage(event.target.value)} translate="no">
          {LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Designmodus
        <select className="titan-select" value={value.theme} disabled={loading || busy}
          onChange={event => update({ theme: event.target.value })}>
          <option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Schriftgröße
        <select className="titan-select" value={value.font_scale} disabled={loading || busy}
          onChange={event => update({ font_scale: Number(event.target.value) })}>
          <option value="90">Klein · 90 %</option><option value="100">Standard · 100 %</option>
          <option value="115">Groß · 115 %</option><option value="130">Sehr groß · 130 %</option>
        </select>
      </label>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {error && <Button variant="outline" disabled={busy || loading}
      onClick={() => update({ theme: value.theme, font_scale: value.font_scale, language: value.language || storedLanguage() })}>Erneut speichern</Button>}
    {saved && !error && <p role="status" className="text-sm text-muted-foreground">Im Konto gespeichert</p>}
  </section>;
}
