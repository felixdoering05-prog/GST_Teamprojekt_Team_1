import { Building2, Check, LogIn, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  { title: 'Anmelden', description: 'Verwende dein Projektkonto aus der iPhone-App oder erstelle ein Konto.', icon: LogIn },
  { title: 'Gebäude anlegen', description: 'Hinterlege den Namen und bei Bedarf die Adresse.', icon: Building2 },
  { title: 'Dateien hochladen', description: 'Füge Fotos, Grundrisse oder ein IFC-Modell zur Gebäudemappe hinzu.', icon: Upload },
];

export default function BuildingStartSteps({ active }) {
  return (
    <ol aria-label="Erste Schritte" className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ title, description, icon: Icon }, index) => {
        const done = index < active;
        const current = index === active;
        return (
          <li key={title} aria-current={current ? 'step' : undefined}
            className={cn('flex gap-3 rounded-xl border p-3', current && 'border-primary/35 bg-primary/5')}>
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', current || done ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{title}{done && <span className="sr-only"> · erledigt</span>}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
