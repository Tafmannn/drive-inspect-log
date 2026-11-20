---
name: axentra-offer-check
description: Decide whether to bid on, accept, counter or decline a vehicle-movement job or a run of back-to-back jobs (Movex, Revilo, direct customers) by contribution per working hour. Use when the user pastes or describes a job offer, asks "is this worth it", "what should I quote", or wants to chain jobs. Decision support only — never accepts, bids or declines on any platform.
---

# Axentra offer check

Deterministic calculator: `src/lib/offerEvaluator.ts` (tested in `src/test/offer-evaluator.test.ts`). Do not do the maths yourself — run the script.

## Steps

1. **Collect inputs per job.** Ask only for what is missing. Never invent a time, cost or distance.
   - `offeredPrice` (£ as offered, before platform fee) — or omit to get a quote price.
   - `startConfirmed`: true only if positioning starts from the driver's **last confirmed location** (where they actually are or will be after a booked job), not a guess.
   - `positioning` {minutes, cost}: door-to-door from that location to collection (trains, buses, taxis).
   - `loaded` {minutes, fuelPolicy | fuelCost | fuelPaidByClient:true}: driving the customer vehicle. **Fuel depends on the client** (see "Fuel" below).
   - `returnLeg` {minutes, cost}: home after delivery. `null` only for a job followed by another in the same chain.
   - `inspectionMinutes` (appraisals can be long), optional `waitingMinutes`, `tollsAndZoneCharges` (CAZ/ULEZ/tolls not recharged), `driverCost` (subcontract pay), `platformFeeFraction`.
   - If the user gives only estimates, keep them, set `startConfirmed:false` where relevant, and say the figures are estimates.
   - **Fuel.** Each client is set to either `recharged` (the client pays fuel on top, so it is not our cost) or `included` (the price already covers fuel, so it IS our cost). Look it up read-only, never guess it: `select name, company, fuel_policy from clients where company ilike '%<name>%' or name ilike '%<name>%'` (Supabase SQL, read-only). Then pass `loaded.fuelPolicy: "recharged"` or `"included"`. For `included`, ask for the fuel cost and pass `loaded.fuelCost`. If the client is not in the system (a new customer or a platform job with no client record), ask the user which applies; do not assume. `fuelPaidByClient: true` still works as an explicit "this one is recharged"; if it contradicts an `included` client the script warns, so repeat that warning.
2. **Write the JSON** (one object, or an array for a chain in driving order) to the scratchpad and run:
   `npx vite-node scripts/offer-check.ts -- <file.json>` (add `--json` for machine-readable output).
3. **Report** in 3–5 lines: verdict, contribution and £/hour vs target, dead-time share, and the **target price** to counter with when the verdict is NEGOTIATE. Repeat any `Missing:` and `Warnings:` lines verbatim. If PROVISIONAL, say it must not be treated as a firm plan.

## Rules

- Contribution = price − direct job costs. It is not profit or take-home pay; never call it either.
- Targets come from `policy.json` in this folder; values marked ASSUMPTION are unconfirmed. Mention that if the user has not confirmed them.
- Do not accept, bid, decline or message anyone on Movex, Revilo or any platform. The owner acts.
- Chains: a weak job can be worth taking if it positions the driver for a strong one — compare the CHAIN line, not each job alone.
