import { readFile, mkdir, writeFile } from 'node:fs/promises';
const source = (await readFile(new URL('./src/events.mjs', import.meta.url), 'utf8')).replaceAll('export function ', 'function ');
const node = (id, name, type, parameters, x, extra = {}) => ({ id, name, type: `n8n-nodes-base.${type}`, typeVersion: type === 'httpRequest' ? 4.2 : type === 'code' ? 2 : 1.2, position: [x, 200], parameters, ...extra });
const http = (id, name, url, x, health = false) => node(id, name, 'httpRequest', {
  url, sendHeaders: !health, ...(!health ? { headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }, { name: 'User-Agent', value: 'D21-n8n-project-monitor' }] } } : {}),
  options: { timeout: 10000, response: { response: { fullResponse: true, responseFormat: health && id === 'external' ? 'text' : 'json', neverError: health } } },
}, x, health ? { continueOnFail: true } : { retryOnFail: true, maxTries: 2, waitBetweenTries: 2000 });
const schedule = minutes => node('schedule', `Alle ${minutes} Minuten`, 'scheduleTrigger', { rule: { interval: [{ field: 'minutes', minutesInterval: minutes }] } }, 0);
function workflow(id, name, nodes, description) {
  const connections = {};
  nodes.slice(0, -1).forEach((n, i) => { connections[n.name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] }; });
  return { id, name, active: false, nodes, connections, settings: { executionOrder: 'v1', timezone: 'Europe/Berlin', executionTimeout: 90, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' }, meta: { description } };
}
const base = 'https://api.github.com/repos/felixdoering05-prog/GST_Teamprojekt_Team_1';
const github = workflow('D21GithubMonitor1', 'D21 · GitHub-Meldungen', [
  schedule(5),
  http('issues', 'Aufgaben lesen', `${base}/issues?state=all&sort=updated&direction=desc&per_page=100`, 240),
  http('pulls', 'Pull Requests lesen', `${base}/pulls?state=all&sort=updated&direction=desc&per_page=100`, 480),
  node('events', 'GitHub-Meldungen speichern', 'code', { jsCode: `${source}\nconst result = githubEvents($getWorkflowStaticData('global'), $('Aufgaben lesen').first().json.body, $('Pull Requests lesen').first().json.body, new Date().toISOString());\nreturn result.map(json => ({ json }));` }, 720),
], 'Öffentliche Metadaten, nur lesend; Ausgangsstand ohne historische Meldungsflut. Ergebnisse unter Executions.');
const health = workflow('D21HealthMonitor1', 'D21 · Website-Erreichbarkeit', [
  schedule(2),
  http('internal', 'App intern prüfen', 'http://web/api/health', 240, true),
  http('external', 'Öffentlichen Zugang prüfen', 'https://filling-vendor-verification-hop.trycloudflare.com/', 480, true),
  node('status', 'Prüfergebnis speichern', 'code', { jsCode: `${source}\nreturn [{ json: healthEvent($getWorkflowStaticData('global'), $('App intern prüfen').first().json, $('Öffentlichen Zugang prüfen').first().json, new Date().toISOString()) }];` }, 720),
], 'Interner nginx/API-Check + öffentlicher HTTPS-Eingang (401 erwartet). Kein unabhängiger externer Ausfallmelder.');
await mkdir(new URL('./workflows/', import.meta.url), { recursive: true });
for (const [file, data] of [['github.json', github], ['health.json', health]]) await writeFile(new URL(`./workflows/${file}`, import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
