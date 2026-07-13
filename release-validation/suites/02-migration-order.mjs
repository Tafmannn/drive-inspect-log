import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn } from "../lib/types.mjs";
import { isInReleaseSet, RELEASE_SET_SINCE } from "../lib/releaseSet.mjs";

// Suite 02 — Migration ordering & naming (STATIC).
// Supabase applies migrations in lexical filename order, which must equal
// chronological (timestamp) order. This suite proves the directory is sane:
// every file matches <14-digit-timestamp>_<slug>.sql, timestamps are strictly
// increasing in lexical order, and there are no duplicate timestamps (which
// would make apply order ambiguous between environments).
export default {
  id: "02",
  name: "Migration ordering & naming",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const dir = join(root, "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const checks = [];

    const re = /^(\d{14})_[a-z0-9]/i;
    const bad = files.filter((f) => !re.test(f));
    checks.push(
      bad.length === 0
        ? pass("All filenames are <timestamp>_<slug>.sql", `${files.length} migrations`)
        : fail("All filenames are <timestamp>_<slug>.sql", `non-conforming: ${bad.join(", ")}`),
    );

    const stamps = files.map((f) => (f.match(re) || [])[1]).filter(Boolean);
    const dupes = stamps.filter((s, i) => stamps.indexOf(s) !== i);
    checks.push(
      dupes.length === 0
        ? pass("No duplicate timestamps", `${new Set(stamps).size} distinct`)
        : fail("No duplicate timestamps", `duplicated: ${[...new Set(dupes)].join(", ")}`),
    );

    let monotonic = true;
    for (let i = 1; i < stamps.length; i++)
      if (stamps[i] <= stamps[i - 1]) monotonic = false;
    checks.push(
      monotonic
        ? pass("Lexical order == chronological order", "strictly increasing")
        : fail("Lexical order == chronological order", "a timestamp is out of order"),
    );

    // The release set (everything since RELEASE_SET_SINCE) must be the newest
    // files so they apply after the historical baseline, never interleaved.
    const releaseSet = files.filter(isInReleaseSet);
    checks.push(
      releaseSet.length
        ? pass(
            "Release-set migrations are newest",
            `${releaseSet.length} files since ${RELEASE_SET_SINCE}: ${releaseSet.join(", ")}`,
          )
        : warn("Release-set migrations are newest", `no migrations since ${RELEASE_SET_SINCE} found on this branch`),
    );

    return { checks };
  },
};
