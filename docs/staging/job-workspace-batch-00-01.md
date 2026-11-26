# Job Workspace V2: Batch 00 / 01 reconciliation record

Baseline code: `cf0c94e4275343c42a01bcf3851b044438557297` (production-matched).
Production project: Vehicle App. Hosted staging: axentra-staging. Read-only inventory on 25 November 2026.

## Gate: BLOCKED
The runbook `docs/staging/free-tier-validation.md` requires a real staging backup, isolated restoration proof, and reviewed schema diff before repair. No such backup/restore proof was available via the connected database APIs. No migration or mutation has been executed against either hosted database. Do not replay this branch or baseline migrations against hosted staging blindly.

Production: 44 public tables; staging: 28.
Production-only tables (16):
- customer_notifications
- driver_digital_credential_events
- driver_digital_credentials
- invoice_expenses
- job_abort_events
- job_abort_invoice_corrections
- job_abort_requests
- job_aborts
- job_pricing
- job_status_overrides
- permission_audit_log
- permissions_catalog
- push_config
- push_subscriptions
- role_permission_templates
- user_permission_overrides
Staging-only tables (0):
- None
Production-only function signatures (63):
- abort_eligible_statuses()
- activate_user_account(p_target_user_id uuid)
- allocate_credit_note_number(p_org_id uuid)
- amend_approved_job_abort_claim(p_abort_id uuid, p_new_amount numeric, p_reason text, p_expected_amount numeric, p_client_confirmed boolean)
- archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean)
- audit_app_settings_change()
- auto_link_job_to_client()
- can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text)
- can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid)
- cancel_invoice(p_invoice_id uuid, p_reason text)
- confirm_job_abort(p_job_id uuid, p_contact_name text, p_no_name_exception boolean, p_expected_status text)
- correct_invoiced_job_abort_fee(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_multi_job_acknowledged boolean, p_paid_acknowledged boolean)
- create_abort_replacement_job(p_job_id uuid)
- current_actor_email()
- current_driver_profile_id()
- current_user_has_permission(p_permission_key text)
- delete_user_permission_override(p_target_user_id uuid, p_permission_key text)
- delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text)
- dismiss_job_abort_request(p_request_id uuid, p_note text)
- driver_can_access_expense(p_expense_id text)
- driver_can_read_inspection_evidence(p_inspection_id uuid)
- driver_can_read_job_evidence(p_job_id uuid)
- driver_can_use_job_path(p_name text)
- driver_owns_job(p_job_id uuid)
- enqueue_customer_notification()
- expense_is_invoiced(p_expense_id uuid)
- get_driver_digital_id(p_user_id uuid)
- guard_abort_invoicing()
- guard_driver_digital_id_state()
- guard_job_abort_status()
- guard_job_driver_writes()
- guard_one_live_invoice_per_job()
- guard_photo_identity_columns()
- guard_user_profile_privileged_columns()
- inherit_is_test_from_job()
- invoice_lines_guard_lifecycle()
- invoices_guard_lifecycle()
- is_protected_user(p_user_id uuid)
- link_corrected_abort_invoice()
- link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
- link_photo_to_inspection_on_insert()
- link_photo_to_inspection_on_update()
- link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text)
- normalize_client_name(input text)
- notify_customer_job_aborted(p_abort_id uuid)
- portal_can_read_invoice_pdf(p_object_name text)
- portal_client_id()
- portal_context()
- portal_get_invoice(p_invoice_id uuid)
- portal_get_job(p_job_id uuid)
- portal_list_invoices()
- portal_list_jobs()
- request_job_abort(p_job_id uuid)
- restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean)
- review_job_abort_claim(p_abort_id uuid, p_decision text, p_amount numeric, p_note text, p_client_confirmed boolean)
- role_rank(p_role text)
- set_driver_digital_id_photo(p_user_id uuid, p_photo_path text)
- stamp_client_log_identity()
- super_admin_override_job_status(p_job_id uuid, p_new_status text, p_reason text)
- suspend_user_account(p_target_user_id uuid, p_reason text)
- trg_inspections_link_photos()
- upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text)
- user_has_permission(p_user_id uuid, p_permission_key text)
Staging-only function signatures (0):
- None

