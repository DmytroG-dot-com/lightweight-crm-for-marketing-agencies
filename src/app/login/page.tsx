import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ClipboardCheck,
  FileInput,
  Layers3,
  Play,
  Sparkles,
  UsersRound,
  WandSparkles,
  Workflow,
} from "lucide-react";
import { sendMagicLink } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Login",
  description:
    "Sign in to Agency CRM — the client context, onboarding, task management, creative production, and reporting workspace built for agencies.",
};

const highlights = [
  {
    icon: BrainCircuit,
    title: "Client context that compounds",
    description:
      "Dossiers, personas, offers, objections, proof, and knowledge stay attached to every client—so the team starts with context, not another briefing call.",
  },
  {
    icon: FileInput,
    title: "Forms that fit each service",
    description:
      "Build custom onboarding forms for each niche or offer, share a private link, and map answers directly into the client dossier when they are ready.",
  },
  {
    icon: Workflow,
    title: "Reusable execution systems",
    description:
      "Turn your best task trees, complete task lists, recurring schedules, and CSV workflows into repeatable delivery instead of rebuilding them client by client.",
  },
  {
    icon: WandSparkles,
    title: "Creative work with fewer handoff gaps",
    description:
      "Generate context-aware briefs, collaborate with external creators, review submissions, and create image references without losing the strategy behind the work.",
  },
];

