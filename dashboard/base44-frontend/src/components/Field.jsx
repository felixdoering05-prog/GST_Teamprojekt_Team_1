import { cn } from '@/lib/utils';

export function FieldWrap({ label, hint, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  'flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60';

export function TextField({ label, hint, className, ...props }) {
  return (
    <FieldWrap label={label} hint={hint} className={className}>
      <input className={CONTROL} {...props} />
    </FieldWrap>
  );
}

export function SelectField({ label, hint, options = [], placeholder, className, ...props }) {
  return (
    <FieldWrap label={label} hint={hint} className={className}>
      <select className={cn(CONTROL, 'appearance-none pr-8')} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

export function TextAreaField({ label, hint, className, rows = 3, ...props }) {
  return (
    <FieldWrap label={label} hint={hint} className={className}>
      <textarea rows={rows} className={cn(CONTROL, 'h-auto py-2 leading-relaxed')} {...props} />
    </FieldWrap>
  );
}
