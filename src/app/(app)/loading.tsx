export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-10 w-64 bg-zinc-100" />
      <div className="flex gap-2">
        <div className="h-8 w-24 bg-zinc-50" />
        <div className="h-8 w-24 bg-zinc-50" />
        <div className="h-8 w-24 bg-zinc-50" />
      </div>
      <div className="h-24 border-y bg-white" />
      <div className="h-64 border-y bg-white" />
    </div>
  );
}
