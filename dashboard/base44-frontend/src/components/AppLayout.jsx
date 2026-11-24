import { useQuery } from '@tanstack/react-query';
import { BuildingScopeContext } from '@/hooks/useBuildingScope';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BellRing,
  Boxes,
  BrainCircuit,
  Building2,
  CalendarClock,
  Database,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Radio,
  ShieldCheck,
  X,
  Zap,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { request, base44 } from '@/api/base44Client';

const NAV_GROUPS = [
  {
    label: 'Gebäude',
    items: [
      { path: '/', label: 'Kommandozentrale', icon: LayoutDashboard, end: true, module: 'overview', hint: 'Gebäudeübersicht, Kennzahlen und Raumzustände' },
      { path: '/gebaeude', label: 'Gebäude', icon: Building2, module: 'buildings', hint: 'Gebäude, Bilder, Pläne und Räume verwalten' },
      { path: '/dokumente', label: 'Dokumente', icon: Database, module: 'documents', hint: 'Unterlagen im ausgewählten Gebäude suchen und öffnen' },
      { path: '/bim-viewer', label: 'BIM-Viewer', icon: Boxes, module: 'bim', hint: 'IFC-Modelle vom Projektserver in 3D öffnen und Bauteile erkunden' },
      { path: '/heat-map', label: 'Heat Map', icon: Flame, module: 'bim', hint: 'Raumtemperaturen im Gebäude und Wärmeverteilung auf dem Campus' },
    ],
  },
  {
    label: 'Auswertung',
    items: [
      { path: '/assistent', label: 'Gebäude-Assistent', icon: MessageSquareText, module: 'assistant', hint: 'Fragen zu freigegebenen Gebäudedaten stellen' },
      { path: '/sensorik', label: 'Sensorik', icon: Radio, module: 'sensors', hint: 'Temperatur, CO₂ und Luftfeuchtigkeit je Raum' },
      { path: '/energie', label: 'Energie', icon: Zap, module: 'energy', hint: 'Energieverbrauch und Auswertungen' },
      { path: '/analyse', label: 'KI-Analyse', icon: BrainCircuit, module: 'analysis', hint: 'Auffälligkeiten, Trends und mögliche Ursachen' },
    ],
  },
  {
    label: 'Betrieb',
    items: [
      { path: '/betrieb/technische-anlagen', label: 'Technische Anlagen', icon: Boxes, module: 'maintenance', hint: 'Anlagen und zugehörige Wartungen im Gebäude' },
      { path: '/betrieb/wartungen', label: 'Wartungen', icon: CalendarClock, module: 'maintenance', hint: 'Fälligkeiten, Bearbeitung und Wartungshistorie' },
      { path: '/issues', label: 'Issues und Mängel', icon: MessageSquareText, module: 'issues', hint: 'Gebäudemängel erfassen und bearbeiten' },
      { path: '/meldungen', label: 'Meldungen', icon: BellRing, module: 'issues', hint: 'Mobile Gebäudemeldungen und Sensorwarnungen' },
      { path: '/zeitplanung', label: 'Kalender', icon: CalendarClock, module: 'schedule', hint: 'Gebäudebezogene Termine, Wartungen und Aufgaben koordinieren' },
    ],
  },
  {
    label: 'Team & Einstellungen',
    items: [
      { path: '/teams', label: 'Dein Team', icon: Users, hint: 'Teammitglieder, Einladungen, Titel und Gebäudegruppen verwalten' },
      { path: '/rechte', label: 'Rechte', icon: ShieldCheck, module: 'teamRights', hint: 'Mitglieder, Rollen und Berechtigungen verwalten' },
      { path: '/daten', label: 'Daten & Einstellungen', icon: Database, module: 'settings', hint: 'Datenimport, Export und Konfiguration' },
    ],
  },
];

const ADMIN_NAV = { path: '/verwaltung', label: 'Serververwaltung', icon: ShieldCheck, hint: 'Serverkapazität, API-Nutzung und Konten' };
const ALL_NAV = [...NAV_GROUPS.flatMap((group) => group.items), ADMIN_NAV];

