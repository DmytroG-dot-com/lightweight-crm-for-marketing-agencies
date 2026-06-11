export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{description}</p>
    </div>
  );
}
