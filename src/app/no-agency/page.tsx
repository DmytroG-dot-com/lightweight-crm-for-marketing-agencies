import { signOut } from "@/actions/auth";
import { finishAccountSetup } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/auth";

export default async function NoAgencyPage() {
  const { user } = await requireUser();
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md border-y border-zinc-950 bg-white py-7">
        <h1 className="text-3xl font-normal uppercase leading-none tracking-[-0.05em]">Finish account setup</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {user.email} is authenticated, but agency setup did not finish. Retry it below.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <ActionForm action={finishAccountSetup}><button className="ui-action ui-action-primary">Finish setup</button></ActionForm>
          <ActionForm action={signOut}><button className="ui-action">Sign out</button></ActionForm>
        </div>
      </div>
    </main>
  );
}
