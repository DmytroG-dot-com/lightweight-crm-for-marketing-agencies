"use client";

import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateUserTimezone } from "@/actions/timezone";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Kyiv",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

export function UserTimezoneSettings({
  timezone,
  autoDetect,
}: {
  timezone: string;
  autoDetect: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(timezone);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function save(nextTimezone: string, auto: boolean) {
    setMessage("");
    startTransition(async () => {
      try {
        await updateUserTimezone({ timezone: nextTimezone, auto });
        setValue(nextTimezone);
        setMessage(auto ? "Using browser timezone" : "Timezone saved");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save timezone.");
      }
    });
  }

  function useBrowserTimezone() {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimezone) {
      setMessage("Your browser did not provide a timezone.");
      return;
    }
    save(browserTimezone, true);
  }

  return (
    <div className="border-y bg-white py-5">
      <label className="block text-sm font-medium">
        Your timezone
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          list="common-timezones"
          disabled={pending}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50"
          placeholder="America/New_York"
        />
        <datalist id="common-timezones">
          {COMMON_TIMEZONES.map((item) => <option key={item} value={item} />)}
        </datalist>
      </label>
      <p className="mt-2 text-xs text-zinc-500">
        Used for My Work day boundaries and displayed activity times. {autoDetect ? "Currently follows this browser." : "Manual override enabled."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" disabled={pending} onClick={() => save(value, false)} className="ui-action">
          Save timezone
        </button>
        <button type="button" disabled={pending} onClick={useBrowserTimezone} className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <LocateFixed className="size-3.5" />Use browser timezone
        </button>
        {message && <span className="text-xs text-zinc-500">{message}</span>}
      </div>
    </div>
  );
}
