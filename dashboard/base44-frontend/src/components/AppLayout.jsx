import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  BellRing,
  Boxes,
  BrainCircuit,
  Building2,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { request, base44 } from '@/api/base44Client';

const NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, hint: 'Gebäudeübersicht, Kennzahlen und Raumzustände' },
  { path: '/bim-viewer', label: 'BIM-Viewer', icon: Boxes, hint: 'IFC-Modelle vom Projektserver in 3D öffnen und Bauteile erkunden' },
  { path: '/heat-map', label: 'Heat Map', icon: Flame, hint: 'Raumtemperaturen im Gebäude und Wärmeverteilung auf dem Campus' },
  { path: '/gebaeude', label: 'Gebäude & Räume', icon: Building2, hint: 'Geschosse und Räume anlegen, bearbeiten und verwalten' },
  { path: '/sensorik', label: 'Sensorik', icon: Radio, hint: 'Temperatur, CO₂ und Luftfeuchtigkeit je Raum' },
  { path: '/energie', label: 'Energie', icon: Zap, hint: 'Energieverbrauch und Auswertungen' },
  { path: '/analyse', label: 'KI-Analyse', icon: BrainCircuit, hint: 'Auffälligkeiten, Trends und mögliche Ursachen' },
  { path: '/assistent', label: 'Gebäude-Assistent', icon: MessageSquareText, hint: 'Fragen zu freigegebenen Gebäudedaten stellen' },
  { path: '/meldungen', label: 'Meldungen', icon: BellRing, hint: 'Grenzwertüberschreitungen und technische Warnungen' },
  { path: '/daten', label: 'Daten & Einstellungen', icon: Database, hint: 'Datenimport, Export und Konfiguration' },
];

const ADMIN_NAV = {path:'/verwaltung',label:'Serververwaltung',icon:ShieldCheck,hint:'Serverkapazität, API-Nutzung und Konten'};
const NAV_GROUPS = [
  { label: 'Gebäude', items: NAV.slice(0, 4) },
  { label: 'Auswertung', items: NAV.slice(4, 9) },
  { label: 'Verwaltung', items: NAV.slice(9) },
];

function NavItems({ onNavigate, isAdmin }) {
  return (
    <nav aria-label="Hauptnavigation" className="space-y-5 px-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="shell-nav-heading">{group.label}</p>
          <div className="flex flex-col gap-1">
      {[...group.items, ...(group.label === 'Verwaltung' && isAdmin ? [ADMIN_NAV] : [])].map((item) => {
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
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }) {
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
      <div className="flex items-center gap-3 px-5 pb-6 pt-7">
        <span className="shell-brand-icon grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
          <Boxes className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">D21 Digital Twin</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Hochschule Darmstadt</p>
        </div>
      </div>

      <div className="shell-divider mx-5 mb-2 h-px" />
      <div className="sidebar-scroll flex-1 overflow-y-auto pb-5 pt-5">
        <NavItems isAdmin={isAdmin} onNavigate={onNavigate} />
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

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = [...NAV,ADMIN_NAV].find((n) => (n.end ? n.path === location.pathname : location.pathname.startsWith(n.path))) || NAV[0];

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
        <SidebarBody />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="shell-dialog-overlay fixed inset-0 z-50 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} className="shell-drawer fixed z-50">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Menü schließen" className="shell-icon-button absolute right-1 top-1 z-10 grid h-10 w-10 place-items-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <SidebarBody onNavigate={() => setOpen(false)} />
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
