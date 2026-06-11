import { submitOnboarding } from "@/actions/public";
import { DOSSIER_LABELS, DOSSIER_SECTIONS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { token } = await params;
  const { submitted } = await searchParams;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, active, expires_at, clients(name)")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();
  const invalid = !link || (link.expires_at && new Date(link.expires_at) < new Date());

  if (invalid) {
    return <PublicMessage title="Link unavailable" description="This onboarding link is invalid or has expired." />;
  }
  if (submitted) {
    return <PublicMessage title="Thank you" description="Your onboarding information has been submitted to the agency." />;
  }
  const client = link.clients as unknown as { name: string } | null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-zinc-500">Client onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{client?.name}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Share the context the team needs to understand your business and create effective work.</p>
      </div>
      <form action={submitOnboarding} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        {DOSSIER_SECTIONS.map((section) => <label key={section} className="block rounded-xl border bg-white p-5 text-sm font-semibold">{DOSSIER_LABELS[section]}<textarea name={section} rows={5} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>)}
        <label className="block rounded-xl border bg-white p-5 text-sm font-semibold">Additional knowledge base<textarea name="knowledge_base" rows={7} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>
        <button className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white">Submit onboarding</button>
      </form>
    </main>
  );
}

function PublicMessage({ title, description }: { title: string; description: string }) {
  return <main className="grid min-h-screen place-items-center px-4"><div className="max-w-md rounded-2xl border bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p></div></main>;
}
