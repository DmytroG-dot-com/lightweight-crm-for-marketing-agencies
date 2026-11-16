import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  FileInput,
  Play,
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
    title: "Client memory",
    description:
      "Dossiers, personas, proof, and notes stay attached to the work.",
  },
  {
    icon: FileInput,
    title: "Custom onboarding",
    description:
      "Build shareable forms and merge answers into the client dossier.",
  },
  {
    icon: Workflow,
    title: "Reusable workflows",
    description:
      "Reuse task trees and lists, import CSVs, and schedule recurring work.",
  },
  {
    icon: WandSparkles,
    title: "Creative delivery",
    description:
      "Create briefs, work with external creators, review, and generate images.",
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
                Client context, custom onboarding, tasks, creative delivery, and team visibility in one focused workspace.
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
                Enter your email for a secure, one-time sign-in link.
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
          <div className="flex flex-col gap-5 border-b border-zinc-200 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Also included</p>
              <h2 className="mt-3 text-3xl font-normal uppercase leading-none tracking-[-0.05em] text-zinc-950">
                The useful extras.
              </h2>
            </div>
            <a
              href="https://www.youtube.com/watch?v=30o6AW-aPZM"
              target="_blank"
              rel="noreferrer"
              className="ui-action flex w-fit items-center gap-2"
            >
              <Play className="size-3.5" aria-hidden="true" />
              Watch walkthrough
            </a>
          </div>
          <div className="grid sm:grid-cols-3">
            <article className="border-b border-zinc-200 p-6 sm:border-b-0 sm:border-r">
              <h3 className="text-sm font-semibold uppercase tracking-[-0.02em]">AI assistance</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Tasks, briefs, images, and team reports.</p>
            </article>
            <article className="border-b border-zinc-200 p-6 sm:border-b-0 sm:border-r">
              <h3 className="text-sm font-semibold uppercase tracking-[-0.02em]">Team operations</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">My Work, inbox, roles, and activity.</p>
            </article>
            <article className="p-6">
              <h3 className="text-sm font-semibold uppercase tracking-[-0.02em]">Secure sharing</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Creator portals, public forms, task links, and RLS.</p>
            </article>
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
