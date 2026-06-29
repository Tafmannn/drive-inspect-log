// Shared result vocabulary for the release-validation framework.
//
// Every check returns one of these statuses. The runner aggregates them into a
// suite status and an overall status, and decides the process exit code.
//
// Truth Mode contract:
//   - PASS         : the check was actually executed and met its criteria.
//   - WARNING      : executed; non-blocking concern a human should review.
//   - FAIL         : executed; criteria not met.
//   - NOT_EXECUTED : could not run here (no live env / missing credentials).
//                    NEVER reported as PASS. Does not, by itself, fail the run.
//   - SKIPPED      : intentionally filtered out via --only / --skip.
export const STATUS = Object.freeze({
  PASS: "PASS",
  WARNING: "WARNING",
  FAIL: "FAIL",
  NOT_EXECUTED: "NOT_EXECUTED",
  SKIPPED: "SKIPPED",
});

// Ordering used to roll many check statuses up into one. Higher index = more
// severe / more authoritative for the rolled-up value.
const SEVERITY = [
  STATUS.SKIPPED,
  STATUS.NOT_EXECUTED,
  STATUS.PASS,
  STATUS.WARNING,
  STATUS.FAIL,
];

export function rollup(statuses) {
  if (!statuses.length) return STATUS.NOT_EXECUTED;
  return statuses.reduce(
    (worst, s) => (SEVERITY.indexOf(s) > SEVERITY.indexOf(worst) ? s : worst),
    STATUS.SKIPPED,
  );
}

export function check(name, status, detail = "") {
  return { name, status, detail: String(detail) };
}

export const pass = (name, detail) => check(name, STATUS.PASS, detail);
export const warn = (name, detail) => check(name, STATUS.WARNING, detail);
export const fail = (name, detail) => check(name, STATUS.FAIL, detail);
export const notExecuted = (name, detail) =>
  check(name, STATUS.NOT_EXECUTED, detail);

export const ICON = Object.freeze({
  PASS: "✅",
  WARNING: "⚠️",
  FAIL: "❌",
  NOT_EXECUTED: "⏭️",
  SKIPPED: "⚪",
});
