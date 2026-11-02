const clean = value => String(value ?? '').replace(/[\r\n\x00-\x1f*`_~]/g, ' ').slice(0, 200);
export function summarize(rows) {
  return Object.fromEntries(rows.map(row => [String(row.number), {
    number: row.number, title: clean(row.title), state: row.state,
    assignees: (row.assignees ?? []).map(a => a.login).sort(),
    merged: Boolean(row.merged_at),
  }]));
}
export function changes(previous, current, kind, repository) {
  if (!previous) return [];
  const messages = [];
  for (const [id, item] of Object.entries(current)) {
    const old = previous[id], prefix = kind === 'pull' ? 'Pull Request' : 'Aufgabe';
    let event;
    if (!old) event = item.merged ? 'zusammengeführt' : item.state === 'closed' ? 'geschlossen' : 'neu';
    else if (!old.merged && item.merged) event = 'zusammengeführt';
    else if (old.state !== item.state) event = item.state === 'closed' ? 'geschlossen' : 'wieder geöffnet';
    else if (JSON.stringify(old.assignees) !== JSON.stringify(item.assignees)) event = 'Zuweisung geändert';
    if (!event) continue;
    const url = `https://github.com/${repository}/${kind === 'pull' ? 'pull' : 'issues'}/${item.number}`;
    messages.push(`${prefix} ${event}: ${item.title}\nZuständig: ${item.assignees.map(clean).join(', ') || 'noch offen'}\n${url}`);
  }
  return messages;
}
export async function snapshot({ repository, token, allowPrivate = false, fetcher = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Ungültiges Repository.');
  async function get(path) {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'D21-project-bot', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub nicht verfügbar (HTTP ${response.status}); Zustand bleibt erhalten.`);
    return response.json();
  }
  const metadata = await get('');
  if (metadata.private && !allowPrivate) throw new Error('Private Repository-Meldungen sind nicht freigegeben.');
  async function list(path) {
    const rows = [];
    for (let page = 1; page <= 20; page++) {
      const items = await get(`${path}?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(items)) throw new Error('Ungültige GitHub-Antwort.');
      rows.push(...items);
      if (items.length < 100) return rows;
    }
    throw new Error('Repository zu groß für den Prototyp; keine unvollständige Momentaufnahme gespeichert.');
  }
  const issues = await list('/issues');
  const pulls = await list('/pulls');
  return { issues: summarize(issues.filter(row => !row.pull_request)), pulls: summarize(pulls) };
}
