import { supabase } from "@/integrations/supabase/client";

/**
 * VAPID *public* key — public by design (it's sent to the browser's push
 * service with every subscription); the private half lives server-side in
 * the service-role-only push_config table.
 */
export const VAPID_PUBLIC_KEY =
  "BL65MEObpL28qasQX55td7R3J1SCWpUQi7essnwqFgTJdiSAao9lBOrYnCfXrn0Wur1_YzcbxZ69Aun0TlxYWP8";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Explicit ArrayBuffer backing so the result satisfies BufferSource under
  // TS 5.7's generic TypedArray types.
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Whether this device already has an active push subscription. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission (must be called from a user gesture),
 * subscribe this device, and store the subscription for the signed-in user.
 * Returns "subscribed", "denied" or "error".
 */
export async function subscribeToPush(
  userId: string,
): Promise<"subscribed" | "denied" | "error"> {
  if (!isPushSupported()) return "error";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "error";

    const { error } = await supabase.from("push_subscriptions" as any).upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 255),
        platform: /iPhone|iPad|iPod/.test(navigator.userAgent)
          ? "ios"
          : /Android/.test(navigator.userAgent)
            ? "android"
            : "other",
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "endpoint" },
    );
    if (error) return "error";
    return "subscribed";
  } catch {
    return "error";
  }
}

/** Unsubscribe this device and remove its stored subscription row. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    const sub = await getPushSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from("push_subscriptions" as any).delete().eq("endpoint", endpoint);
  } catch {
    // Best-effort — an orphaned row is pruned server-side on first 410.
  }
}

/**
 * Fire-and-forget notify after a driver is assigned to a job. The edge
 * function authorises the caller (admin only), resolves the recipient and
 * builds the notification from trusted job data — only the jobId crosses
 * the wire. Never throws and never blocks the assignment flow.
 */
export function notifyJobAssigned(jobId: string): void {
  void supabase.functions
    .invoke("send-push", { body: { event: "job-assigned", jobId } })
    .catch(() => {});
}

/**
 * Fire-and-forget notify to the org's admins once a delivery inspection
 * (the POD) has been submitted. The edge function checks that the caller is
 * either that job's own assigned driver or an admin in its org, and builds
 * the notification from trusted job data. Never throws, never blocks
 * submission.
 */
export function notifyPodSubmitted(jobId: string): void {
  void supabase.functions
    .invoke("send-push", { body: { event: "pod-submitted", jobId } })
    .catch(() => {});
}
