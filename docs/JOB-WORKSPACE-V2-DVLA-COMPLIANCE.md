# Job Workspace V2 — DVLA compliance
Initial additive slice: job creation existing DVLA lookup displays compliance; pre-pickup job details have a manual check. The server returns optional fields and check timestamp, and the UI rejects mismatched registrations. No legal clearance is inferred. No change to inspection completion, abort, finance or status RPCs.
 
## Release gates / remaining work
- Run npm run typecheck, npm test, npm run build on the child branch.
- Test a real authorised DVLA lookup in staging; confirm both expiry spellings and absent markers, unknown statuses and network failures. Do not use production credentials without authorisation.
- Confirm policy, API quota and lookup purpose before adding automatic calls. No polling in this slice.
- Implement organisation-scoped, append-only server-authored job compliance history, permissions and RLS tests; validate job registration against the authoritative row.
- Implement deduplication/cache, automatic checks on dispatch/pre-collection, expiry against actual planned journey, command centre exceptions, and server-side movement gates after staging schema parity.
- Require a documented lawful exemption where applicable. No admin bypass of law; no gating of inspection evidence or abort requests. Keep failure/unknown explicitly unverified.
- Validate trade plate use, insurance and roadworthiness separately.
- No production merge or deploy without separate approval.
