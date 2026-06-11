import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { provisionAgencyForUser } from "@/lib/provision";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") || "/clients";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/clients";
  const invite = z.string().uuid().safeParse(url.searchParams.get("invite"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          await provisionAgencyForUser(user, invite.success ? invite.data : null);
          return NextResponse.redirect(new URL(next, url.origin));
        } catch (provisionError) {
          await supabase.auth.signOut();
          const message = provisionError instanceof Error ? provisionError.message : "Unable to set up your agency.";
          return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));
        }
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=Unable%20to%20complete%20sign-in", url.origin));
}
