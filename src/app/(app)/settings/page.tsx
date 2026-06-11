import Link from "next/link";
import { createExternalCreator } from "@/actions/creative";
import {
  cancelTeamInvitation,
  inviteTeamMember,
  removeTeamMember,
  updateAgencyName,
  updateMemberName,
} from "@/actions/team";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireAgency } from "@/lib/auth";
import { formatLabel } from "@/lib/utils";

export default async function SettingsPage() {
  const context = await requireAgency();
  const canManageTeam = context.membership.role === "owner" || context.membership.role === "admin";
  const [{ data: members }, { data: invitations }, { data: creators }] = await Promise.all([
    context.supabase.from("agency_members").select("*").eq("agency_id", context.agency.id).order("created_at"),
    context.supabase
      .from("team_invitations")
      .select("*")
      .eq("agency_id", context.agency.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    context.supabase.from("external_creators").select("*").eq("agency_id", context.agency.id).order("name"),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader title="Settings" description={`${context.agency.name} · ${formatLabel(context.membership.role)}`} />
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Agency</h2>
          <form action={updateAgencyName} className="rounded-xl border bg-white p-4">
            <label className="text-sm font-medium">
              Agency name
              <input
                name="name"
                required
                disabled={!canManageTeam}
                defaultValue={context.agency.name}
                className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50"
              />
            </label>
            {canManageTeam && <button className="mt-3 rounded-lg border px-3 py-2 text-sm font-medium">Save name</button>}
          </form>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Invite teammate</h2>
          {canManageTeam ? (
            <form action={inviteTeamMember} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <label className="text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="teammate@agency.com" /></label>
              <label className="text-sm font-medium">Role<select name="role" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"><option value="member">Member</option><option value="admin">Admin</option></select></label>
              <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Create invite</button>
            </form>
          ) : (
            <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Only owners and admins can invite teammates.</p>
          )}
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Agency members</h2>
          <div className="overflow-hidden rounded-xl border bg-white">
            {members?.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <form action={updateMemberName} className="flex max-w-sm items-center gap-2">
                    <input type="hidden" name="membership_id" value={member.id} />
                    <input
                      name="display_name"
                      required
                      disabled={!(canManageTeam || member.user_id === context.user.id)}
                      defaultValue={member.display_name || member.email?.split("@")[0] || "Member"}
                      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium disabled:bg-zinc-50"
                    />
                    {(canManageTeam || member.user_id === context.user.id) && <button className="rounded-lg border px-2 py-1.5 text-xs font-medium">Save</button>}
                  </form>
                  <p className="mt-1 text-xs text-zinc-500">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-500">{formatLabel(member.role)}</span>
                  {canManageTeam && member.role !== "owner" && member.user_id !== context.user.id && (
                    <form action={removeTeamMember}>
                      <input type="hidden" name="membership_id" value={member.id} />
                      <button className="text-xs font-medium text-red-600">Remove</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!!invitations?.length && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pending invitations</h3>
              <div className="space-y-2">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between gap-4 rounded-xl border bg-white px-4 py-3">
                    <div><p className="text-sm font-medium">{invitation.email}</p><p className="text-xs text-zinc-500">{formatLabel(invitation.role)} · expires {new Date(invitation.expires_at).toLocaleDateString()}</p><Link href={`/invite/${invitation.token}`} target="_blank" className="mt-1 block break-all text-xs underline">{appUrl}/invite/{invitation.token}</Link></div>
                    {canManageTeam && <form action={cancelTeamInvitation}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="text-xs font-medium text-red-600">Cancel</button></form>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">External creators</h2>
          <form action={createExternalCreator} className="mb-3 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<input name="name" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Add creator</button>
          </form>
          {!creators?.length ? <EmptyState title="No external creators" description="Add a creator to assign creative assets." /> : (
            <div className="space-y-2">
              {creators.map((creator) => <div key={creator.id} className="rounded-xl border bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">{creator.name}</p><p className="text-xs text-zinc-500">{creator.email}</p></div><span className="text-xs text-zinc-500">{creator.active ? "Active" : "Inactive"}</span></div><Link href={`/creator/${creator.portal_token}`} target="_blank" className="mt-2 block break-all text-xs text-zinc-600 underline">{appUrl}/creator/{creator.portal_token}</Link></div>)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