Signature matches do not prove body, grants, policy, trigger, storage or extension parity. Never repair migration history by matching these counts. The next environment steps are: verify a protected backup/restore from the existing staging database, compare schema and migrations including the production Digital ID hotfix (#191), rebuild a disposable local Supabase baseline with synthetic fixtures, review differences in dependency order, then apply to staging and run negative/positive role tests. No customer records or secrets should enter CI artifacts.

## Batch 01 code
Three forward migrations: credit authorisation, tenant-scoped acknowledgements and deferred corrections. They are proposed branch migrations only; timestamps were allocated for repository ordering because local Supabase CLI was unavailable. Verify their names and current migration head before applying. Existing unlinked acknowledgements remain quarantined with NULL org_id, not deleted; audit their provenance before assigning ownership. Existing acknowledgement snapshots use an atomic upsert; this does not implement the later personal completed-action history workstream.

## Rollback
Fail closed: disable affected financial actions during any incompatible frontend rollback; do not restore unauthorised issued cancellation. Preserve issued documents, pending requests, and original acknowledgement records; do not drop the new tables or audit history. If migration is not yet committed the SQL transaction rolls back. If applied, use a reviewed corrective forward migration after backing up and confirming data ownership, never a destructive down migration. The deferred queue is non-financial; review requests require fresh authorisation. An unrelated invoice cancellation must not silently close an abort-fee review.

## Tests
Run `npm run ci` and `scripts/free-tier/run-local-scenarios.sh` on a verified disposable database; neither may be considered passed without an actual result. The existing invoice SQL fixture uses legacy schema assumptions and may require reconciliation with the latest pricing-table split. Check financial consent stale-status/amount binding, direct table grants, role isolation and real mobile rendering before release. No production merge or deployment authorised.


## Follow-up: 25 November 2026, staging remediation verification

The preceding inventory describes the original state, not the current database. PRs #196 and #197 document the independently restored encrypted pre-recovery archive (64/64 table digests, 237/237 catalogue groups), production-parity reconciliation, and subsequent staging workflow tests. Direct catalogue comparison of the reconciled staging and production projects found 44/44 tables, 747/747 column definitions, 93/93 function definitions and 113/113 public RLS policy definitions matching. This does not certify every platform-managed setting, grant, trigger, storage object or migration ledger entry.

The earlier archive predates the new schema, synthetic fixtures and two staging storage object records. Its private bytes were not available for independent restoration in this session. The current-state backup/restore gate remains open: capture the current staging state and storage objects using PR #196's protected recovery tooling, restore outside hosted staging, compare catalogue/table digests and record checksum and restoration evidence. Do not place archives, credentials or private data in Git.

On branch commit `b6398370b67ad4b7d2128bfcaab64f0e405058a5`, staging-only transactions executed the three forward migrations and re-executed them, and then rolled back. Actual database scenarios passed:
- Same-org acknowledgement upsert, cross-org read/write denial, independent identical IDs in two orgs, actor spoof denial and driver denial.
- Issued invoice credit consent and legacy bypass denial; stale amount, status and missing confirmation refusal; direct issued cancellation, direct credit insertion and draft conversion into credit note denied.
- Deferred correction idempotence, unchanged issued original, no credit, withdrawal history, tenant isolation, driver denial; draft cancellation; explicit exact full credit; duplicate refusal; queue closure.
- Abort fee correction: ordinary admin denied, missing client consent denied, legacy credit bypass denied, stale amount denied, deferred fee unchanged, invalid fee rolls back the credit and invoice cancellation, authorised correction creates one exact credit with an audit record and closes the pending abort review.
- All three emergency rollback scripts executed within the same transaction: financial and acknowledgement mutations disabled, history and tenant visibility restrictions retained, direct credit guard retained.
- Post-transaction catalogue checks confirmed the new correction table was absent. No persistent staging migration or production write was made.

PR #193's initial 2,071/2,071 tests passed. The initial Sonar issues were addressed in `4897bb2`; migration reapplication guards and all three containment scripts were added. Subsequent CI runs must be reviewed at their final exact commit; the historical disposable full-replay bootstrap remains blocked. Do not equate rolled-back staging SQL rehearsal with persisted installation or full browser/HTTP release validation.

Cross-branch coordination: #197 and #198 contain staging environment and preview safeguards; review and integrate their compatible changes before a preview is built. Their previous financial scenarios rely on the old implicit-credit semantics and need to be updated for this PR when combined. Do not merge any branch to main or deploy production under this approval.
