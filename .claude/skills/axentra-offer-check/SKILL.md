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
   - `loaded` {minutes, fuelCost | fuelPaidByClient:true}: driving the customer vehicle.
   - `returnLeg` {minutes, cost}: home after delivery. `null` only for a job followed by another in the same chain.
   - `inspectionMinutes` (appraisals can be long), optional `waitingMinutes`, `tollsAndZoneCharges` (CAZ/ULEZ/tolls not recharged), `driverCost` (subcontract pay), `platformFeeFraction`.
   - If the user gives only estimates, keep them, set `startConfirmed:false` where relevant, and say the figures are estimates.
2. **Write the JSON** (one object, or an array for a chain in driving order) to the scratchpad and run:
   `npx vite-node scripts/offer-check.ts -- <file.json>` (add `--json` for machine-readable output).
3. **Report** in 3–5 lines: verdict, contribution and £/hour vs target, dead-time share, and the **target price** to counter with when the verdict is NEGOTIATE. Repeat any `Missing:` and `Warnings:` lines verbatim. If PROVISIONAL, say it must not be treated as a firm plan.

## Rules

- Contribution = price − direct job costs. It is not profit or take-home pay; never call it either.
- Targets come from `policy.json` in this folder; values marked ASSUMPTION are unconfirmed. Mention that if the user has not confirmed them.
- Do not accept, bid, decline or message anyone on Movex, Revilo or any platform. The owner acts.
- Chains: a weak job can be worth taking if it positions the driver for a strong one — compare the CHAIN line, not each job alone.
