import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { sendMagicLink } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";

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
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-7 shadow-sm">
        <div className="mb-6 grid size-11 place-items-center rounded-xl bg-zinc-950 text-white">
          <Mail className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign up or sign in</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Enter your email. New users get an agency automatically; invited teammates join their agency.
        </p>
        {params.sent && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Check your inbox for the sign-in link.
          </p>
        )}
        {params.error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
        )}
        <form action={sendMagicLink} className="mt-6 space-y-4">
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
          <button className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
            Send magic link
          </button>
        </form>
      </div>
    </main>
  );
}
