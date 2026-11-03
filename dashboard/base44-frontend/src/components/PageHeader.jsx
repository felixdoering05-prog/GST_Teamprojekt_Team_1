export default function PageHeader({ title, description, children, badge }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">{title}</h2>
          {badge}
        </div>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
