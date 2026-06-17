import Link from "next/link";
import { Bot, Building2, Clock3, UserPlus, UsersRound, WandSparkles } from "lucide-react";
import { removeAiSettings, resetAiTaskPrompt, saveAiSettings } from "@/actions/ai";
import { createExternalCreator } from "@/actions/creative";
import {
  cancelTeamInvitation,
  inviteTeamMember,
  removeTeamMember,
  updateAgencyName,
  updateMemberName,
  updateMemberRole,
} from "@/actions/team";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { UserTimezoneSettings } from "@/components/user-timezone-settings";
import { getAgencyAiSettingsForAdmin, getAgencyAiSettingsSummary } from "@/lib/ai/settings";
import { DEFAULT_TASK_PROMPT } from "@/lib/ai/task-prompt";
import { requireAgency } from "@/lib/auth";
import { formatDate, formatLabel } from "@/lib/utils";

export default async function SettingsPage() {
  const context = await requireAgency();
  const canManageTeam = context.membership.role === "owner" || context.membership.role === "admin";
  const aiSettingsQuery = canManageTeam
    ? getAgencyAiSettingsForAdmin(context.agency.id)
    : getAgencyAiSettingsSummary(context.agency.id).then((settings) => ({
      ...settings,
      taskPrompt: DEFAULT_TASK_PROMPT,
      taskPromptCustomized: false,
      taskPromptStorageReady: false,
      imageModelStorageReady: false,
    }));
  const [{ data: members }, { data: invitations }, { data: creators }, aiSettings] = await Promise.all([
    context.supabase.from("agency_members").select("*").eq("agency_id", context.agency.id).order("created_at"),
    context.supabase
      .from("team_invitations")
      .select("*")
      .eq("agency_id", context.agency.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    context.supabase.from("external_creators").select("*").eq("agency_id", context.agency.id).order("name"),
    aiSettingsQuery,
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader title="Settings" description={`${context.agency.name} · ${formatLabel(context.membership.role)}`} />
      <section className="mb-12">
        <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0">
            <h2 className="ui-section-title text-violet-700"><Bot className="size-3.5" />AI task parsing</h2>
            <p className="mt-1 text-xs text-zinc-500">OpenAI is used only server-side for task parsing, creative briefs, and test image generation. Relevant workspace context is sent only for the requested AI action.</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${aiSettings.enabled && aiSettings.configured ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
            {aiSettings.enabled && aiSettings.configured ? "Enabled" : "Not enabled"}
          </span>
        </div>
        {canManageTeam ? (
          <div className="border-y bg-white py-5">
            <form action={saveAiSettings} className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
              <label className="text-sm font-medium">
                OpenAI API key
                <input
                  name="api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={aiSettings.configured ? "Configured · leave blank to keep" : "sk-..."}
                  className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                Text model
                <input name="model" required defaultValue={aiSettings.model} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Image model
                <input
                  name="image_model"
                  required
                  disabled={!aiSettings.imageModelStorageReady}
                  defaultValue={aiSettings.imageModel}
                  className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500"
                />
              </label>
              <button className="ui-action ui-action-primary w-fit">Save AI settings</button>
              <label className="flex items-center gap-2 text-sm xl:col-span-4">
                <input name="enabled" type="checkbox" defaultChecked={aiSettings.enabled} />
                Enable natural-language task parsing
              </label>
              <label className="text-sm font-medium xl:col-span-4">
                Task AI prompt
                <textarea
                  name="task_prompt"
                  defaultValue={aiSettings.taskPrompt}
                  rows={18}
                  disabled={!aiSettings.taskPromptStorageReady}
                  spellCheck={false}
                  className="mt-1.5 w-full resize-y rounded-lg border px-3 py-2 font-mono text-xs leading-5 disabled:bg-zinc-50 disabled:text-zinc-500"
                />
                <span className="mt-1.5 block text-xs font-normal text-zinc-500">
                  {aiSettings.taskPromptStorageReady
                    ? "This is the system prompt used for every AI-created task. The CRM context and required JSON output schema are supplied separately."
                    : "Run Supabase migration 0005_ai_task_prompt.sql to enable custom task prompts. AI currently uses the default shown here."}
                </span>
                {!aiSettings.imageModelStorageReady && (
                  <span className="mt-1.5 block text-xs font-normal text-zinc-500">
                    Run Supabase migration `0022_ai_image_model.sql` to persist a custom image model. Until then, image generation uses the default.
                  </span>
                )}
              </label>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-zinc-500">
                {aiSettings.usesServerKey ? "Using the server OPENAI_API_KEY fallback." : "Stored keys are encrypted and never returned to the browser."}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {aiSettings.taskPromptCustomized && (
                  <form action={resetAiTaskPrompt}>
                    <button className="text-xs font-medium text-zinc-600">Reset task prompt to default</button>
                  </form>
                )}
                <form action={removeAiSettings}>
                  <button className="text-xs font-medium text-red-600">Disable and remove saved AI key</button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <p className="border-y bg-white py-5 text-sm text-zinc-500">Only owners and admins can configure AI task parsing.</p>
        )}
      </section>
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="ui-section-title mb-3 text-blue-700"><Building2 className="size-3.5" />Agency</h2>
          <form action={updateAgencyName} className="border-y bg-white py-5">
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
            {canManageTeam && <button className="ui-action mt-4">Save name</button>}
          </form>
        </section>
        <section>
          <h2 className="ui-section-title mb-3 text-blue-700"><UserPlus className="size-3.5" />Invite teammate</h2>
          {canManageTeam ? (
            <form action={inviteTeamMember} className="grid gap-3 border-y bg-white py-5 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <label className="text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="teammate@agency.com" /></label>
              <label className="text-sm font-medium">Role<select name="role" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"><option value="member">Member</option><option value="admin">Admin</option></select></label>
              <button className="ui-action ui-action-primary">Create invite</button>
            </form>
          ) : (
            <p className="rounded-xl border bg-white p-4 text-sm text-zinc-500">Only owners and admins can invite teammates.</p>
          )}
        </section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="ui-section-title mb-3 text-blue-700"><UsersRound className="size-3.5" />Agency members</h2>
          <div className="overflow-hidden border-y bg-white">
            {members?.map((member) => (
              <div key={member.id} className="flex flex-col items-start justify-between gap-3 border-b px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <form action={updateMemberName} className="flex max-w-sm flex-wrap items-center gap-2 sm:flex-nowrap">
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
                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                  {context.membership.role === "owner" && member.role !== "owner" ? (
                    <form action={updateMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="membership_id" value={member.id} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded-lg border px-2 py-1.5 text-xs font-medium text-zinc-600"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button className="rounded-lg border px-2 py-1.5 text-xs font-medium">Save</button>
                    </form>
                  ) : (
                    <span className="text-xs font-medium text-zinc-500">{formatLabel(member.role)}</span>
                  )}
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
                  <div key={invitation.id} className="flex flex-col items-start justify-between gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{invitation.email}</p><p className="text-xs text-zinc-500">{formatLabel(invitation.role)} · expires {formatDate(invitation.expires_at)}</p><Link href={`/invite/${invitation.token}`} target="_blank" className="mt-1 block break-all text-xs underline">{appUrl}/invite/{invitation.token}</Link></div>
                    {canManageTeam && <form action={cancelTeamInvitation}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="text-xs font-medium text-red-600">Cancel</button></form>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section>
          <h2 className="ui-section-title mb-3 text-violet-700"><WandSparkles className="size-3.5" />External creators</h2>
          <form action={createExternalCreator} className="mb-3 grid gap-3 border-y bg-white py-5 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<input name="name" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <label className="text-sm font-medium">Email<input name="email" type="email" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
            <button className="ui-action ui-action-primary w-fit">Add creator</button>
          </form>
          {!creators?.length ? <EmptyState title="No external creators" description="Add a creator to assign creative requests." /> : (
            <div className="space-y-2">
              {creators.map((creator) => <div key={creator.id} className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-medium">{creator.name}</p><p className="text-xs text-zinc-500">{creator.email}</p></div><span className="text-xs text-zinc-500">{creator.active ? "Active" : "Inactive"}</span></div><Link href={`/creator/${creator.portal_token}`} target="_blank" className="mt-2 block break-all text-xs text-zinc-600 underline">{appUrl}/creator/{creator.portal_token}</Link></div>)}
            </div>
          )}
        </section>
      </div>
      <section className="mt-16 max-w-xl">
        <h2 className="ui-section-title mb-3 text-zinc-400"><Clock3 className="size-3.5" />Personal time</h2>
        <UserTimezoneSettings timezone={context.membership.timezone} autoDetect={context.membership.timezone_auto} />
      </section>
    </>
  );
}
