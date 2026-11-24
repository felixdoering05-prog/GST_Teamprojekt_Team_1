import { createContext, useContext, useEffect, useState } from 'react';
import { request } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { rememberLanguage, storedLanguage } from '@/lib/i18n';

const AppearanceContext = createContext(null);
const defaults = { theme: 'system', font_scale: 100, dashboard_layout: null, language: null, revision: 0 };
const storageKey = id => `titan-fs:appearance:${id}`;
const route = '/profile/ui?view=appearance';
const patchPreferences = (fields, revision) => request(route, { method: 'PATCH', body: { ...fields, revision } });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function readFallback(id) {
  try { return JSON.parse(localStorage.getItem(storageKey(id))) || defaults; }
  catch { return defaults; }
}

function writeFallback(id, value) {
  try { localStorage.setItem(storageKey(id), JSON.stringify(value)); }
  catch { /* Storage can be disabled. The account still holds the preferences. */ }
}

export function AppearanceProvider({ children }) {
  const { user } = useAuth();
  return <AccountAppearance key={user?.id || 'guest'} id={user?.id}>{children}</AccountAppearance>;
}

function AccountAppearance({ id, children }) {
  const [value, setValue] = useState(() => id ? readFallback(id) : defaults);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = value.theme === 'system' ? (dark ? 'dark' : 'light') : value.theme;

  useEffect(() => {
    if (!id) return;
    let active = true;
    request(route).then(async result => {
      if (!active) return;
      const pending = readFallback(id).pending;
      const remote = { ...defaults, ...result };
      if (pending) {
        const keys = Object.keys(pending.fields);
        if (keys.some(key => !equal(remote[key], pending.baseline[key]) && !equal(remote[key], pending.fields[key]))) {
          setError('Auf einem anderen Gerät geändert. Prüfe die aktuelle Einstellung.');
        } else if (keys.some(key => !equal(remote[key], pending.fields[key]))) {
          const updated = await patchPreferences(pending.fields, remote.revision);
          if (!active) return;
          const next = { ...defaults, ...updated };
          setValue(next);
          writeFallback(id, next);
          return;
        }
      }
      setValue(remote);
      writeFallback(id, remote);
      // Hat das Konto eine Sprache gewählt, gilt sie auf jedem Gerät.
      if (remote.language && remote.language !== storedLanguage()) {
        rememberLanguage(remote.language);
        window.location.reload();
      }
    }).catch(() => {
      if (active) setError('Kontoeinstellungen konnten nicht abgeglichen werden. Erneut speichern, sobald eine Verbindung besteht.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.fontSize = `${value.font_scale}%`;
  }, [resolvedTheme, value.font_scale]);

  async function save(fields) {
    if (!id || loading || busy) return false;
    setBusy(true);
    setError('');
    const changes = { ...value.pending?.fields, ...fields };
    const baseline = { ...Object.fromEntries(Object.keys(fields).map(key => [key, value[key]])), ...value.pending?.baseline };
    try {
      let result;
      try { result = await patchPreferences(changes, value.revision); }
      catch (failure) {
        if (failure.status !== 409) throw failure;
        const latest = await request(route);
        if (Object.keys(changes).some(key => !equal(latest[key], baseline[key]) && !equal(latest[key], changes[key]))) {
          const server = { ...defaults, ...latest };
          setValue(server);
          writeFallback(id, server);
          setError('Auf einem anderen Gerät geändert. Prüfe die aktuelle Einstellung und speichere erneut.');
          return false;
        }
        result = await patchPreferences(changes, latest.revision);
      }
      const next = { ...defaults, ...result };
      setValue(next);
      writeFallback(id, next);
      return true;
    } catch (failure) {
      if (!failure.status || failure.status >= 500) {
        const local = { ...value, ...changes, pending: { fields: changes, baseline } };
        setValue(local);
        writeFallback(id, local);
        setError('Nur auf diesem Gerät gespeichert. Bitte mit Verbindung erneut speichern.');
      } else {
        setError(failure.message);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  return <AppearanceContext.Provider value={{ value, loading, busy, error, resolvedTheme, save }}>{children}</AppearanceContext.Provider>;
}

export const useAppearance = () => useContext(AppearanceContext);
