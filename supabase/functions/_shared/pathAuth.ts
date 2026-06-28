// Pure, dependency-free storage path-authorization logic.
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/storage-path-auth.test.ts) and reused by _shared/auth.ts.
//
// All GCS/signature object paths are of the form `jobs/<jobId>/...`, so the
// owning job (and hence org) is derivable from the path. Anything that does not
// embed a valid job UUID is rejected (fail closed).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the job UUID from a storage object path of the form
 * `jobs/<jobId>/...`. Returns null when the path has no valid job segment.
 */
export function extractJobIdFromPath(objectPath: string): string | null {
  if (!objectPath || typeof objectPath !== "string") return null;
  const match = objectPath.match(/(?:^|\/)jobs\/([^/]+)\//);
  const jobId = match?.[1];
  if (!jobId || !UUID_RE.test(jobId)) return null;
  return jobId;
}
