# Batch 00 baseline checkpoint — 2026-11-24
Approved scope: Batch 00 / A1 only. Pinned main ea975c251fd6cffd9b0f3353fff4c5d136b10c2d; dispatch a78818c083176569173a99bf08d1b26ebd4c871c. No production writes or deployments. Branch phase00/batch00-a1.
## BLOCKED: staging parity and backup proof
Production history 120 entries; staging 77 (reconstructed aliases). Applying the existing sync script's version/prefix/slug matching rules, 46 repository migrations are not recorded as applied in staging. Do not blindly replay migrations.
| Inventory | Production | Staging | Missing keys | Different common keys | Staging only |
|---|---:|---:|---:|---:|---:|
| Public columns |729|528|222|1|21|
| Public/storage policies |147|101|55|26|9|
| Public functions |90|30|60|15|0|
Column keys: table.column and type/nullability; policy keys: name and command/predicates; function keys: name/signature and definition hash. This is not complete schema equivalence. Missing examples include abort corrections, invoice lifecycle, permission changes. No customer records extracted.

## Preflight
Run node scripts/staging/phase00-preflight.mjs --self-test without credentials. For live inventory use STAGING_DB_URL via protected environment, then node scripts/staging/phase00-preflight.mjs. The script only reads metadata and rejects non-allowlisted staging endpoints. Inventory floor is not semantic parity or backup proof. Existing sync script requires STAGING_BACKUP_VERIFIED=YES; never assert it without evidence.

## Required next steps
1. Verify restorable staging-only database backup and storage fixture recovery, isolated auth/storage and outbound provider settings.
2. Reconcile pending migrations using reviewed staging-only procedure, not blind history repair; compare definitions, grants, triggers, indexes, storage policies, and generated types; record deliberate exceptions.
3. Run existing baseline tests; investigate failures before applying A1.
4. Implement M01/M02 and F34; F29 only if prerequisites verified. Preserve onboarding, abort approvals/corrections and financial protections.
5. Run A1 test matrix. No production release or merge.
Current state: baseline blocked; A1 not implemented, no new runtime tests executed, no staging backup verified.
