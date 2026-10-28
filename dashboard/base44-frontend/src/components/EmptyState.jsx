export default function EmptyState({ icon: Icon, title, description, children, compact = false }) {
  return (
    <div className={compact ? 'surface px-5 py-8 text-center' : 'surface px-6 py-14 text-center'}>
      {Icon ? (
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <h3 className="mt-4 font-heading text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="mx-auto mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}
