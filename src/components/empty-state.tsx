export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-y bg-white px-1 py-16">
      <p className="ui-kicker">{title}</p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>
    </div>
  );
}