function NavItems({ onNavigate, isAdmin, permissions, hiddenPaths }) {
  return (
    <nav aria-label="Hauptnavigation" className="space-y-4 px-3">
      {NAV_GROUPS.map((group) => {
        const items=group.items.filter(item=>!hiddenPaths.has(item.path)).filter(item=>item.module==='teamRights'?permissions?.teamRights===true:!item.module||permissions[item.module]!=='none');
        return items.length>0&&(
        <div key={group.label}>
          <p className="shell-nav-heading">{group.label}</p>
          <div className="flex flex-col gap-0.5">
      {[...items, ...(group.label === 'Team & Einstellungen' && isAdmin ? [ADMIN_NAV] : [])].map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onNavigate}
            title={item.hint}
            className={({ isActive }) =>
              cn(
                'shell-nav-link group relative flex min-h-10 items-center gap-3 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive && 'shell-nav-link-active',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'shell-nav-icon')} />
                <span className="truncate">{item.label}</span>
                {isActive && <span className="shell-active-dot ml-auto" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        );
      })}
          </div>
        </div>
      );})}
    </nav>
  );
}

function SidebarBody({ onNavigate, scope, activeTeam, teams, teamID, onTeam }) {
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    request('/admin/me').then(data=>setIsAdmin(data.admin)).catch(()=>setIsAdmin(false));
    base44.auth
      .me()
      .then((u) => setEmail(u?.email || ''))
      .catch(() => setEmail(''));
  }, []);

  return (
    <div className="shell-sidebar-body flex h-full flex-col">
      <div className={`flex pb-6 pt-7 px-5 ${activeTeam?.has_logo ? 'flex-col items-center gap-2' : 'items-center gap-3'}`}>
        {!activeTeam?.has_logo && <span className="shell-brand-icon grid h-10 w-10 shrink-0 place-items-center rounded-2xl"><Boxes className="h-[18px] w-[18px]" /></span>}
        <div className={`${activeTeam?.has_logo ? 'flex items-center justify-center gap-3' : 'min-w-0'}`}>
          {activeTeam?.has_logo && <span className="shell-brand-icon grid h-10 w-10 shrink-0 place-items-center rounded-2xl"><Boxes className="h-[18px] w-[18px]" /></span>}
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">Nala Solutions</p>
            {!activeTeam?.has_logo && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Hochschule Darmstadt</p>}
          </div>
        </div>
        {activeTeam?.has_logo && <TeamLogo id={activeTeam.id} name={activeTeam.name} />}
      </div>

      {activeTeam && <div className="space-y-3 px-5 pb-4">
        <TeamSwitcher wide teams={teams} teamID={teamID} onChange={onTeam} />
        <label className="grid gap-1 text-xs font-medium">
          Gebäude oder Gebäudegruppe
          <select className="w-full rounded-xl border border-border bg-background px-3 py-2"
            value={scope.value} onChange={event => { scope.choose(event.target.value); onNavigate?.(); }}>
            <option value="all">Alle Gebäude</option>
            <optgroup label="Gebäudegruppen">
              {scope.groups.map(group => <option key={group.id} value={'group:' + group.id}>{group.name}</option>)}
            </optgroup>
            <optgroup label="Gebäude">
              {activeTeam.buildings.map(building => <option key={building.id} value={'building:' + building.id}>{building.name}</option>)}
            </optgroup>
          </select>
        </label>
      </div>}
      <div className="shell-divider mx-5 mb-2 h-px" />
      <div className="sidebar-scroll flex-1 overflow-y-auto pb-5 pt-5">
        <NavItems isAdmin={isAdmin} onNavigate={onNavigate} permissions={scope.permissions} hiddenPaths={scope.hiddenPaths} />
      </div>

      <div className="shell-account border-t px-4 py-3" title="Datenquelle: Projektserver · eigene Daten">
        {email ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 truncate text-[10px] text-muted-foreground"><Database className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />{email}</span>
            <button
              type="button"
              onClick={() => base44.auth.logout('/login')}
              title="Abmelden"
              aria-label="Abmelden"
              className="shell-icon-button grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeamLogo({id,name}){const [src,setSrc]=useState('');useEffect(()=>{let active=true,objectURL='';request('/teams/'+id+'/logo',{raw:true}).then(blob=>{objectURL=URL.createObjectURL(blob);if(active)setSrc(objectURL)}).catch(()=>{});return()=>{active=false;if(objectURL)URL.revokeObjectURL(objectURL)}},[id]);return src?<div className="-mx-5 flex h-24 w-[calc(100%+2.5rem)] items-center justify-center"><img src={src} alt={'Logo '+name} className="h-full max-w-full object-contain object-center"/></div>:null;}
function hexHsl(hex){const n=parseInt(String(hex||'#596b3d').slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return Math.round(h)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';}

function TeamSwitcher({teams,teamID,onChange,wide=false}){
  if(!teams?.length)return null;
  const width=wide?'w-full':'max-w-48';
  if(teams.length===1)return <span className={`glass-pill ${width} block truncate px-3 py-2 text-xs font-medium`} title={teams[0].name}>{teams[0].name}</span>;
  return <select aria-label="Team auswählen" className={`${width} rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium`} value={teamID} onChange={event=>onChange(event.target.value)}>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select>;
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const current = ALL_NAV.find((n) => (n.end ? n.path === location.pathname : location.pathname.startsWith(n.path))) || ALL_NAV[0];
  const [teamID, setTeamID] = useState(() => localStorage.getItem('d21-selected-team') || '');
  const [selection, setSelection] = useState(() => localStorage.getItem('d21-building-scope:' + teamID) || 'all');
  const teamQuery = useQuery({ queryKey: ['teams'], queryFn: () => request('/teams') });
  const teams = teamQuery.data || [];
  const activeTeam = teams.find(row => String(row.id) === teamID);
  function chooseTeam(id) {
    localStorage.setItem('d21-selected-team', id);
    setTeamID(id);
    setSelection(localStorage.getItem('d21-building-scope:' + id) || 'all');
  }
  useEffect(() => {
    if (teamQuery.isSuccess && !activeTeam && teams.length) chooseTeam(String(teams[0].id));
  }, [teamQuery.isSuccess, activeTeam, teams]);
  useEffect(() => {
    for (const [property, color] of [
      ['--primary', activeTeam?.primary_color], ['--ring', activeTeam?.primary_color],
      ['--sidebar-primary', activeTeam?.primary_color], ['--accent', activeTeam?.accent_color],
      ['--team-background', activeTeam?.background_color],
    ]) {
      if (color) document.documentElement.style.setProperty(property, hexHsl(color));
      else document.documentElement.style.removeProperty(property);
    }
  }, [activeTeam]);

  const groupQuery = useQuery({
    queryKey: ['building-groups', teamID],
    queryFn: () => request('/teams/' + teamID + '/groups'),
    enabled: !!activeTeam,
  });
  const groups = (groupQuery.data || []).filter(group => group.buildings.length);
  const group = groups.find(row => selection === 'group:' + row.id);
  const single = activeTeam?.buildings.find(row => selection === 'building:' + row.id);
  const value = single || group ? selection : 'all';
  const buildings = single ? [single] : group ? group.buildings : activeTeam?.buildings || [];
  const navigation = useQuery({
    queryKey: ['building-navigation', teamID],
    queryFn: () => request('/teams/' + teamID + '/building-navigation'),
    enabled: !!activeTeam,
  });
  const accessByBuilding = new Map((navigation.data || []).map(row => [String(row.id), row]));
  function readable(module) {
    return buildings.filter(building => {
      const access = accessByBuilding.get(String(building.id));
      const level = access?.permissions?.[module];
      return access?.is_owner || level === 'read' || level === 'edit';
    });
  }
  function showContent(module, ...categories) {
    return readable(module).some(building => {
      const access = accessByBuilding.get(String(building.id));
      return access.is_owner || access.permissions[module] === 'edit'
        || categories.some(category => access.content[category]);
    });
  }
  const permissions = Object.fromEntries(ALL_NAV.filter(item => item.module).map(item =>
    [item.module, readable(item.module).length ? 'read' : 'none']));
  const hiddenPaths = new Set([
    ['/sensorik', showContent('sensors', 'sensors')],
    ['/energie', showContent('energy', 'energy')],
    ['/betrieb/technische-anlagen', showContent('maintenance', 'assets')],
    ['/betrieb/wartungen', showContent('maintenance', 'maintenance')],
    ['/issues', showContent('issues', 'issues')],
    ['/meldungen', showContent('issues', 'issues', 'alerts')],
    ['/zeitplanung', showContent('schedule', 'schedule')],
  ].filter(([, visible]) => !visible).map(([path]) => path));
  permissions.teamRights = !!(activeTeam?.is_owner || activeTeam?.can_manage_groups);
  // The building overview remains the entry point for creating the first building.
  if (activeTeam?.is_owner && !activeTeam.buildings.length) permissions.buildings = 'read';
  const ready = teamQuery.isSuccess && (!teams.length || !!activeTeam)
    && (!selection.startsWith('group:') || !groupQuery.isPending || !activeTeam)
    && (!activeTeam || !navigation.isPending);
  const scopeError = navigation.error || (selection.startsWith('group:') ? groupQuery.error : null);
  const scope = {
    value, groups, readable, permissions, hiddenPaths,
    choose(next) {
      localStorage.setItem('d21-building-scope:' + teamID, next);
      setSelection(next);
      const params = new URLSearchParams(location.search);
      for (const key of ['building', 'unit', 'offset', 'issue', 'asset', 'task']) params.delete(key);
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    },
  };
  const forbidden = current.module === 'teamRights' ? !permissions.teamRights
    : hiddenPaths.has(current.path) || (current.module && permissions[current.module] === 'none');
  const fallback = ALL_NAV.find(item => !item.module || permissions[item.module] === 'read');

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <div className="glass-app min-h-screen">
      <a href="#main-content" className="sr-only z-[60] rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Zum Inhalt springen</a>
      <aside className="shell-sidebar fixed z-40 hidden lg:block">
        <SidebarBody scope={scope} activeTeam={activeTeam} teams={teams} teamID={teamID} onTeam={id=>{chooseTeam(id);window.location.assign(location.pathname);}}/>
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="shell-dialog-overlay fixed inset-0 z-50 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} className="shell-drawer fixed z-50">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Menü schließen" className="shell-icon-button absolute right-1 top-1 z-10 grid h-10 w-10 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <SidebarBody scope={scope} activeTeam={activeTeam} teams={teams} teamID={teamID} onTeam={id=>{chooseTeam(id);window.location.assign(location.pathname);}} onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>

      <div className="shell-workspace">
        <header className="shell-header sticky top-0 z-30 px-4 pb-3 pt-4 sm:px-6 lg:hidden">
          <div className="shell-header-inner mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-4">
            <Dialog.Trigger
              type="button"
              aria-label="Menü öffnen"
              className="shell-icon-button grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Dialog.Trigger>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-sm font-semibold text-foreground sm:text-base">{current.label}</h1>
              <p className="hidden truncate text-[10px] text-muted-foreground sm:block">{current.hint}</p>
            </div>

            <TeamSwitcher teams={teams} teamID={teamID} onChange={id=>{chooseTeam(id);window.location.assign(location.pathname);}}/>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 pb-7 pt-2 focus:outline-none sm:px-6 sm:pb-9 lg:px-7 lg:pt-7">
          {(teamQuery.isError || scopeError) ? <p role="alert">{(teamQuery.error || scopeError).message}</p>
            : !ready ? <p role="status">Gebäudezugriff wird geladen …</p>
            : forbidden ? <Navigate to={fallback.path} replace />
            : <BuildingScopeContext.Provider value={scope} key={[teamID, value, ...buildings.map(building => building.id)].join('/')}>
                <Outlet />
              </BuildingScopeContext.Provider>}
        </main>
      </div>
      </Dialog.Root>
    </div>
  );
}
