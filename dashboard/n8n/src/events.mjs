// Also embedded in the n8n Code nodes by build.mjs; no network or filesystem access.
export function githubEvents(state, issues, pulls, now) {
  if (!Array.isArray(issues) || !Array.isArray(pulls)) throw new Error('GitHub-Antwort unvollständig; letzter Stand bleibt erhalten.');
  const previous = state.github;
  // Both endpoints are sorted by updated_at descending. Never silently lose a busy interval.
  for (const rows of [issues, pulls]) {
    if (rows.length >= 100 && (!previous || Date.parse(rows.at(-1).updated_at) >= Date.parse(previous.checkedAt))) {
      throw new Error('GitHub-Prüffenster überschritten (100 Einträge). Pagination ergänzen; Stand bleibt erhalten.');
    }
  }
  const current = {};
  const changes = [];
  for (const row of [...issues.filter(x => !x.pull_request), ...pulls]) {
    if (!Number.isInteger(row.number) || !['open', 'closed'].includes(row.state) || !Number.isFinite(Date.parse(row.updated_at))) {
      throw new Error('Ungültige GitHub-Daten; Stand bleibt erhalten.');
    }
    const kind = Object.hasOwn(row, 'merged_at') ? 'PR' : 'Aufgabe';
    const key = `${kind}:${row.number}`;
    const item = {
      number: row.number, kind, title: String(row.title || '').replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 200),
      state: row.state, merged: Boolean(row.merged_at),
      assignees: (row.assignees || []).map(x => x.login).sort(),
      url: `https://github.com/felixdoering05-prog/GST_Teamprojekt_Team_1/${kind === 'PR' ? 'pull' : 'issues'}/${row.number}`,
    };
    current[key] = item;
    const old = previous?.items[key];
    if (!previous) continue;
    const reasons = [];
    if (!old && Date.parse(row.created_at) > Date.parse(previous.checkedAt)) reasons.push('neu');
    if (old && old.state !== item.state) reasons.push(item.state === 'open' ? 'wieder geöffnet' : item.merged ? 'zusammengeführt' : 'geschlossen');
    if (old && !old.merged && item.merged && !reasons.includes('zusammengeführt')) reasons.push('zusammengeführt');
    if (old && JSON.stringify(old.assignees) !== JSON.stringify(item.assignees)) reasons.push('Zuständigkeit geändert');
    if (reasons.length) changes.push({ ...item, reasons, checkedAt: now });
  }
  // Bound persisted metadata. Absence from the recent window never means deletion.
  const merged = { ...(previous?.items || {}), ...current };
  const keys = Object.keys(merged);
  for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) if (!current[key]) delete merged[key];
  state.github = { checkedAt: now, items: merged };
  return changes.length ? changes : [{
    status: previous ? 'keine Änderungen' : 'Ausgangsstand gespeichert', checkedAt: now,
    tasks: issues.filter(x => !x.pull_request).length, pullRequests: pulls.length,
    note: 'Letzte 100 aktualisierte Einträge je Endpunkt; keine Kommentare, Dateiinhalte oder vollständige Ereignishistorie.',
  }];
}

export function healthEvent(state, internal, external, now) {
  const internalOK = internal?.statusCode === 200 && internal?.body?.status === 'ok';
  // The public project URL intentionally requires Basic authentication. A 401 is expected.
  const externalOK = external?.statusCode === 401;
  const healthy = internalOK && externalOK;
  const old = state.health;
  const gap = old ? Date.parse(now) - Date.parse(old.checkedAt) : 0;
  const result = {
    checkedAt: now, status: healthy ? 'erreichbar' : 'Störung',
    event: !old ? 'erste Prüfung' : old.healthy !== healthy ? healthy ? 'wieder erreichbar' : 'Störung erkannt' : healthy ? 'unverändert erreichbar' : 'Störung besteht weiter',
    internal: { ok: internalOK, statusCode: internal?.statusCode || null, error: internal?.error ? 'Verbindung fehlgeschlagen' : null },
    publicAccess: { ok: externalOK, statusCode: external?.statusCode || null, expected: 401, error: external?.error ? 'Verbindung fehlgeschlagen' : null },
    ...(gap > 5 * 60 * 1000 ? { monitoringGapMinutes: Math.round(gap / 60000), note: 'Prüflücke: n8n lief nicht durchgehend. Ursache und tatsächliche Ausfalldauer sind unbekannt.' } : {}),
  };
  state.health = { checkedAt: now, healthy };
  return result;
}