const capabilityGroups = [
  {
    number: "01",
    icon: Layers3,
    title: "Client workspaces",
    description: "One durable source of truth for every account.",
    items: [
      "Client lifecycle, contacts, notes, and activity",
      "Structured dossier, knowledge base, and personas",
      "CSV dossier and persona import/export",
    ],
  },
  {
    number: "02",
    icon: FileInput,
    title: "Onboarding and custom forms",
    description: "Capture the right information for every engagement.",
    items: [
      "Unlimited custom onboarding templates",
      "Public tokenized forms with draft saving",
      "Map and merge responses into the dossier",
    ],
  },
  {
    number: "03",
    icon: ClipboardCheck,
    title: "Tasks and workflows",
    description: "Make the next action obvious and repeatable.",
    items: [
      "Nested tasks, owners, due dates, files, and comments",
      "Task-tree and full-list templates",
      "Recurring schedules, CSV import, archive, and restore",
    ],
  },
  {
    number: "04",
    icon: Sparkles,
    title: "Context-aware AI",
    description: "Use the workspace context instead of prompting from zero.",
    items: [
      "Natural-language task planning",
      "AI team and workload reports",
      "Creative briefs and image references",
    ],
  },
  {
    number: "05",
    icon: WandSparkles,
    title: "Creative delivery",
    description: "Move from request to approved output in one thread.",
    items: [
      "Creative requests, hypotheses, assets, and references",
      "Focused external creator portal",
      "Review comments, revisions, and final folder handoff",
    ],
  },
  {
    number: "06",
    icon: UsersRound,
    title: "Agency operations",
    description: "Keep internal coordination lightweight but accountable.",
    items: [
      "Team roles, invitations, watchers, and inbox",
      "My Work priorities and activity history",
      "Agency boundaries enforced with row-level security",
    ],
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/clients");
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#f4f6f9]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-5 sm:px-8 lg:px-10">
          <div>
            <p className="text-base font-medium uppercase leading-none tracking-[-0.045em] text-zinc-950">
              Agency CRM
            </p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Client context / Project management
            </p>
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:flex">
            <span className="size-1.5 bg-emerald-500" aria-hidden="true" />
            Built for agency execution
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.72fr)] lg:gap-8">
          <div className="order-2 border border-zinc-200 bg-white lg:order-1">
            <div className="border-b border-zinc-200 p-6 sm:p-8 lg:p-10">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-blue-600" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                  Client context → clear execution
                </p>
              </div>
              <h1 className="mt-6 max-w-3xl text-[clamp(2.75rem,6vw,5.75rem)] font-normal uppercase leading-[0.84] tracking-[-0.075em] text-zinc-950">
                Run the work.
                <span className="mt-1 block text-zinc-400">Keep the context.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">
                Agency CRM connects client knowledge, onboarding, delivery, creative production, and team visibility—without turning your operation into another bloated admin system.
              </p>
            </div>

            <div className="grid sm:grid-cols-2">
              {highlights.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className={`p-6 sm:p-7 ${index < highlights.length - 1 ? "border-b border-zinc-200" : ""} ${index < 2 ? "sm:border-b" : "sm:border-b-0"} ${index % 2 === 0 ? "sm:border-r sm:border-zinc-200" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <Icon className="size-5 text-blue-600" strokeWidth={1.6} aria-hidden="true" />
                      <span className="text-[10px] font-medium tabular-nums text-zinc-300">0{index + 1}</span>
                    </div>
                    <h2 className="mt-8 text-lg font-medium uppercase leading-tight tracking-[-0.035em] text-zinc-950">
                      {feature.title}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-zinc-500">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="order-1 border border-zinc-950 bg-zinc-950 text-white lg:sticky lg:top-6 lg:order-2">
            <div className="border-b border-zinc-700 p-6 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">Account access</p>
              <h2 className="mt-5 text-4xl font-normal uppercase leading-[0.9] tracking-[-0.055em] sm:text-5xl">
                Sign up
                <span className="block text-zinc-500">or sign in.</span>
              </h2>
              <p className="mt-5 text-sm leading-6 text-zinc-400">
                Enter your email and we&apos;ll send a secure, one-time sign-in link. New users get an agency workspace automatically.
              </p>
            </div>

            <div className="p-6 sm:p-8">
              {params.sent && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mb-5 border border-emerald-700 bg-emerald-950 px-3 py-3 text-sm leading-5 text-emerald-200"
                >
                  Check your inbox for the sign-in link.
                </p>
              )}
              {params.error && (
                <p
                  role="alert"
                  className="mb-5 border border-red-800 bg-red-950 px-3 py-3 text-sm leading-5 text-red-200"
                >
                  {params.error}
                </p>
              )}
              <ActionForm action={sendMagicLink} className="space-y-5">
                <label htmlFor="email" className="block text-zinc-300">
                  Work email
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="mt-2.5 w-full border border-zinc-600 bg-zinc-900 px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-blue-400"
                    placeholder="you@agency.com"
                  />
                </label>
                <button type="submit" className="ui-action ui-action-primary flex w-full items-center justify-between py-3">
                  Send magic link
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </ActionForm>

              <div className="mt-6 space-y-2 border-t border-zinc-700 pt-5 text-xs leading-5 text-zinc-400">
                <p className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-blue-300" aria-hidden="true" />
                  No password to remember.
                </p>
                <p className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-blue-300" aria-hidden="true" />
                  Invited teammates join the existing agency.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                <Link href="/privacy" className="transition hover:text-white">
                  Privacy
                </Link>
                <span className="text-zinc-700">/</span>
                <Link href="/terms" className="transition hover:text-white">
                  Terms
                </Link>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-6 border border-zinc-200 bg-white lg:mt-8">
          <div className="grid gap-6 border-b border-zinc-200 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:p-10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">What lives inside</p>
              <h2 className="mt-4 text-3xl font-normal uppercase leading-[0.95] tracking-[-0.05em] text-zinc-950 sm:text-5xl">
                One system from intake to delivery.
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-zinc-500 lg:justify-self-end">
              Purpose-built for marketing and content agencies that need the depth of a project system, the memory of a CRM, and practical AI—without stitching five disconnected tools together.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3">
            {capabilityGroups.map((group, index) => {
              const Icon = group.icon;
              return (
                <article
                  key={group.title}
                  className={`p-6 sm:p-7 ${index < capabilityGroups.length - 1 ? "border-b border-zinc-200" : ""} ${index < 4 ? "md:border-b" : "md:border-b-0"} ${index % 2 === 0 ? "md:border-r md:border-zinc-200" : ""} ${index < 3 ? "xl:border-b" : "xl:border-b-0"} ${index % 3 !== 2 ? "xl:border-r xl:border-zinc-200" : "xl:border-r-0"}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <Icon className="size-5 text-blue-600" strokeWidth={1.6} aria-hidden="true" />
                    <span className="text-[10px] font-medium tabular-nums text-zinc-300">{group.number}</span>
                  </div>
                  <h3 className="mt-8 text-xl font-medium uppercase leading-tight tracking-[-0.04em] text-zinc-950">
                    {group.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{group.description}</p>
                  <ul className="mt-6 space-y-3 border-t border-zinc-200 pt-5">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-xs leading-5 text-zinc-600">
                        <span className="mt-2 size-1 shrink-0 bg-blue-600" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid border border-zinc-200 bg-white lg:mt-8 lg:grid-cols-[0.55fr_1.45fr]">
          <div className="flex flex-col justify-between border-b border-zinc-200 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
            <div>
              <Play className="size-5 text-blue-600" strokeWidth={1.6} aria-hidden="true" />
              <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Product walkthrough</p>
              <h2 className="mt-4 text-3xl font-normal uppercase leading-[0.95] tracking-[-0.05em] text-zinc-950">
                See the workflow in action.
              </h2>
              <p className="mt-5 text-sm leading-6 text-zinc-500">
                A quick tour of the original operating flow. The product now also includes custom onboarding builders, reusable workflow templates, CSV imports, and expanded creative tools.
              </p>
            </div>
            <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">06:00 walkthrough</p>
          </div>
          <div className="bg-zinc-950 p-2 sm:p-3">
            <div className="aspect-video overflow-hidden bg-black">
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

        <footer className="flex flex-col gap-3 py-8 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Agency CRM / Built for focused delivery</p>
          <p>Support: hi@dmytro.biz</p>
        </footer>
      </div>
    </main>
  );
}
