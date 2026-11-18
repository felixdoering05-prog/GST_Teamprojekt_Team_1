import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
      { path: '/bim-viewer', label: 'BIM-Viewer', icon: Boxes, module: 'bim', hint: 'IFC-Modelle vom Projektserver in 3D öffnen und Bauteile erkunden' },
      { path: '/heat-map', label: 'Heat Map', icon: Flame, module: 'bim', hint: 'Raumtemperaturen im Gebäude und Wärmeverteilung auf dem Campus' },
      { path: '/gebaeude', label: 'Gebäude', icon: Building2, module: 'buildings', hint: 'Gebäude, Bilder, Pläne und Räume verwalten' },
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
    label: 'Benachrichtigungen',
    items: [
      { path: '/zeitplanung', label: 'Zeitplanung', icon: CalendarClock, module: 'schedule', hint: 'Gebäudebezogene Termine und Aufgaben koordinieren' },
      { path: '/meldungen', label: 'Meldungen', icon: BellRing, module: 'issues', hint: 'Mobile Gebäudemeldungen und Sensorwarnungen' },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { path: '/teams', label: 'Dein Team', icon: Users, hint: 'Teammitglieder, Einladungen, Titel und Gebäudegruppen verwalten' },
      { path: '/rechte', label: 'Rechte', icon: ShieldCheck, hint: 'Mitglieder, Rollen und Berechtigungen verwalten' },
    ],
  },
  {
    label: 'Verwaltung',
    items: [
      { path: '/daten', label: 'Daten & Einstellungen', icon: Database, module: 'settings', hint: 'Datenimport, Export und Konfiguration' },
    ],
  },
];

const ADMIN_NAV = { path: '/verwaltung', label: 'Serververwaltung', icon: ShieldCheck, hint: 'Serverkapazität, API-Nutzung und Konten' };
const ALL_NAV = [...NAV_GROUPS.flatMap((group) => group.items), ADMIN_NAV];

