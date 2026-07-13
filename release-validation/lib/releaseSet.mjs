// Shared "release set" cutoff for suites 02/03/04.
//
// The release set is "migrations not yet applied to any real environment" —
// the ordering/idempotency/rollback-coverage checks only make sense for
// migrations that might still need to be replayed or reordered. This
// framework has no live DB connection by default, so it cannot detect that
// boundary automatically; it is a manually-maintained cutoff, bumped forward
// each time a batch of migrations is confirmed shipped.
//
// DATA-002: this cutoff used to be duplicated as an inline regex in three
// separate suite files (02, 03, 04). All three were bumped to 2026-06-28/29
// for the Phase 1 release and never touched again — every migration added
// since (10+ files, including three security/data-integrity fixes) was
// silently never checked by any of the three suites. Centralising the
// constant here means it only needs bumping in one place, and a future
// audit/maintainer has one obvious place to look.
//
// Bump RELEASE_SET_SINCE (inclusive, YYYYMMDD) forward whenever a batch of
// migrations is confirmed applied to production and no longer needs
// re-apply-safety/rollback scrutiny.
export const RELEASE_SET_SINCE = "20260628";

export function isInReleaseSet(filename) {
  const m = filename.match(/^(\d{8})/);
  if (!m) return false;
  return m[1] >= RELEASE_SET_SINCE;
}
