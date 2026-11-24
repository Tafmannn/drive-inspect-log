# A1 staging verification matrix — not executed
Prerequisites: Batch 00 definition parity, verified staging backup, isolated staging endpoints/credentials, no production data or external email/SMS/paid calls. Use unique run IDs, synthetic .invalid accounts, is_test jobs and actual private object uploads via storage API. Never reassign existing accounts. Do not log JWTs/passwords. Capture commit, migration versions, test ID, actual result and evidence. Clean only exact fixture IDs. Missing fixture is NOT EXECUTED, not PASS.
| Test | Finding | Actor / action | Expected |
|---|---|---|---|
| A1-01 | F01 | Active admins A/B with same logical exception key | own ack works, foreign read/update/delete denied; retry unique |
| A1-02 | F01 | Malformed/unattributed legacy ack | denied access; history retained |
| A1-03 | F19 | Driver A updates own profile | legitimate onboarding fields work; pay/compliance/activation/org edits denied |
| A1-04 | F19 | Admin A/B changes driver A | authorised scoped changes only, audit recorded |
| A1-05 | F20/F34 | Suspended driver with existing token and pending driver | operational DB/Storage/Edge denied; approved onboarding/self status retained |
| A1-06 | F20/F34 | Suspended admin with existing token | privileged RPC/Edge denied |
| A1-07 | F21 | Driver/admin A/admin B replace credential photograph | only authorised admin A succeeds; original retained and audit recorded |
| A1-08 | F21 | Activated then suspended driver | ID revoked; stale/offline not shown as live |
| A1-09 | F29 conditional | Cross-job/tenant/run damage links | rejected before privileged trigger; valid link works |
| A1-10 | Regression | Active assigned driver/admin/portal client | inspections, offline retry, abort and fee correction, invoice/POD/QR and portal preserved |
| A1-11 | F34 | Relevant Edge endpoints with anon/pending/suspended/active/foreign actors | correct authorisation and no unintended side effects |
| A1-12 | F20 | Existing Realtime subscription followed by suspension | deny new access; verify existing channel/revocation limitations and stale indicators |
Existing release-validation 12/13/14 plus actual negative REST/RPC/Storage/Edge cases required. SQL role simulation alone insufficient. All mandatory cases must pass before A1 is closed.
