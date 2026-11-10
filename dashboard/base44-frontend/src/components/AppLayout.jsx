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
  { path: '/heat-map', label: 'Heat map', icon: Flame, hint: 'Echte Raumtemperaturen und getrennte Wetter-/Campus-Simulation' },
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
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">{group.label}</p>
          <div className="flex flex-col gap-1">
      {[...group.items, ...(group.label === 'Verwaltung' && isAdmin ? [ADMIN_NAV] : [])].map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
                isActive
                  ? 'bg-white/70 font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-white/90'
                  : 'text-sidebar-foreground/85 hover:bg-white/65 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity',
                    isActive ? 'bg-cyan-400 opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-cyan-700' : 'text-sidebar-foreground/60')} />
                <span className="truncate">{item.label}</span>
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
    <div className="d21-sidebar flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-7">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-100/80 text-cyan-700 ring-1 ring-inset ring-white/90">
          <Boxes className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-slate-900">D21 Digital Twin</p>
          <p className="mt-0.5 truncate text-[11px] text-sidebar-foreground/70">Hochschule Darmstadt</p>
        </div>
      </div>

      <div className="mx-5 mb-2 h-px bg-sidebar-border" />
      <div className="sidebar-scroll flex-1 overflow-y-auto pb-5 pt-5">
        <NavItems isAdmin={isAdmin} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">Datenquelle</p>
        <p className="mt-1.5 flex items-center gap-2 text-xs text-sidebar-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Projektserver · eigene Daten
        </p>
        {email ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-sidebar-foreground/70">{email}</span>
            <button
              type="button"
              onClick={() => base44.auth.logout('/login')}
              title="Abmelden"
              aria-label="Abmelden"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/75 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
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
    <div className="d21-shell min-h-screen bg-background">
      <a href="#main-content" className="sr-only z-[60] rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Zum Inhalt springen</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-white/75 bg-white/30 shadow-[8px_0_28px_rgba(35,52,70,0.06)] backdrop-blur-2xl lg:block">
        <SidebarBody />
      </aside>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[90vw] shadow-2xl">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close aria-label="Menü schließen" className="absolute right-1 top-1 z-10 grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-white/75 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              <X className="h-4 w-4" />
            </Dialog.Close>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>

      <div className="lg:pl-[264px]">
        <header className="d21-topbar sticky top-0 z-30 border-b border-white/70 bg-white/55 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Dialog.Trigger
              type="button"
              aria-label="Menü öffnen"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/80 bg-white/65 text-foreground shadow-sm backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Dialog.Trigger>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-base font-semibold text-foreground sm:text-lg">{current.label}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{current.hint}</p>
            </div>
            <span className="hidden items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-xl sm:inline-flex">
              <Database className="h-3.5 w-3.5 text-primary" />
              Projektserver
            </span>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 focus:outline-none sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      </Dialog.Root>
    </div>
  );
}
