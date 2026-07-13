// Pagination-safe helpers around the GoTrue admin listUsers API.
//
// `admin.auth.admin.listUsers()` returns only the FIRST page (default 50
// users). Any lookup that relied on the un-paginated call silently broke once
// an instance grew past one page. These helpers walk every page so results are
// complete regardless of user count.

import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

const PER_PAGE = 200;

/**
 * Walk every page of listUsers, invoking `visit` for each user. Returning a
 * truthy value from `visit` stops the walk early and returns that user (used
 * for email lookups so we don't fetch every page unnecessarily).
 */
async function walkAuthUsers(
  admin: SupabaseClient,
  visit: (u: User) => boolean,
): Promise<User | null> {
  let page = 1;
  // Hard ceiling so a misbehaving backend can never spin forever.
  for (let guard = 0; guard < 10_000; guard++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      if (visit(u)) return u;
    }
    // `nextPage` is authoritative when present; fall back to a short-page
    // heuristic for older client versions that don't return it.
    const nextPage = (data as { nextPage?: number | null } | null)?.nextPage;
    if (typeof nextPage === "number" && nextPage > 0) {
      page = nextPage;
      continue;
    }
    if (nextPage === null) break;
    if (users.length < PER_PAGE) break;
    page++;
  }
  return null;
}

/** Find an auth user by email across all pages (case-insensitive). */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  return walkAuthUsers(admin, (u) => u.email?.toLowerCase() === target);
}

/** Collect every auth user across all pages. */
export async function listAllAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  await walkAuthUsers(admin, (u) => {
    all.push(u);
    return false;
  });
  return all;
}
