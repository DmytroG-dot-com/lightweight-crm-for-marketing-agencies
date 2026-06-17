"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgency, requireClient } from "@/lib/auth";

export async function toggleTaskWatch(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const watching = formData.get("watching") === "true";
  const context = await requireClient(clientId);
  const { data: task } = await context.supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (!task) throw new Error("Task not found.");

  const mutation = watching
    ? context.supabase
      .from("task_watchers")
      .delete()
      .eq("agency_id", context.agency.id)
      .eq("task_id", taskId)
      .eq("user_id", context.user.id)
    : context.supabase
      .from("task_watchers")
      .insert({ agency_id: context.agency.id, task_id: taskId, user_id: context.user.id });
  const { error } = await mutation;
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function openNotification(formData: FormData) {
  const notificationId = z.string().uuid().parse(formData.get("notification_id"));
  const context = await requireAgency();
  const { data: notification, error } = await context.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id)
    .select("client_id, task_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!notification) throw new Error("Notification not found.");
  const { data: task } = await context.supabase
    .from("tasks")
    .select("task_list_id")
    .eq("id", notification.task_id)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
  redirect(`/clients/${notification.client_id}?tab=tasks&list=${task?.task_list_id ?? "general"}&task=${notification.task_id}`);
}

export async function clearNotification(formData: FormData) {
  const notificationId = z.string().uuid().parse(formData.get("notification_id"));
  const context = await requireAgency();
  const now = new Date().toISOString();
  const { error } = await context.supabase
    .from("notifications")
    .update({ cleared_at: now, read_at: now })
    .eq("id", notificationId)
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

export async function restoreNotification(formData: FormData) {
  const notificationId = z.string().uuid().parse(formData.get("notification_id"));
  const context = await requireAgency();
  const { error } = await context.supabase
    .from("notifications")
    .update({ cleared_at: null })
    .eq("id", notificationId)
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

export async function setNotificationReadState(formData: FormData) {
  const notificationId = z.string().uuid().parse(formData.get("notification_id"));
  const unread = formData.get("unread") === "true";
  const context = await requireAgency();
  const { error } = await context.supabase
    .from("notifications")
    .update({ read_at: unread ? null : new Date().toISOString() })
    .eq("id", notificationId)
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id)
    .is("cleared_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const context = await requireAgency();
  const { error } = await context.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id)
    .is("read_at", null)
    .is("cleared_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}
