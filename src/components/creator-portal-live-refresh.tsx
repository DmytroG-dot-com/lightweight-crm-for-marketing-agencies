"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT"
    || tagName === "TEXTAREA"
    || tagName === "SELECT"
    || target.isContentEditable;
}

export function CreatorPortalLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    function safeRefresh() {
      if (typeof document === "undefined") return;
      if (document.hidden) return;
      if (isInteractiveElement(document.activeElement)) return;
      router.refresh();
    }

    function handleVisibilityChange() {
      if (!document.hidden) safeRefresh();
    }

    window.addEventListener("focus", safeRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(safeRefresh, 20000);

    return () => {
      window.removeEventListener("focus", safeRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [router]);

  return null;
}
