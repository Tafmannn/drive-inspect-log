# Batch 00 catalogue reconciliation — 24 November 2026

Production and staging read-only catalogue fingerprints captured using the accompanying SELECT query. No row data, credentials or storage object paths collected. Baseline is tied to audited main ea975c251fd6cffd9b0f3353fff4c5d136b10c2d. Fingerprints are comparison aids, not backups or complete schema certification.

- Production groups: 433
- Staging groups: 254
- Missing groups: 179
- Different common groups: 92
- Staging-only groups: 0

Each group is an object plus category (columns, functions, policies, constraints, indexes, triggers, grants, views, relation flags or bucket configuration). Counts differ from individual column or policy counts in prior baseline. Hash differences can include benign environmental or formatting differences; resolve each with reviewed evidence. Do not copy production rows, secrets or live integrations. Staging still has 77 history entries and 46 unrecorded repo migrations. Aggregate inventory: one organisation, ten jobs, one auth account, no invoices, no storage.objects rows. Synthetic-only status not established. A restorable staging backup remains unverified.

Seven selected high-risk migrations screened for data-changing statements. Photo deduplication archives duplicates and clears backend_ref; pricing seal backfills values; pricing drop migration removes seven legacy columns. Abort migrations include updates inside operational functions. Do not replay without checking prerequisites and rehearsing recovery. This is not a complete 46-file migration review.

Run offline comparison:
`node scripts/staging/phase00-catalogue-compare.mjs --self-test`
`node scripts/staging/phase00-catalogue-compare.mjs docs/phase00/production-catalogue.json docs/phase00/staging-catalogue.json`

Expected result for these snapshots: exit 2 (differences). Re-run the read-only SELECT against verified staging after sync and compare. No A1 migration applied. No production changes.
