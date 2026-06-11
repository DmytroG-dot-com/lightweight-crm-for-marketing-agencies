import { signOut } from "@/actions/auth";
import { finishAccountSetup } from "@/actions/team";
import { requireUser } from "@/lib/auth";

export default async function NoAgencyPage() {
  const { user } = await requireUser();
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md rounded-2xl border bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Finish account setup</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {user.email} is authenticated, but agency setup did not finish. Retry it below.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <form action={finishAccountSetup}><button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Finish setup</button></form>
          <form action={signOut}><button className="rounded-lg border px-4 py-2 text-sm font-medium">Sign out</button></form>
        </div>
      </div>
    </main>
  );
}
