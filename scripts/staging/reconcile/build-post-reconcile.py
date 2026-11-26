#!/usr/bin/env python3
"""Generate the post-replay staging reconciliation SQL from the verified
PRODUCTION catalogue export (export-schema.sql output, catalogue only).

Every statement is either copied verbatim from a production block or is one
of the explicit, reviewed hand-written type corrections below. The output is
rehearsed on a restored staging copy and must make the catalogue fingerprint
equal production's before it is applied to staging.

Usage: build-post-reconcile.py <prod-schema.sql> > post-reconcile.sql
"""
import re, sys

def blocks(p):
    t = open(p, encoding="utf-8", newline="").read()
    parts = re.split(r"(?m)^-- \[(\d\d)\] (.*)\n", t)
    return [(int(parts[i]), parts[i + 1], parts[i + 2].rstrip("\n")) for i in range(1, len(parts), 3)]

B = blocks(sys.argv[1])
out = []
def emit(title, stmts):
    out.append("\n-- " + "=" * 74 + "\n-- " + title + "\n-- " + "=" * 74)
    out.extend(stmts)
def find(sec, key=None, rx=None):
    r = [s for (sc, k, s) in B if sc == sec and (key is None or k == key) and (rx is None or re.search(rx, s, re.S))]
    if not r:
        raise SystemExit("missing production block: [%02d] %s %s" % (sec, key, rx))
    return r

VIEWS = ["active_driver_profiles", "user_effective_permissions", "user_permission_overrides_detailed", "user_permissions_matrix"]
TABLE_ACLS = ["driver_profiles", "permission_audit_log", "permissions_catalog", "role_permission_templates",
              "user_permission_overrides", "user_profiles"]
FUNCS = ["auto_link_job_to_client()", "catalogue_refresh_jobs()", "complete_job(p_job_id uuid, p_notes text)",
         "enqueue_customer_notification()", "guard_one_live_invoice_per_job()", "guard_user_profile_privileged_columns()",
         "handle_new_user()", "link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)",
         "portal_can_read_invoice_pdf(p_object_name text)", "portal_context()", "portal_get_invoice(p_invoice_id uuid)",
         "portal_get_job(p_job_id uuid)", "portal_list_invoices()", "portal_list_jobs()", "qr_lookup(p_token text)",
         "resolve_catalogue_image(", "rollback_inspection_submission(", "set_updated_at()", "user_role()"]

emit("1. Column types: staging's hand-reconstructed tables drifted from production (reviewed by hand)", [
    "DROP VIEW IF EXISTS public.active_driver_profiles;  -- depends on driver_profiles; recreated from production in section 7",
    "ALTER TABLE public.driver_profiles ALTER COLUMN max_daily_distance TYPE integer USING max_daily_distance::integer;",
    "DROP TRIGGER trg_invoices_abort_guard ON public.invoices;  -- references subtotal; recreated from production next",
    "ALTER TABLE public.invoices\n  ALTER COLUMN subtotal TYPE numeric(10,2),\n  ALTER COLUMN vat_rate TYPE numeric(5,2),\n"
    "  ALTER COLUMN vat_amount TYPE numeric(10,2),\n  ALTER COLUMN total TYPE numeric(10,2);",
] + find(13, "invoicestrg_invoices_abort_guard"))
emit("2. Column defaults (production)", sum([find(9, k) for k in [
    "driver_profilesautomatic_capable", "driver_profilesmanual_capable", "driver_profilesemployment_type",
    "driver_profileslicence_categories", "driver_profilespreferred_regions", "driver_profilesunavailable_regions",
    "invoicespayment_terms", "invoicesvat_amount"]], []))
emit("3. Constraints (production); FKs whose ON DELETE action differs are replaced", [
    "ALTER TABLE public.driver_profiles DROP CONSTRAINT driver_profiles_org_id_fkey;",
    "ALTER TABLE public.invoices DROP CONSTRAINT invoices_job_id_fkey;"] + sum([find(sec, k) for sec, k in [
    (10, "publicdriver_profilesdriver_profiles_employment_type_check"),
    (10, "publicdriver_profilesdriver_profiles_user_id_org_id_unique"),
    (10, "publicinvoicesinvoices_status_check"),
    (11, "publicdriver_profilesdriver_profiles_org_id_fkey"),
    (11, "publicinvoicesinvoices_job_id_fkey")]], []))
# Staging holds one orphan driver_profiles row (user_id has no user_profile/auth user).
# Enforce the production FK for all new writes without deleting unverified data.
out.append("-- EXCEPTION (documented): NOT VALID because of 1 pre-existing orphan row; validate after owner review")
out.extend([s.rstrip(";") + " NOT VALID;" for s in find(11, "publicdriver_profilesdriver_profiles_user_id_fkey")])
emit("4. Indexes", ["DROP INDEX public.idx_invoices_invoice_number;  -- staging-only; production uses invoices_org_number_unique"]
     + find(12, "idx_invoices_status") + find(12, "idx_jobs_driver_id"))
emit("5. Triggers (production photo-link triggers were created out-of-band; invoices trigger renamed)",
     ["DROP TRIGGER set_invoices_updated_at ON public.invoices;  -- staging-only duplicate of update_invoices_updated_at"]
     + sum([find(13, k) for k in ["inspectionsinspections_link_photos_after_ins", "inspectionsinspections_link_photos_after_update",
        "invoicesupdate_invoices_updated_at", "photostrg_link_photo_to_inspection_on_insert", "photostrg_link_photo_to_inspection_on_update"]], []))
emit("6. Policies. SECURITY: drop staging-only FOR ALL TO PUBLIC org-wide driver_profiles policy", [
    'DROP POLICY "Org members can manage driver_profiles" ON public.driver_profiles;']
     + find(15, 'publicapp_settingsSuper admins can write app_settings')
     + find(15, 'publicclient_logsAuthenticated users can read client_logs'))
emit("7. Views (production definitions, owners, grants)",
     sum([find(8, rx=r"^CREATE VIEW public\.%s " % v) for v in VIEWS], [])
     + sum([find(16, "public" + v) for v in VIEWS], [])
     + sum([[s for (sc, k, s) in B if sc == 17 and re.search(r" ON TABLE public\.%s " % v, s)] for v in VIEWS], []))
emit("8. Functions whose deployed production text differs only in formatting/comments (logic verified identical)",
     sum([find(7, rx=r"^CREATE OR REPLACE FUNCTION public\.%s" % re.escape(f.split("(")[0] + "(")) for f in FUNCS], []))
emit("9. Table privileges: reset to production ACLs (by role name)",
     ["REVOKE ALL ON TABLE public.%s FROM PUBLIC, anon, authenticated, service_role;" % t for t in TABLE_ACLS]
     + sum([[s for (sc, k, s) in B if sc == 17 and s.startswith("GRANT") and re.search(r" ON TABLE public\.%s " % t, s)] for t in TABLE_ACLS], []))
print("-- GENERATED by scripts/staging/reconcile/build-post-reconcile.py from the production catalogue export.\n"
      "-- STAGING ONLY. Never add to supabase/migrations or apply to production.\n" + "\n".join(out))
