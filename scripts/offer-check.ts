/**
 * CLI for the axentra-offer-check skill.
 *
 *   npx vite-node scripts/offer-check.ts -- <offer.json> [--policy <policy.json>] [--json]
 *
 * <offer.json> is one OfferInput object, or an array of them for a chain of
 * back-to-back jobs (see src/lib/offerEvaluator.ts). No network, no DB.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateOffer,
  evaluateChain,
  policyFromWeeklyTarget,
  type OfferEvaluation,
  type OfferInput,
} from "../src/lib/offerEvaluator";

const args = process.argv.slice(2).filter((a) => a !== "--");
const jsonOut = args.includes("--json");
const policyIdx = args.indexOf("--policy");
const policyPath = policyIdx >= 0 ? args[policyIdx + 1] : ".claude/skills/axentra-offer-check/policy.json";
const offerPath = args.find((a, i) => !a.startsWith("--") && (policyIdx < 0 || i !== policyIdx + 1));

if (!offerPath) {
  console.error("usage: npx vite-node scripts/offer-check.ts -- <offer.json> [--policy <policy.json>] [--json]");
  process.exit(2);
}

const p = JSON.parse(readFileSync(resolve(policyPath), "utf8"));
const policy = policyFromWeeklyTarget(p);
const input = JSON.parse(readFileSync(resolve(offerPath), "utf8")) as OfferInput | OfferInput[];
const result = Array.isArray(input) ? evaluateChain(input, policy) : evaluateOffer(input, policy);

if (jsonOut) {
  console.log(JSON.stringify({ policy, result }, null, 2));
} else {
  const gbp = (n: number | null) => (n == null ? "—" : `£${n.toFixed(2)}`);
  const hm = (m: number | null) => (m == null ? "—" : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
  const line = (label: string, r: Omit<OfferEvaluation, "ref">) =>
    `${label}: ${r.verdict.toUpperCase()}${r.provisional ? " (PROVISIONAL)" : ""} | price ${gbp(r.price)} | direct costs ${gbp(r.directCosts)} | contribution ${gbp(r.contribution)} | time ${hm(r.totalMinutes)} | ${gbp(r.contributionPerHour)}/h | dead time ${r.deadTimeShare == null ? "—" : Math.round(r.deadTimeShare * 100) + "%"} | break-even ${gbp(r.breakEvenPrice)} | target price ${gbp(r.targetPrice)}`;
  console.log(`Policy: £${policy.targetContributionPerHour}/h target, £${policy.minContributionPerJob} minimum per job`);
  if ("jobs" in result) {
    result.jobs.forEach((j, i) => console.log("  " + line(`job ${i + 1}${j.ref ? ` ${j.ref}` : ""} (own share, no shared legs)`, j)));
    console.log(line("CHAIN", result));
  } else {
    console.log(line(result.ref ?? "OFFER", result));
  }
  if (result.missing.length) console.log("Missing: " + result.missing.join("; "));
  if (result.warnings.length) console.log("Warnings: " + result.warnings.join("; "));
  console.log("Contribution = price minus direct job costs. Not profit, not take-home pay.");
}