function NavItems({ onNavigate, isAdmin, permissions }) {
  return (
    <nav aria-label="Hauptnavigation" className="space-y-5 px-3">
      {NAV_GROUPS.map((group) => {
        const items=group.items.filter(item=>!item.module||permissions===null||permissions[item.module]!=='none');
        return items.length>0&&(
        <div key={group.label}>
          <p className="shell-nav-heading">{group.label}</p>
          <div className="flex flex-col gap-1">
      {[...items, ...(group.label === 'Verwaltung' && isAdmin ? [ADMIN_NAV] : [])].map((item) => {
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
                'shell-nav-link group relative flex min-h-11 items-center gap-3 px-3 py-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

function SidebarBody({ onNavigate, scopeKey, activeTeam }) {
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions,setPermissions]=useState(null);

  useEffect(() => {
    request('/admin/me').then(data=>setIsAdmin(data.admin)).catch(()=>setIsAdmin(false));
    base44.auth
      .me()
      .then((u) => setEmail(u?.email || ''))
      .catch(() => setEmail(''));
  }, []);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        const buildings=await request('/buildings');
        if(!buildings.length){if(active)setPermissions(null);return;}
        const preferred=localStorage.getItem('d21-selected-building');
        const building=buildings.find(row=>String(row.id)===preferred)||buildings[0];
        const access=await request(`/buildings/${building.id}/team-access`);
        if(active)setPermissions(access.is_owner?null:access.actor_role?.permissions||{});
      }catch{if(active)setPermissions(null);}
    };
    load();window.addEventListener('d21-building-change',load);
    return()=>{active=false;window.removeEventListener('d21-building-change',load);};
  },[scopeKey]);

  return (
    <div className="shell-sidebar-body flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-7">
        {activeTeam?.has_logo?<TeamLogo id={activeTeam.id} name={activeTeam.name}/>:null}
        <span className="shell-brand-icon grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
          <Boxes className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">Nala Solutions</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Hochschule Darmstadt</p>
        </div>
      </div>

      <div className="shell-divider mx-5 mb-2 h-px" />
      <div className="sidebar-scroll flex-1 overflow-y-auto pb-5 pt-5">
        <NavItems isAdmin={isAdmin} onNavigate={onNavigate} permissions={permissions} />
      </div>

      <div className="shell-account border-t px-4 py-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Datenquelle</p>
        <p className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Database className="h-3 w-3 shrink-0 text-primary" />
          Projektserver · eigene Daten
        </p>
        {email ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-muted-foreground">{email}</span>
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

function TeamLogo({id,name}){const [src,setSrc]=useState('');useEffect(()=>{let active=true,objectURL='';request('/teams/'+id+'/logo',{raw:true}).then(blob=>{objectURL=URL.createObjectURL(blob);if(active)setSrc(objectURL)}).catch(()=>{});return()=>{active=false;if(objectURL)URL.revokeObjectURL(objectURL)}},[id]);return src?<img src={src} alt={'Logo '+name} className="h-10 w-10 rounded-xl object-contain"/>:null;}
function hexHsl(hex){const n=parseInt(String(hex||'#596b3d').slice(1),16),r=((n>>16)&255)/255,g=((n>>8)&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return Math.round(h)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = ALL_NAV.find((n) => (n.end ? n.path === location.pathname : location.pathname.startsWith(n.path))) || ALL_NAV[0];
  const [teams,setTeams]=useState([]),[teamID,setTeamID]=useState(()=>localStorage.getItem('d21-selected-team')||'');
  useEffect(()=>{let active=true;request('/teams').then(rows=>{if(!active)return;setTeams(rows);const saved=localStorage.getItem('d21-selected-team');const chosen=rows.some(row=>String(row.id)===saved)?saved:String(rows[0]?.id||'');setTeamID(chosen);if(chosen)localStorage.setItem('d21-selected-team',chosen);}).catch(()=>{});return()=>{active=false}},[]);
  const activeTeam=teams.find(row=>String(row.id)===teamID);
  function chooseTeam(id){setTeamID(id);localStorage.setItem('d21-selected-team',id);const team=teams.find(row=>String(row.id)===id);document.documentElement.style.setProperty('--primary',hexHsl(team?.primary_color));document.documentElement.style.setProperty('--ring',hexHsl(team?.primary_color));document.documentElement.style.setProperty('--sidebar-primary',hexHsl(team?.primary_color));document.documentElement.style.setProperty('--accent',hexHsl(team?.accent_color));if(team?.background_color)document.documentElement.style.setProperty('--team-background',hexHsl(team.background_color));else document.documentElement.style.removeProperty('--team-background');window.dispatchEvent(new Event('d21-team-change'));}
  useEffect(()=>{if(activeTeam)chooseTeam(String(activeTeam.id));},[activeTeam?.id,activeTeam?.primary_color,activeTeam?.accent_color,activeTeam?.background_color]);

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
        <SidebarBody scopeKey={`${location.pathname}${location.search}${teamID}`} activeTeam={activeTeam}/>
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="shell-dialog-overlay fixed inset-0 z-50 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} className="shell-drawer fixed z-50">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Menü schließen" className="shell-icon-button absolute right-1 top-1 z-10 grid h-10 w-10 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <SidebarBody scopeKey={`${location.pathname}${location.search}${teamID}`} activeTeam={activeTeam} onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>

      <div className="shell-workspace">
        <header className="shell-header sticky top-0 z-30 px-4 pb-3 pt-4 sm:px-6 lg:px-7">
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
            <span className="glass-pill hidden items-center gap-2 px-3 py-2 text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <Database className="h-3.5 w-3.5 text-primary" />
              Projektserver
            </span>
            {teams.length===1?<span className="glass-pill max-w-48 truncate px-3 py-2 text-xs font-medium" title={teams[0].name}>{teams[0].name}</span>:teams.length>1?<select aria-label="Team auswählen" className="max-w-48 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium" value={teamID} onChange={event=>{chooseTeam(event.target.value);window.location.reload();}}>{teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select>:null}
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 pb-7 pt-2 focus:outline-none sm:px-6 sm:pb-9 lg:px-7 lg:pt-3">
          <Outlet />
        </main>
      </div>
      </Dialog.Root>
    </div>
  );
}
