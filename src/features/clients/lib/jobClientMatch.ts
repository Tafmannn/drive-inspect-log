/**
 * Suggest which client record an unlinked job belongs to.
 *
 * Pure and dependency-free so it can be unit-tested
 * (src/test/job-client-match.test.ts). Used by the "Link jobs to clients"
 * screen, where an admin always confirms before anything is linked.
 *
 * Jobs carry free-text client details (client_company, client_name,
 * client_email). Client records have a company, a `name` (usually the
 * contact person, sometimes the company again), and contact/billing emails.
 */

export interface MatchJob {
  id: string;
  client_company: string | null;
  client_name: string | null;
  client_email: string | null;
}

export interface MatchClient {
  id: string;
  name: string | null;
  company: string | null;
  email?: string | null;
  billing_email?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  is_active?: boolean | null;
}

export type MatchConfidence = "exact" | "likely";

export interface ClientSuggestion {
  clientId: string;
  confidence: MatchConfidence;
  reason: string;
}

export interface UnlinkedGroup<J extends MatchJob = MatchJob> {
  /** Stable key: normalised company|name|email, or "" for jobs with no client details. */
  key: string;
  /** What the jobs say, for display. Empty when nothing was recorded. */
  company: string;
  contact: string;
  jobs: J[];
  suggestion: ClientSuggestion | null;
}

/** Same rule as the database's normalize_client_name(): lower-case, letters and digits only. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Levenshtein distance, two-row implementation. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. Inputs should already be normalised. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/** Minimum similarity for a "likely" (typo-level) match, and minimum length to try one. */
export const LIKELY_THRESHOLD = 0.8;
const MIN_FUZZY_LENGTH = 5;

function companyKeys(c: MatchClient): string[] {
  return [normalizeName(c.company), normalizeName(c.name)].filter(Boolean);
}

/**
 * Best client for a job's recorded details, or null.
 *
 * exact  — the job's company (or a company typed into the contact field)
 *          equals a client's company/name once normalised, or the job's
 *          email equals one of the client's emails.
 * likely — a near-identical company name (typo-level, ≥ LIKELY_THRESHOLD),
 *          or the job's contact equals the client's contact person.
 * Active clients win ties; a tie between two different clients at the same
 * level gives no suggestion rather than a guess.
 */
export function suggestClient(job: Omit<MatchJob, "id">, clients: MatchClient[]): ClientSuggestion | null {
  const company = normalizeName(job.client_company);
  const contact = normalizeName(job.client_name);
  const email = normalizeEmail(job.client_email);
  const pool = [...clients].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false));

  const pickUnique = (hits: MatchClient[], confidence: MatchConfidence, reason: string): ClientSuggestion | null => {
    const ids = [...new Set(hits.map((c) => c.id))];
    if (ids.length === 0) return null;
    const active = hits.filter((c) => c.is_active !== false);
    const activeIds = [...new Set(active.map((c) => c.id))];
    if (ids.length === 1) return { clientId: ids[0], confidence, reason };
    if (activeIds.length === 1) return { clientId: activeIds[0], confidence, reason };
    return null; // ambiguous: let the admin choose
  };

  // Exact: company name.
  if (company) {
    const hit = pickUnique(pool.filter((c) => companyKeys(c).includes(company)), "exact", "Same company name");
    if (hit) return hit;
  }
  // Exact: a company typed into the contact field (older jobs).
  if (contact) {
    const hit = pickUnique(pool.filter((c) => normalizeName(c.company) === contact), "exact", "Same company name");
    if (hit) return hit;
  }
  // Exact: email.
  if (email) {
    const hit = pickUnique(
      pool.filter((c) => [c.email, c.billing_email, c.contact_email].some((e) => normalizeEmail(e) === email)),
      "exact",
      "Same email address",
    );
    if (hit) return hit;
  }

  // Likely: near-identical company name (either field).
  let best: { score: number; hits: MatchClient[] } = { score: 0, hits: [] };
  for (const value of [company, contact]) {
    if (value.length < MIN_FUZZY_LENGTH) continue;
    for (const c of pool) {
      for (const key of companyKeys(c)) {
        if (key.length < MIN_FUZZY_LENGTH) continue;
        const score = similarity(value, key);
        if (score > best.score) best = { score, hits: [c] };
        else if (score === best.score && score > 0) best.hits.push(c);
      }
    }
  }
  if (best.score >= LIKELY_THRESHOLD) {
    const hit = pickUnique(best.hits, "likely", "Similar company name — check the spelling");
    if (hit) return hit;
  }

  // Likely: same contact person.
  if (contact) {
    const hit = pickUnique(
      pool.filter((c) => [c.contact_name, c.name].some((n) => normalizeName(n) === contact)),
      "likely",
      "Same contact person",
    );
    if (hit) return hit;
  }

  return null;
}

/**
 * Group unlinked jobs by what they record about the client, each with one
 * suggestion. Jobs with no client details at all share the "" group, which
 * never gets a suggestion. Groups with details come first, largest first.
 */
export function groupUnlinkedJobs<J extends MatchJob>(jobs: J[], clients: MatchClient[]): UnlinkedGroup<J>[] {
  const groups = new Map<string, UnlinkedGroup<J>>();
  for (const job of jobs) {
    const company = (job.client_company ?? "").trim();
    const contact = (job.client_name ?? "").trim();
    const email = normalizeEmail(job.client_email);
    const key = company || contact || email
      ? [normalizeName(company), normalizeName(contact), email].join("|")
      : "";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        company,
        contact,
        jobs: [],
        suggestion: key ? suggestClient(job, clients) : null,
      };
      groups.set(key, group);
    }
    group.jobs.push(job);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return b.jobs.length - a.jobs.length || a.company.localeCompare(b.company);
  });
}
