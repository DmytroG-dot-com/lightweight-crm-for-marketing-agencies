import { OnboardingForm } from "@/components/onboarding-form";
import {
  DEFAULT_ONBOARDING_TEMPLATE_NAME,
  onboardingTemplateSchemaOrDefault,
  type OnboardingDraft,
} from "@/lib/onboarding";
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
    .select("id, active, expires_at, draft, template_name, template_schema, clients(name)")
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
  const schema = onboardingTemplateSchemaOrDefault(link.template_schema);
  const templateName = typeof link.template_name === "string" && link.template_name.trim()
    ? link.template_name
    : DEFAULT_ONBOARDING_TEMPLATE_NAME;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-10 border-b border-zinc-950 pb-7">
        <p className="ui-kicker text-blue-700">Client onboarding</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">{client?.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Share what you already know. Detailed answers help the team create stronger strategy, briefs, and creative work, but you can leave non-required questions blank.
        </p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Template: {templateName}
        </p>
      </div>
      <OnboardingForm
        token={token}
        companyName={client?.name ?? ""}
        serverDraft={(link.draft ?? {}) as OnboardingDraft}
        schema={schema}
      />
    </main>
  );
}

function PublicMessage({ title, description }: { title: string; description: string }) {
  return <main className="grid min-h-screen place-items-center px-4"><div className="max-w-md rounded-2xl border bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p></div></main>;
}
