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
        <div className="max-w-xl border-t border-zinc-950 pt-5">
          <p className="ui-kicker mb-3">Account access</p>
          <h1 className="text-4xl font-normal uppercase leading-none tracking-[-0.055em]">Sign up or sign in</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-zinc-500">
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
        </div>
      </div>
    </main>
  );
}
