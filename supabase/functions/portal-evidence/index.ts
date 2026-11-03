// portal-evidence — short-lived signed URLs for one job's delivery evidence
// (inspection photos + signatures), for a client-portal user.
//
// AUTHORIZATION: ownership is decided by calling the portal_get_job database
// function UNDER THE CALLER'S OWN JWT — the exact same check the portal page
// itself relies on — so there is a single source of truth for "is this your
// job". Only after that succeeds does the service role read photo rows and
// sign storage paths, and every path must additionally pass the fail-closed
// rules in _shared/portalEvidence.ts (inside jobs/<this job>/, inspection
// evidence types only, internal storage only).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonRes } from "../_shared/auth.ts";
import {
  PHOTO_BUCKET,
  SIGNATURE_BUCKET,
  isClientVisiblePhotoType,
  photoStoragePath,
  signatureStoragePath,
} from "../_shared/portalEvidence.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 3600;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "UNAUTHENTICATED" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    if (!UUID_RE.test(jobId)) return jsonRes({ error: "INVALID_JOB_ID" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const asCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: owned, error: ownErr } = await asCaller.rpc("portal_get_job", { p_job_id: jobId });
    if (ownErr || !owned) {
      // Not a portal user, not their job, or no such job — indistinguishable by design.
      return jsonRes({ error: "NOT_FOUND" }, 404);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: inspections, error: inspErr } = await admin
      .from("inspections")
      .select("id, type, driver_signature_url, customer_signature_url")
      .eq("job_id", jobId)
      .is("archived_at", null);
    if (inspErr) throw inspErr;

    const inspectionType = new Map<string, string>();
    for (const i of inspections ?? []) inspectionType.set(i.id, i.type);

    const { data: photoRows, error: photoErr } = await admin
      .from("photos")
      .select("id, type, label, inspection_id, backend, backend_ref, url, created_at")
      .eq("job_id", jobId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (photoErr) throw photoErr;

    let unavailable = 0;
    const photoCandidates: { id: string; type: string; label: string | null; inspection_type: string | null; path: string }[] = [];
    for (const p of photoRows ?? []) {
      if (!isClientVisiblePhotoType(p.type)) continue;
      // A photo tied to a superseded (archived) inspection is not current evidence.
      if (p.inspection_id && !inspectionType.has(p.inspection_id)) continue;
      const path = photoStoragePath(p, jobId);
      if (!path) {
        unavailable++;
        continue;
      }
      const inferred = p.type.startsWith("pickup_") ? "pickup" : p.type.startsWith("delivery_") ? "delivery" : null;
      photoCandidates.push({
        id: p.id,
        type: p.type,
        label: p.label ?? null,
        inspection_type: (p.inspection_id ? inspectionType.get(p.inspection_id) : null) ?? inferred,
        path,
      });
    }

    const photos: { id: string; type: string; label: string | null; inspection_type: string | null; url: string }[] = [];
    if (photoCandidates.length > 0) {
      const { data: signed, error: signErr } = await admin.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(photoCandidates.map((c) => c.path), SIGNED_URL_TTL_SECONDS);
      if (signErr) throw signErr;
      photoCandidates.forEach((c, idx) => {
        const url = signed?.[idx]?.signedUrl;
        if (url) photos.push({ id: c.id, type: c.type, label: c.label, inspection_type: c.inspection_type, url });
        else unavailable++;
      });
    }

    const sigCandidates: { inspection_type: string; signer: "driver" | "customer"; path: string }[] = [];
    for (const i of inspections ?? []) {
      const d = signatureStoragePath(i.driver_signature_url, jobId);
      if (d) sigCandidates.push({ inspection_type: i.type, signer: "driver", path: d });
      else if (i.driver_signature_url) unavailable++;
      const c = signatureStoragePath(i.customer_signature_url, jobId);
      if (c) sigCandidates.push({ inspection_type: i.type, signer: "customer", path: c });
      else if (i.customer_signature_url) unavailable++;
    }

    const signatures: { inspection_type: string; signer: "driver" | "customer"; url: string }[] = [];
    if (sigCandidates.length > 0) {
      const { data: signed, error: signErr } = await admin.storage
        .from(SIGNATURE_BUCKET)
        .createSignedUrls(sigCandidates.map((c) => c.path), SIGNED_URL_TTL_SECONDS);
      if (signErr) throw signErr;
      sigCandidates.forEach((c, idx) => {
        const url = signed?.[idx]?.signedUrl;
        if (url) signatures.push({ inspection_type: c.inspection_type, signer: c.signer, url });
        else unavailable++;
      });
    }

    return jsonRes({ photos, signatures, unavailable, expires_in: SIGNED_URL_TTL_SECONDS });
  } catch (e) {
    console.error("portal-evidence error:", e instanceof Error ? e.message : e);
    return jsonRes({ error: "INTERNAL_ERROR" }, 500);
  }
});
