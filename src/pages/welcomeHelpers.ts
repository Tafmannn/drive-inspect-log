import type { Session } from "@supabase/supabase-js";

/**
 * A customer-portal invite? portal-access stamps app_metadata.role="client"
 * server-side (users can't edit app_metadata). Used here ONLY to choose the
 * wording and the post-setup destination; portal access itself is still
 * enforced by PortalRoute / user_profiles.
 */
export function isPortalInvite(session: Session | null | undefined): boolean {
  const meta = (session?.user?.app_metadata ?? {}) as { role?: unknown; roles?: unknown };
  return meta.role === "client" || (Array.isArray(meta.roles) && meta.roles.includes("CLIENT"));
}

type WelcomeStage = "success" | "verifying" | "invalid" | "form";

/** Which part of the page to show (kept out of JSX to avoid nested ternaries). */
export function welcomeStage(success: boolean, hasSession: boolean | null): WelcomeStage {
  if (success) return "success";
  if (hasSession === null) return "verifying";
  if (hasSession === false) return "invalid";
  return "form";
}
