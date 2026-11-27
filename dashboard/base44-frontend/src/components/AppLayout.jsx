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
import { useAuth } from '@/lib/AuthContext';
import { canUseBuilding, clearBuildingParameters, linkedBuildingTeam, resolveBuildingScope } from '@/lib/buildingScope';
import ProjectLogo from './ProjectLogo';

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
      { path: '/meldungen', label: 'Meldungen', icon: BellRing, module: 'issues', hint: 'Gebäudemängel und Sensorwarnungen' },
      { path: '/kalender', label: 'Kalender', icon: CalendarClock, module: 'schedule', hint: 'Gebäudebezogene Termine, Wartungen und Aufgaben koordinieren' },
    ],
  },
  {
    label: 'Team & Einstellungen',
    items: [
      { path: '/teams', label: 'Teams', icon: Users, hint: 'Teammitglieder, Einladungen, Titel und Gebäudegruppen verwalten' },
      { path: '/rechte', label: 'Rechte', icon: ShieldCheck, module: 'teamRights', hint: 'Mitglieder, Rollen und Berechtigungen verwalten' },
      { path: '/daten', label: 'Daten & Einstellungen', icon: Database, hint: 'Datenimport, Export und persönliche Einstellungen' },
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
      <div className={`flex px-5 pb-5 pt-6 ${activeTeam?.has_logo ? 'flex-col items-center gap-2' : 'items-center'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <ProjectLogo className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">Nala Solutions</p>
            {!activeTeam?.has_logo && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Hochschule Darmstadt</p>}
          </div>
        </div>
        {activeTeam?.has_logo && <TeamLogo key={activeTeam.id} id={activeTeam.id} name={activeTeam.name} />}
      </div>

      {activeTeam && <div className="space-y-3 px-5 pb-4">
        <TeamSwitcher wide teams={teams} teamID={teamID} onChange={onTeam} />
        <ScopeSwitcher scope={scope} onChange={onNavigate} />
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

function TeamLogo({ id, name }) {
  const [src, setSrc] = useState('');
  const logo = useQuery({ queryKey: ['team-logo', id], queryFn: () => request('/teams/' + id + '/logo', { raw: true }), retry: false });
  useEffect(() => {
    if (!logo.data) return;
    const url = URL.createObjectURL(logo.data);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [logo.data]);
  return src ? <div className="-mx-5 flex h-24 w-[calc(100%+2.5rem)] items-center justify-center">
    <img src={src} alt={'Logo ' + name} className="h-full max-w-full object-contain object-center" />
  </div> : null;
}
function hexHsl(hex){const n=parseInt(String(hex||'#596b3d').slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return Math.round(h)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';}

function TeamSwitcher({teams,teamID,onChange,wide=false}){
  if(!teams?.length)return null;
  const width=wide?'w-full':'max-w-48';
  if(teams.length===1)return <span className={`glass-pill ${width} block truncate px-3 py-2 text-xs font-medium`} title={teams[0].name}>{teams[0].name}</span>;
  return <select aria-label="Team auswählen" className={`${width} rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium`} value={teamID} onChange={event=>onChange(event.target.value)}>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select>;
}

function ScopeSwitcher({ scope, onChange }) {
  return <label className="relative block min-w-0">
    <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
    <select aria-label="Gebäude oder Gebäudegruppe auswählen" className="min-h-10 w-full cursor-pointer truncate rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm font-medium focus-visible:outline-primary"
      value={scope.value} title={scope.label}
      onChange={event => { scope.choose(event.target.value); onChange?.(); }}>
      <option value="all">Alle Gebäude</option>
      {scope.groups.length > 0 && <optgroup label="Gebäudegruppen">
        {scope.groups.map(group => <option key={group.id} value={'group:' + group.id}>{group.name}</option>)}
      </optgroup>}
      <optgroup label="Gebäude">
        {scope.team.buildings.map(building => <option key={building.id} value={'building:' + building.id}>{building.name}</option>)}
      </optgroup>
    </select>
  </label>;
}

const scopeStorageKey = teamID => 'd21-building-scope:' + teamID;

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const route = location.pathname.replace(/\/+$/, '') || '/';
  const pathname = route === '/issues' ? '/meldungen' : route;
  const current = ALL_NAV.find(n => n.path === pathname || (!n.end && pathname.startsWith(n.path + '/'))) || ALL_NAV[0];
  const params = new URLSearchParams(location.search);
  const linkedID = current.module ? params.get('building') ?? (current.module === 'issues' ? params.get('building_id') : null) : null;
  const isRoomCard = route === '/gebaeude' && params.get('karte') === '1';
  const roomID = isRoomCard ? params.get('room') : null;
  const [teamID, setTeamID] = useState(() => localStorage.getItem('d21-selected-team') || '');
  const [selection, setSelection] = useState(() => localStorage.getItem(scopeStorageKey(teamID)) || 'all');
  const teamQuery = useQuery({ queryKey: ['teams'], queryFn: () => request('/teams') });
  const teams = teamQuery.data || [];
  const activeTeam = teams.find(row => String(row.id) === teamID);
  function chooseTeam(id) {
    localStorage.setItem('d21-selected-team', id);
    setTeamID(id);
    setSelection(localStorage.getItem(scopeStorageKey(id)) || 'all');
  }
  function changeTeam(id) {
    chooseTeam(id);
    navigate({ pathname: location.pathname, search: clearBuildingParameters(location.search).toString() }, { replace: true });
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

  const linkedTeam = linkedBuildingTeam(teams, activeTeam, linkedID);
  const linkedTeamID = linkedTeam ? String(linkedTeam.id) : '';
  const navigation = useQuery({
    queryKey: ['building-navigation', teamID],
    queryFn: () => request('/teams/' + teamID + '/building-navigation'),
    enabled: !!activeTeam,
  });
  const otherNavigation = useQuery({
    queryKey: ['building-navigation', linkedTeamID],
    queryFn: () => request('/teams/' + linkedTeamID + '/building-navigation'),
    enabled: !!linkedTeamID && linkedTeamID !== teamID,
  });
  const linkedNavigation = linkedTeamID === teamID ? navigation : otherNavigation;
  const linkedAccess = linkedNavigation.data?.find(row => String(row.id) === linkedID);
  const linkedAllowed = !!linkedAccess && (current.module === 'teamRights'
    ? (linkedTeam.is_owner || linkedTeam.can_manage_groups)
    : canUseBuilding(linkedAccess, current.module));
  const mayReadRoom = linkedAllowed && canUseBuilding(linkedAccess, 'structure');
  const lookupRoom = isRoomCard && mayReadRoom && /^[A-Za-z0-9_-]{1,100}$/.test(roomID || '');
  const roomCard = useQuery({
    queryKey: ['room-card', user.id, linkedTeamID, linkedID, roomID],
    queryFn: () => request(`/buildings/${linkedID}/structure/rooms/${roomID}`, {
      headers: { 'X-D21-Team': linkedTeamID },
    }),
    enabled: lookupRoom,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
  const linkedValue = linkedAllowed && (!isRoomCard || (lookupRoom && roomCard.isSuccess)) ? 'building:' + linkedID : null;
  useEffect(() => {
    if (!linkedValue) return;
    if (linkedTeamID !== teamID) {
      localStorage.setItem('d21-selected-team', linkedTeamID);
      setTeamID(linkedTeamID);
    }
    localStorage.setItem(scopeStorageKey(linkedTeamID), linkedValue);
    setSelection(linkedValue);
  }, [linkedTeamID, linkedValue, teamID]);

  const groupQuery = useQuery({
    queryKey: ['building-groups', teamID],
    queryFn: () => request('/teams/' + teamID + '/groups'),
    enabled: !!activeTeam,
  });
  const groups = (groupQuery.data || []).filter(group => group.buildings.length);
  const resolved = resolveBuildingScope(activeTeam, groups, linkedTeamID === teamID && linkedValue ? linkedValue : selection);
  const accessByBuilding = new Map((navigation.data || []).map(row => [String(row.id), row]));
  function can(buildingID, module, action) {
    return canUseBuilding(accessByBuilding.get(String(buildingID)), module, action);
  }
  function readable(module, { team = false } = {}) {
    const buildings = team ? activeTeam?.buildings ?? [] : resolved.buildings;
    return buildings.filter(building => can(building.id, module));
  }
  function showContent(module, ...categories) {
    return readable(module).some(building => {
      const access = accessByBuilding.get(String(building.id));
      return access.is_owner || access.permissions[module] === 'edit'
        || categories.some(category => access.content?.[category]);
    });
  }
  const permissions = Object.fromEntries(ALL_NAV.filter(item => item.module).map(item =>
    [item.module, readable(item.module).length ? 'read' : 'none']));
  const hiddenPaths = new Set([
    ['/sensorik', showContent('sensors', 'sensors')],
    ['/energie', showContent('energy', 'energy')],
    ['/betrieb/technische-anlagen', showContent('maintenance', 'assets')],
    ['/betrieb/wartungen', showContent('maintenance', 'maintenance')],
    ['/meldungen', showContent('issues', 'issues', 'alerts') || readable('schedule').length > 0],
    ['/kalender', showContent('schedule', 'schedule')],
  ].filter(([, visible]) => !visible).map(([path]) => path));
  if (readable('schedule').length) permissions.issues = 'read';
  permissions.teamRights = !!(activeTeam?.is_owner || activeTeam?.can_manage_groups);
  // The building overview remains the entry point for creating the first building.
  if (activeTeam?.is_owner && !activeTeam.buildings.length) permissions.buildings = 'read';
  const resolvingLink = linkedID && linkedTeam && (linkedNavigation.isPending
    || (lookupRoom && roomCard.isPending) || (linkedValue && linkedTeamID !== teamID));
  const missingLink = linkedID && !resolvingLink && !linkedAllowed;
  const roomUnavailable = isRoomCard && !linkedValue;
  const ready = !resolvingLink && teamQuery.isSuccess && (!teams.length || !!activeTeam)
    && (linkedValue || !selection.startsWith('group:') || !groupQuery.isPending || !activeTeam)
    && (!activeTeam || !navigation.isPending);
  const scopeError = navigation.error || (linkedID && linkedTeam ? linkedNavigation.error : null)
    || (!linkedValue && selection.startsWith('group:') ? groupQuery.error : null);
  function choose(next, { search, replace = true } = {}) {
    localStorage.setItem(scopeStorageKey(teamID), next);
    setSelection(next);
    const nextParams = search ?? clearBuildingParameters(location.search);
    navigate({ pathname: location.pathname, search: nextParams.toString() }, { replace, preventScrollReset: true });
  }
  const scope = {
    ...resolved, team: activeTeam, groups, readable, can, permissions, hiddenPaths, choose,
    chooseBuilding: (id, options) => choose('building:' + id, options),
  };
  const forbidden = current.module === 'teamRights' ? !permissions.teamRights
    : current.module && permissions[current.module] === 'none';
  const fallback = ALL_NAV.find(item => !item.module || permissions[item.module] === 'read');
  const workspaceKey = current.module
    ? [teamID, scope.value, ...scope.buildings.map(building => building.id)].join('/')
    : teamID;

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
        <SidebarBody scope={scope} activeTeam={activeTeam} teams={teams} teamID={teamID} onTeam={changeTeam} />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="shell-dialog-overlay fixed inset-0 z-50 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} className="shell-drawer fixed z-50">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Menü schließen" className="shell-icon-button absolute right-1 top-1 z-10 grid h-10 w-10 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <SidebarBody scope={scope} activeTeam={activeTeam} teams={teams} teamID={teamID} onTeam={changeTeam} onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>

      <div className="shell-workspace">
        <header className="shell-header sticky top-0 z-30 px-4 pb-3 pt-4 sm:px-6 lg:hidden">
          <div className="shell-header-inner mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
            <Dialog.Trigger
              type="button"
              aria-label="Menü öffnen"
              className="shell-icon-button grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Dialog.Trigger>
            <ProjectLogo alt="Nala Solutions" className="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-sm font-semibold text-foreground sm:text-base">{current.label}</h1>
              <p className="hidden truncate text-[10px] text-muted-foreground sm:block">{current.hint}</p>
            </div>

            <TeamSwitcher teams={teams} teamID={teamID} onChange={changeTeam} />
          </div>
          {current.module && activeTeam && <div className="shell-header-inner mx-auto mt-2 max-w-[1600px] px-3 py-2 sm:px-4"><ScopeSwitcher scope={scope} /></div>}
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 pb-7 pt-2 focus:outline-none sm:px-6 sm:pb-9 lg:px-7 lg:pt-7">
          {(teamQuery.isError || scopeError) ? <p role="alert">{(teamQuery.error || scopeError).message}</p>
            : !ready ? <p role="status">Gebäudezugriff wird geladen …</p>
            : roomUnavailable ? <div role="alert" className="surface mx-auto max-w-xl space-y-3 p-5">
                <h2 className="font-heading text-xl font-semibold">Raumkarte nicht verfügbar</h2>
                <p>{!mayReadRoom || roomCard.error?.status === 403 ? 'Für diesen Raum fehlt dir der Zugriff.'
                  : !lookupRoom || roomCard.error?.status === 404 ? 'Der Raum wurde gelöscht oder der Raumlink ist ungültig.'
                  : 'Die Raumkarte konnte nicht geladen werden.'}</p>
                {lookupRoom && roomCard.isError && ![403, 404].includes(roomCard.error.status) &&
                  <button type="button" className="mr-4 text-sm text-primary underline" onClick={() => roomCard.refetch()}>Erneut versuchen</button>}
                <button type="button" className="text-sm text-primary underline" onClick={() => choose(selection)}>Zur aktuellen Auswahl</button>
              </div>
            : missingLink ? <div role="alert" className="surface space-y-2 p-4">
                <p>Das verlinkte Gebäude ist in dieser Ansicht nicht verfügbar.</p>
                <button type="button" className="text-sm text-primary underline" onClick={() => choose(selection)}>Zur aktuellen Auswahl</button>
              </div>
            : forbidden ? <Navigate to={fallback.path} replace />
            : <BuildingScopeContext.Provider value={scope} key={workspaceKey}>
                <Outlet context={isRoomCard ? roomCard.data : null} />
              </BuildingScopeContext.Provider>}
        </main>
      </div>
      </Dialog.Root>
    </div>
  );
}
