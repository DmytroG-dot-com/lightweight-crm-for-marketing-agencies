"use client";

export const INBOX_UNREAD_REFRESH_EVENT = "inbox-unread-refresh";

export function dispatchInboxUnreadRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INBOX_UNREAD_REFRESH_EVENT));
}
