import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type ActivityInput = {
  agencyId: string;
  actorId?: string | null;
  clientId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logActivity(supabase: SupabaseClient, input: ActivityInput) {
  const { error } = await supabase.from("activity_logs").insert({
    agency_id: input.agencyId,
    actor_id: input.actorId ?? null,
    client_id: input.clientId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) console.error("Activity log insert failed:", error.message);
}
