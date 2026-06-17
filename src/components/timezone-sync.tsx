"use client";

import { useEffect, useRef, useTransition } from "react";
import { updateUserTimezone } from "@/actions/timezone";

export function TimezoneSync({
  savedTimezone,
  autoDetect,
}: {
  savedTimezone: string;
  autoDetect: boolean;
}) {
  const attempted = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!autoDetect || attempted.current) return;
    attempted.current = true;
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimezone || browserTimezone === savedTimezone) return;

    startTransition(async () => {
      try {
        await updateUserTimezone({ timezone: browserTimezone, auto: true });
      } catch {
        // Timezone detection should never block access to the workspace.
      }
    });
  }, [autoDetect, savedTimezone]);

  return null;
}
