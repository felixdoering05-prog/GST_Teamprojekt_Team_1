import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { issueLink, issuePriority, issueStatus, useIssueOverview } from '@/lib/buildingIssues';
import { formatDateTime } from '@/lib/dates';
import { request } from '@/api/base44Client';
import IFCModelFrame from '@/components/bim/IFCModelFrame';
import DashboardModel from './DashboardModel';
import { widgetTitles } from './WidgetBoard';
import { buildingScopeHeaders, useBuildingScope } from '@/hooks/useBuildingScope';
import { useBuildingModels } from '@/hooks/useBuildingModels';

function InteractivePreview({children,label}) {
  const [interactive,setInteractive]=useState(false);
  return <div className="space-y-2">
    <button type="button" aria-pressed={interactive} className="rounded-md border px-3 py-2 text-sm font-medium" onClick={()=>setInteractive(!interactive)}>
      {interactive?'Interaktion beenden':label+' bedienen'}
    </button>
    <div ref={node=>{if(node)node.inert=!interactive;}} className={interactive?'':'pointer-events-none'}>{children}</div>
  </div>;
}
function Widget({ title, children, link }) {
  return <section className="glass-card flex h-full min-h-0 min-w-0 flex-col space-y-3 overflow-hidden p-4 sm:p-5">
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <h3 className="font-semibold">{title}</h3>
      {link && <Link to={link} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Öffnen</Link>}
    </div>
    <div className="titan-widget-content min-h-0 flex-1">{children}</div>
  </section>;
}

export function IssueWidget({ id, filter = 'all' }) {
  const query = useIssueOverview();
  const title = widgetTitles[id];
  const rows = query.data?.issues || [];
  const filtered = filter === 'all' ? rows : rows.filter(issue => filter === 'done' ? issue.status === 'done' : issue.status !== 'done');
  const recent = id === 'activity' ? [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5) : filtered.slice(0, 5);
  const categories = id === 'priority' ? { ...issuePriority, unset: 'Nicht festgelegt' } : issueStatus;
  return <Widget title={title} link="/meldungen">
    {query.isError ? <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
      : query.isPending ? <p role="status" className="text-sm text-muted-foreground">Meldungen werden geladen …</p>
      : id === 'issues' || id === 'activity' ? <ul className="divide-y text-sm">
        {recent.map(issue => <li key={issue.id}><Link to={issueLink(issue)} className="block rounded py-2 hover:text-primary focus-visible:outline-ring">
          <span className="block break-words font-medium">{issue.title}</span>
          <span className="text-muted-foreground">{issue.building_name} · {id === 'activity' ? formatDateTime(issue.updated_at) : issueStatus[issue.status]}</span>
        </Link></li>)}
        {!recent.length && <li className="text-muted-foreground">Keine Meldungen vorhanden.</li>}
      </ul> : <dl className="space-y-2 text-sm">
        {Object.entries(categories).map(([key, label]) => <div key={key} className="flex justify-between gap-2">
          <dt>{label}</dt><dd className="font-semibold tabular-nums">{rows.filter(issue => id === 'priority' ? (issue.priority || 'unset') === key : issue.status === key).length}</dd>
        </div>)}
      </dl>}
    {query.data?.truncated && !query.isError && <p className="text-xs text-muted-foreground">Aus den neuesten 500 Meldungen</p>}
  </Widget>;
}

export function useWidgetBuildings() {
  const { user } = useAuth();
  const scope = useBuildingScope();
  const headers = buildingScopeHeaders(scope.readable('buildings'));
  return useQuery({ queryKey: ['widget-buildings', user?.id, scope.team?.id, headers['X-D21-Buildings']],
    queryFn: () => request('/buildings', { headers }), gcTime: 0, refetchOnWindowFocus: true });
}

export function BuildingsWidget({ buildings }) {
  return <Widget title="Gebäudeübersicht" link="/gebaeude">
    {buildings.isError ? <p role="alert" className="text-sm text-destructive">{buildings.error.message}</p>
      : buildings.isPending ? <p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>
      : <ul className="divide-y text-sm">{buildings.data.slice(0, 6).map(building => <li key={building.id} className="py-2">
        <span className="break-words font-medium">{building.name}</span>
        {building.address && <span className="block break-words text-muted-foreground">{building.address}</span>}
      </li>)}{!buildings.data.length && <li className="text-muted-foreground">Keine Gebäude vorhanden.</li>}</ul>}
  </Widget>;
}

export function ModelWidget({ buildingID }) {
  const scope = useBuildingScope();
  const buildings = scope.readable('bim');
  const building = buildingID ? buildings.find(item => String(item.id) === String(buildingID))
    : buildings.length === 1 ? buildings[0] : null;
  const { models, loading, error } = useBuildingModels(building ? [building] : []);
  const model = models[0];
  if (model?.campus) return <InteractivePreview label="Modell"><DashboardModel document={model} /></InteractivePreview>;
  return <Widget title={building?.name || 'BIM-Modell'} link="/bim-viewer">
    {model ? <InteractivePreview label="Modell"><IFCModelFrame key={model.id} document={model} presentation="dashboard" /></InteractivePreview>
      : <p role="status" className="text-sm text-muted-foreground">{loading ? 'Modell wird gesucht …' : error ? error.message
        : building || scope.building ? 'Für dieses Gebäude ist kein Modell hinterlegt.' : 'Wähle ein Gebäude für die Modellvorschau aus.'}</p>}
  </Widget>;
}

export function SystemWidget() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['widget-system', user?.id], queryFn: () => request('/profile/service-status'), gcTime: 0, refetchInterval: 30000 });
  return <Widget title="Systemstatus">
    <p role="status" className={query.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
      {query.isError ? 'Status konnte nicht abgerufen werden.' : query.isPending ? 'Status wird abgefragt …'
        : `Projektserver erreichbar · ${formatDateTime(query.data.checked_at)}`}
    </p>
  </Widget>;
}

export function MapWidget() {
  return <Widget title="Campuskarte" link="/heat-map">
    <InteractivePreview label="Karte"><IFCModelFrame document={{ id: 'campus-d21', name: 'Campus Darmstadt', campus: true, mapOnly: true }} presentation="dashboard" /></InteractivePreview>
  </Widget>;
}

export function LinksWidget() {
  return <Widget title="Schnellzugriffe">
    <ul className="space-y-2 text-sm font-medium text-primary">
      {[['/meldungen', 'Meldungen'], ['/gebaeude?start=1', 'Gebäude anlegen'], ['/bim-viewer', 'BIM-Viewer'], ['/daten', 'Einstellungen']].map(([path, label]) =>
        <li key={path}><Link to={path} className="underline-offset-4 hover:underline">{label}</Link></li>)}
    </ul>
  </Widget>;
}
