import { supabase } from '@/integrations/supabase/client';
import type {
  Job,
  JobWithRelations,
  Inspection,
  DamageItem,
  Photo,
  JobActivityLog,
  InspectionType,
} from './types';
import { JOB_STATUS, ACTIVE_STATUSES, PENDING_STATUSES, ADMIN_ALLOWED_TRANSITIONS } from './statusConfig';
import { logClientEvent } from './logger';
import { getOrgId } from './orgHelper';

// Statuses that re-open a completed/cancelled job. These go through the
// reopen_job RPC which soft-archives prior evidence and starts a new run.
const REOPEN_TARGET_STATUSES = new Set<string>([
  JOB_STATUS.READY_FOR_PICKUP,
  JOB_STATUS.ASSIGNED,
]);
const REOPENABLE_FROM_STATUSES = new Set<string>([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.CANCELLED,
  JOB_STATUS.FAILED,
  JOB_STATUS.POD_READY,
  JOB_STATUS.DELIVERY_COMPLETE,
]);

// ─── Jobs ────────────────────────────────────────────────────────────

export async function listJobs(filter?: { statuses?: string[] }): Promise<Job[]> {
  let query = supabase.from('jobs').select('*').eq('is_hidden', false).order('job_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  if (filter?.statuses?.length) {
    query = query.in('status', filter.statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function listActiveJobs(): Promise<Job[]> {
  return listJobs({ statuses: ACTIVE_STATUSES as string[] });
}

export async function listCompletedJobs(): Promise<Job[]> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('is_hidden', false)
    .eq('status', JOB_STATUS.COMPLETED)
    .not('completed_at', 'is', null)
    .gte('completed_at', fourteenDaysAgo.toISOString())
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function listPendingJobs(): Promise<Job[]> {
  return listJobs({ statuses: PENDING_STATUSES as string[] });
}

export async function getJob(jobId: string): Promise<Job> {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (error) throw error;
  return data as Job;
}

export async function getJobWithRelations(jobId: string): Promise<JobWithRelations> {
  // Active-run filter: archived_at IS NULL excludes evidence from prior runs
  // (a job that was reopened by an admin soft-archives the previous run).
  const [jobRes, inspRes, photoRes, actRes] = await Promise.all([
    supabase.from('jobs').select('*, driver_profiles(display_name, full_name)').eq('id', jobId).single(),
    (supabase.from('inspections').select('*').eq('job_id', jobId) as any).is('archived_at', null),
    (supabase.from('photos').select('*').eq('job_id', jobId) as any).is('archived_at', null),
    supabase.from('job_activity_log').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
  ]);
  if (jobRes.error) throw jobRes.error;

  const inspections = (inspRes.data ?? []) as Inspection[];
  const inspectionIds = inspections.map((i) => i.id);

  let damageItems: DamageItem[] = [];
  if (inspectionIds.length > 0) {
    const { data } = await (supabase.from('damage_items').select('*').in('inspection_id', inspectionIds) as any).is('archived_at', null);
    damageItems = (data ?? []) as DamageItem[];
  }

  // Resolve assigned driver name via FK join, with fallback chain
  const raw = jobRes.data as any;
  const dp = raw.driver_profiles;
  const resolvedDriverName = dp
    ? (dp.display_name || dp.full_name || raw.driver_name)
    : (raw.driver_name || null);

  return {
    ...(raw as Job),
    resolvedDriverName,
    inspections,
    photos: (photoRes.data ?? []) as Photo[],
    damage_items: damageItems,
    activity_log: (actRes.data ?? []) as JobActivityLog[],
  };
}

async function generateJobNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_job_number');
  if (error) throw error;
  return data as string;
}

export async function createJob(input: Partial<Omit<Job, 'id' | 'status' | 'has_pickup_inspection' | 'has_delivery_inspection' | 'completed_at' | 'created_at' | 'updated_at'>> & Pick<Job, 'vehicle_reg' | 'vehicle_make' | 'vehicle_model' | 'vehicle_colour' | 'pickup_contact_name' | 'pickup_contact_phone' | 'pickup_address_line1' | 'pickup_city' | 'pickup_postcode' | 'delivery_contact_name' | 'delivery_contact_phone' | 'delivery_address_line1' | 'delivery_city' | 'delivery_postcode'>): Promise<Job> {
  const orgId = await getOrgId();
  const payload = { ...input, org_id: orgId } as any;
  if (!payload.external_job_number) {
    payload.external_job_number = await generateJobNumber();
  }
  const { data, error } = await supabase.from('jobs').insert(payload).select().single();
  if (error) throw error;
  await logJobActivity(data.id, 'job_created', undefined, JOB_STATUS.READY_FOR_PICKUP);
  return data as Job;
}

export async function updateJob(jobId: string, input: Partial<Job>): Promise<Job> {
  const { data, error } = await supabase.from('jobs').update(input as any).eq('id', jobId).select().single();
  if (error) throw error;
  return data as Job;
}

// ─── Soft Delete ─────────────────────────────────────────────────────

export async function deleteJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  const fromStatus = job.status;
  const { error } = await supabase.from('jobs').update({
    is_hidden: true,
    status: 'archived',
  } as any).eq('id', jobId);
  if (error) throw error;
  await logJobActivity(jobId, 'job_deleted', fromStatus, 'archived', 'Soft-deleted by admin');
}

// ─── Admin Status Change ─────────────────────────────────────────────

export async function adminChangeStatus(
  jobId: string,
  newStatus: string,
  notes?: string,
): Promise<Job> {
  const job = await getJob(jobId);
  const fromStatus = job.status;

  // ─── Validate the transition is allowed (defence in depth: UI also gates this) ───
  const allowed = ADMIN_ALLOWED_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(newStatus as any)) {
    throw new Error(
      `Status transition not allowed: ${fromStatus} → ${newStatus}. ` +
      `Allowed targets from "${fromStatus}": ${allowed.join(', ') || '(none)'}.`,
    );
  }

  // ─── Re-open path: route through reopen_job RPC which soft-archives prior
  //     inspection evidence and starts a fresh run. This prevents stale photos /
  //     damage items from bleeding into the new pickup/delivery cycle. ───
  if (
    REOPEN_TARGET_STATUSES.has(newStatus) &&
    REOPENABLE_FROM_STATUSES.has(fromStatus)
  ) {
    const { error: rpcErr } = await (supabase as any).rpc('reopen_job', {
      p_job_id: jobId,
      p_notes: notes ?? null,
    });
    if (rpcErr) throw rpcErr;
    // If admin requested 'assigned' specifically, flip from ready_for_pickup → assigned
    if (newStatus === JOB_STATUS.ASSIGNED) {
      await updateJob(jobId, { status: JOB_STATUS.ASSIGNED } as Partial<Job>);
    }
    return await getJob(jobId);
  }

  const updates: Partial<Job> = { status: newStatus as any };
  // Only true terminal completion sets completed_at. pod_ready / delivery_complete
  // are review states, not completion — counting them as "completed" pollutes
  // dashboards and finance reports.
  if (newStatus === JOB_STATUS.COMPLETED && !job.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const updated = await updateJob(jobId, updates);
  await logJobActivity(jobId, 'admin_status_change', fromStatus, newStatus, notes || `Admin changed status from ${fromStatus} to ${newStatus}`);

  return updated;
}

export async function reopenJob(jobId: string, notes?: string): Promise<Job> {
  const { error } = await (supabase as any).rpc('reopen_job', {
    p_job_id: jobId,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return await getJob(jobId);
}

// ─── Archive (legacy) ────────────────────────────────────────────────

export async function archiveJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').update({ is_hidden: true } as any).eq('id', jobId);
  if (error) throw error;
}

export async function restoreJob(jobId: string): Promise<void> {
  const { error } = await supabase.from('jobs').update({ is_hidden: false } as any).eq('id', jobId);
  if (error) throw error;
}

// ─── Inspections ─────────────────────────────────────────────────────

export async function getInspection(jobId: string, type: InspectionType): Promise<Inspection | null> {
  const { data, error } = await (supabase
    .from('inspections')
    .select('*')
    .eq('job_id', jobId)
    .eq('type', type) as any)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as Inspection | null;
}

export async function upsertInspection(
  jobId: string,
  type: InspectionType,
  payload: Partial<Inspection>
): Promise<Inspection> {
  const existing = await getInspection(jobId, type);

  if (existing) {
    const { data, error } = await supabase
      .from('inspections')
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as Inspection;
  } else {
    const orgId = await getOrgId();
    const { data, error } = await supabase
      .from('inspections')
      .insert({ job_id: jobId, type, org_id: orgId, ...payload } as any)
      .select()
      .single();
    if (error) throw error;
    return data as Inspection;
  }
}

export async function submitInspection(
  jobId: string,
  type: InspectionType,
  inspectionPayload: Partial<Inspection>,
  damageItems: Array<Omit<DamageItem, 'id' | 'inspection_id' | 'created_at'>>,
): Promise<{ inspectionId: string; damageItemIds: string[] }> {
  // Atomic submission via Postgres function. The RPC wraps these writes in a
  // single transaction, so dashboards / detail pages can never observe a
  // half-committed state where the inspection exists but job.status / flags
  // disagree:
  //   1. upsert inspection row (active run only)
  //   2. soft-archive prior damage_items, insert new ones
  //   3. update job.has_pickup/delivery_inspection + status
  //   4. write job_activity_log
  // Resubmission protection (already-submitted + blocking status) is enforced
  // server-side and surfaces as `INSPECTION_ALREADY_SUBMITTED`.
  const { data, error } = await (supabase as any).rpc('submit_inspection', {
    p_job_id: jobId,
    p_type: type,
    p_inspection: inspectionPayload as any,
    p_damage_items: (damageItems as any) ?? [],
  });
  if (error) {
    if (error.message?.includes('INSPECTION_ALREADY_SUBMITTED')) {
      throw new Error(
        `${type} inspection already submitted for this job. Cannot overwrite completed inspection.`,
      );
    }
    throw error;
  }

  const result = (data ?? {}) as {
    inspectionId: string;
    damageItemIds: string[];
    fromStatus?: string;
    toStatus?: string;
  };

  void logClientEvent("inspection_submitted", "info", {
    jobId,
    context: { inspectionType: type, newStatus: result.toStatus },
  });

  return {
    inspectionId: result.inspectionId,
    damageItemIds: result.damageItemIds ?? [],
  };
}

// ─── Photos ──────────────────────────────────────────────────────────

export async function insertPhoto(payload: Omit<Photo, 'id' | 'created_at'>): Promise<Photo> {
  const orgId = await getOrgId();
  const { data, error } = await supabase.from('photos').insert({ ...payload, org_id: orgId } as any).select().single();
  if (error) throw error;
  return data as Photo;
}

// ─── Activity Log ────────────────────────────────────────────────────

export async function logJobActivity(
  jobId: string,
  action: string,
  fromStatus?: string,
  toStatus?: string,
  notes?: string,
): Promise<void> {
  const orgId = await getOrgId();
  await supabase.from('job_activity_log').insert({
    job_id: jobId,
    action,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
    notes: notes ?? null,
    org_id: orgId,
  } as any);
}

// ─── Dashboard Counts ────────────────────────────────────────────────
// Uses count-only (head: true) queries to avoid transferring full row data.

export async function getDashboardCounts(): Promise<{
  activeJobs: number;
  completedLast14Days: number;
  pending: number;
}> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [activeRes, completedRes, pendingRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden', false)
      .in('status', ACTIVE_STATUSES as string[]),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden', false)
      .eq('status', JOB_STATUS.COMPLETED)
      .not('completed_at', 'is', null)
      .gte('completed_at', fourteenDaysAgo.toISOString()),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('is_hidden', false)
      .in('status', PENDING_STATUSES as string[]),
  ]);

  if (activeRes.error) throw activeRes.error;
  if (completedRes.error) throw completedRes.error;
  if (pendingRes.error) throw pendingRes.error;

  return {
    activeJobs: activeRes.count ?? 0,
    completedLast14Days: completedRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  };
}
