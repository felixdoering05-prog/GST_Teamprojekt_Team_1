import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BellRing,
  Boxes,
  BrainCircuit,
  Building2,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';

const NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, hint: 'Gebäudeübersicht, Kennzahlen und Raumzustände' },
  { path: '/bim-viewer', label: 'BIM-Viewer', icon: Boxes, hint: 'IFC-Modelle vom Projektserver in 3D öffnen und Bauteile erkunden' },
  { path: '/gebaeude', label: 'Gebäude & Räume', icon: Building2, hint: 'Geschosse und Räume anlegen, bearbeiten und verwalten' },
  { path: '/sensorik', label: 'Sensorik', icon: Radio, hint: 'Temperatur, CO₂ und Luftfeuchtigkeit je Raum' },
  { path: '/energie', label: 'Energie', icon: Zap, hint: 'Energieverbrauch und Auswertungen' },
  { path: '/analyse', label: 'KI-Analyse', icon: BrainCircuit, hint: 'Auffälligkeiten, Trends und mögliche Ursachen' },
  { path: '/meldungen', label: 'Meldungen', icon: BellRing, hint: 'Grenzwertüberschreitungen und technische Warnungen' },
  { path: '/daten', label: 'Daten & Einstellungen', icon: Database, hint: 'Datenimport, Export und Konfiguration' },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-white',
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
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-cyan-400' : 'text-sidebar-foreground/60')} />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }) {
  const [email, setEmail] = useState('');

  useEffect(() => {
    base44.auth
      .me()
      .then((u) => setEmail(u?.email || ''))
      .catch(() => setEmail(''));
  }, []);

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400 ring-1 ring-inset ring-cyan-400/30">
          <Boxes className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-white">D21 Digital Twin</p>
          <p className="truncate text-[11px] text-sidebar-foreground/60">Hochschule Darmstadt</p>
        </div>
      </div>

      <div className="mx-5 mb-2 h-px bg-sidebar-border" />
      <div className="flex-1 overflow-y-auto pb-4 hide-scrollbar">
        <p className="px-6 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
          Navigation
        </p>
        <NavItems onNavigate={onNavigate} />
      </div>

      <div className="border-t border-sidebar-border px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">Datenquelle</p>
        <p className="mt-1.5 flex items-center gap-2 text-xs text-sidebar-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Projektserver · eigene Daten
        </p>
        {email ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-sidebar-foreground/50">{email}</span>
            <button
              type="button"
              onClick={() => base44.auth.logout('/login')}
              title="Abmelden"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-white"
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
  const current = NAV.find((n) => (n.end ? n.path === location.pathname : location.pathname.startsWith(n.path))) || NAV[0];

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-sidebar-border lg:block">
        <SidebarBody />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menü schließen"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl transition-transform">
            <button
              type="button"
              aria-label="Menü schließen"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Menü öffnen"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-base font-semibold text-foreground sm:text-lg">{current.label}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{current.hint}</p>
            </div>
            <span className="hidden items-center gap-2 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Projektserver
            </span>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
