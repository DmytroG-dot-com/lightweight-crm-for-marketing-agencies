export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative mb-10 flex flex-col justify-between gap-5 border-b border-zinc-950 pb-5 sm:flex-row sm:items-end">
      <span className="absolute -bottom-px left-0 h-0.5 w-20 bg-blue-600" />
      <div className="max-w-3xl">
        <h1 className="text-[clamp(1.6rem,3vw,2.75rem)] font-normal uppercase leading-[0.95] tracking-[-0.055em] text-zinc-950">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-xs uppercase leading-relaxed tracking-[0.04em] text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
