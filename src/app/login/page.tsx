import Link from "next/link";
import { redirect } from "next/navigation";
import { sendMagicLink } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const featureCards = [
    {
      title: "Knows the client cold",
      description: "Offers, ICPs, objections, proof, onboarding answers, and past context stay attached to the work, so nobody briefs from memory.",
    },
    {
      title: "Builds the work so nothing gets missed",
      description: "From weekly reporting to complex funnels and automations, it creates faster, more precise task structure with the small steps included, so critical work does not get skipped.",
    },
    {
      title: "Turns context into briefs and creatives",
      description: "Use what the CRM already knows to generate sharper briefs, better creative direction, and image-ready ideas without starting from a blank page.",
    },
  ];
  const specSections = [
    {
      title: "Client workspaces",
      items: [
        "Agency-scoped client records with status management, notes, and contact details.",
        "Automatic General and Recurring task lists for every new client.",
        "Archive, restore, and delete flows for full client workspaces.",
      ],
    },
    {
      title: "Dossiers and personas",
      items: [
        "Structured strategy context for audience, offer, competitors, proof, pricing, messaging, and more.",
        "Freeform knowledge base text and AI summaries.",
        "Multiple personas per client with pains, objections, triggers, awareness stage, and offer fit.",
      ],
    },
    {
      title: "Tasks and execution",
      items: [
        "Nested tasks, assignees, due dates, status flow, priorities, comments, watchers, and attachments.",
        "Shareable task links and task-tree archive, restore, and move operations.",
        "My Work view that shows what is due today, overdue, and next up.",
      ],
    },
    {
      title: "AI task creation",
      items: [
        "Turns natural-language instructions into structured tasks.",
        "Uses client context, active lists, open work, and team members to shape the task properly.",
        "Stores source context and metadata for AI-generated work.",
      ],
    },
    {
      title: "Recurring ops and onboarding",
      items: [
        "Daily, weekly, and monthly recurring task rules with due offsets and weekend handling.",
        "Recurring tasks reset to the next run when completed, keeping the same thread of comments and context.",
        "Tokenized onboarding links with draft saves, submissions, and review flow.",
      ],
    },
    {
      title: "Briefs and creative production",
      items: [
        "Creative requests with hypotheses, launch timing, assets needed, references, notes, and status tracking.",
        "AI-generated creative briefs from client context.",
        "AI image-generation support inside the creative workflow.",
      ],
    },
    {
      title: "External creators and reporting",
      items: [
        "External creator portal for assignments, comments, and completed Drive-folder submissions.",
        "Agency roles, invitations, member management, and timezone settings.",
        "AI team reports for last week, this week, and last 30 days using real operational metrics.",
      ],
    },
    {
      title: "Stack and security",
      items: [
        "Next.js 16, React 19, TypeScript 5, Tailwind CSS 4.",
        "Supabase Auth, Postgres, Storage, SSR, and server actions.",
        "Strict row-level security and database-enforced agency boundaries.",
      ],
    },
  ];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/clients");
  const params = await searchParams;

  return (
    <main className="min-h-screen px-6 py-10 md:px-12 md:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col gap-8 md:gap-10">
        <div>
          <p className="text-base uppercase leading-tight tracking-[-0.04em]">Agency CRM</p>
          <p className="ui-kicker mt-1">Agency CRM / Project Management</p>
        </div>
        <section className="max-w-4xl">
          <p className="ui-kicker mb-3">Quick walkthrough</p>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 shadow-sm">
            <div className="aspect-video">
              <iframe
                src="https://www.youtube.com/embed/30o6AW-aPZM?rel=0"
                title="Agency CRM walkthrough video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full"
              />
            </div>
          </div>
        </section>
        <section className="max-w-4xl">
          <p className="ui-kicker mb-3">Key features</p>
          <div className="grid gap-3 md:grid-cols-3">
            {featureCards.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="text-lg font-normal uppercase leading-tight tracking-[-0.04em] text-zinc-950">
                  {feature.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
          <details className="mt-5 border-y border-zinc-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-950">
              Read full spec sheet
              <span aria-hidden="true" className="text-sm text-zinc-400">+</span>
            </summary>
            <div className="border-t border-zinc-200 py-5">
              <p className="max-w-3xl text-sm leading-6 text-zinc-500">
                Agency CRM is multi-tenant, client-context-driven, and built for agency execution rather than generic record keeping.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {specSections.map((section) => (
                  <div key={section.title} className="border border-zinc-200 bg-white p-5">
                    <h3 className="text-lg font-normal uppercase leading-tight tracking-[-0.04em] text-zinc-950">
                      {section.title}
                    </h3>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-500">
                      {section.items.map((item) => (
                        <li key={item} className="border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>
        <div className="max-w-xl border-t border-zinc-950 pt-5">
          <p className="ui-kicker mb-3">Account access</p>
          <h1 className="text-4xl font-normal uppercase leading-none tracking-[-0.055em]">Sign up or sign in</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-zinc-500">
            New users get an agency automatically; invited teammates join their agency.
          </p>
          {params.sent && (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Check your inbox for the sign-in link.
            </p>
          )}
          {params.error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
          )}
          <form action={sendMagicLink} className="mt-8 space-y-5">
            <label className="block text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm"
                placeholder="you@agency.com"
              />
            </label>
            <button className="ui-action ui-action-primary w-full">
              Send magic link
            </button>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <Link href="/privacy" className="transition hover:text-zinc-900 hover:underline">
              Privacy Policy
            </Link>
            <span className="text-zinc-300">/</span>
            <Link href="/terms" className="transition hover:text-zinc-900 hover:underline">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
