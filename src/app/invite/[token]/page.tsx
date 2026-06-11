import Link from "next/link";
import { sendInviteMagicLink } from "@/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLabel } from "@/lib/utils";

export default async function TeamInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("team_invitations")
    .select("email, role, accepted_at, expires_at, agencies(name)")
    .eq("token", token)
    .maybeSingle();
  const agency = invitation?.agencies as unknown as { name: string } | null;
  const expired = invitation ? new Date(invitation.expires_at) <= new Date() : true;

  if (!invitation || expired || invitation.accepted_at) {
    return (
      <InviteCard title="Invitation unavailable">
        <p className="text-sm leading-6 text-zinc-500">This invitation is invalid, expired, or has already been accepted.</p>
        <Link href="/login" className="mt-5 inline-block rounded-lg border px-4 py-2 text-sm font-medium">Go to login</Link>
      </InviteCard>
    );
  }

  return (
    <InviteCard title={`Join ${agency?.name ?? "the agency"}`}>
      <p className="text-sm leading-6 text-zinc-500">
        You were invited as {formatLabel(invitation.role)} using <strong>{invitation.email}</strong>.
      </p>
      {query.sent && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Check your inbox for the secure sign-in link.</p>}
      {query.error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{query.error}</p>}
      <form action={sendInviteMagicLink} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white">Email me a secure sign-in link</button>
      </form>
    </InviteCard>
  );
}

function InviteCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Agency Desk invitation</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  );
}
