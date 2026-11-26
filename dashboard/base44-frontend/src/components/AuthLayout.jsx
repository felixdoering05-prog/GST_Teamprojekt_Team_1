import React from "react";
import { LANGUAGES, rememberLanguage, storedLanguage } from "@/lib/i18n";
import ProjectLogo from "./ProjectLogo";

// Vor der Anmeldung gilt die Sprache nur für diesen Browser.
function LanguageSwitch() {
  const current = storedLanguage();
  return (
    <div className="absolute right-4 top-4 flex gap-1 text-xs" translate="no">
      {LANGUAGES.map(item => (
        <button key={item.value} type="button" aria-pressed={current === item.value}
          className={`rounded-full px-3 py-1.5 font-medium ${current === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => { if (item.value !== current) { rememberLanguage(item.value); window.location.reload(); } }}>
          {item.value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4">
      <LanguageSwitch />
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <ProjectLogo className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Nala Solutions</h1><p className="mt-2 text-lg font-semibold">{title}</p>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
