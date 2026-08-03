import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sendMagicLink } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Login",
};

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
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10">
      <div className="w-full max-w-sm border border-zinc-200 bg-white p-8 md:p-10">
        <div>
          <h1 className="text-4xl font-normal uppercase leading-none tracking-[-0.065em]">
            Agency CRM
          </h1>
        </div>
        <div className="mt-6 border-t border-zinc-950 pt-6">
          {params.sent && (
            <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Check your inbox for the sign-in link.
            </p>
          )}
          {params.error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
          )}
          <ActionForm action={sendMagicLink} className="space-y-5">
            <label className="block text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm"
                placeholder="you@company.com"
              />
            </label>
            <button className="ui-action ui-action-primary w-full">Send magic link</button>
          </ActionForm>
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
