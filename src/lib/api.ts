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
import type { JobStatusValue } from './statusConfig';
import { JOB_STATUS, ACTIVE_STATUSES, PENDING_STATUSES } from './statusConfig';
import { logClientEvent } from './logger';
import { getOrgId } from './orgHelper';

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
  const [jobRes, inspRes, photoRes, actRes] = await Promise.all([
    supabase.from('jobs').select('*, driver_profiles(display_name, full_name)').eq('id', jobId).single(),
    supabase.from('inspections').select('*').eq('job_id', jobId),
    supabase.from('photos').select('*').eq('job_id', jobId),
    supabase.from('job_activity_log').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
  ]);
  if (jobRes.error) throw jobRes.error;

  const inspections = (inspRes.data ?? []) as Inspection[];
  const inspectionIds = inspections.map((i) => i.id);

  let damageItems: DamageItem[] = [];
  if (inspectionIds.length > 0) {
    const { data } = await supabase.from('damage_items').select('*').in('inspection_id', inspectionIds);
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

  const updates: Partial<Job> = { status: newStatus as any };
  // Set completed_at for terminal statuses
  if (['completed', 'pod_ready', 'delivery_complete'].includes(newStatus) && !job.completed_at) {
    updates.completed_at = new Date().toISOString();
  }
  // Clear completed_at if re-opening
  if (['ready_for_pickup', 'assigned'].includes(newStatus) && job.completed_at) {
    updates.completed_at = null;
  }

  const updated = await updateJob(jobId, updates);
  await logJobActivity(jobId, 'admin_status_change', fromStatus, newStatus, notes || `Admin changed status from ${fromStatus} to ${newStatus}`);

  return updated;
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
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('job_id', jobId)
    .eq('type', type)
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
  // J: Guard against accidental resubmission overwriting existing inspection
  const existingInspection = await getInspection(jobId, type);
  if (existingInspection?.inspected_at) {
    const job = await getJob(jobId);
    const terminalStatuses = [JOB_STATUS.COMPLETED, JOB_STATUS.POD_READY, JOB_STATUS.DELIVERY_COMPLETE];
    if (terminalStatuses.includes(job.status as any)) {
      throw new Error(`${type} inspection already submitted for this job. Cannot overwrite completed inspection.`);
    }
  }

  const inspection = await upsertInspection(jobId, type, {
    ...inspectionPayload,
    inspected_at: new Date().toISOString(),
    has_damage: damageItems.length > 0,
  });

  await supabase.from('damage_items').delete().eq('inspection_id', inspection.id);
  let damageItemIds: string[] = [];
  if (damageItems.length > 0) {
    const orgId = await getOrgId();
    const items = damageItems.map((d) => ({ ...d, inspection_id: inspection.id, org_id: orgId }));
    const { data: insertedDamage, error } = await supabase.from('damage_items').insert(items as any).select('id');
    if (error) throw error;
    damageItemIds = (insertedDamage ?? []).map((d: any) => d.id);
  }

  const job = await getJob(jobId);
  const fromStatus = job.status;
  let toStatus: JobStatusValue | string = job.status;

  if (type === 'pickup') {
    toStatus = JOB_STATUS.PICKUP_COMPLETE;
    await updateJob(jobId, { has_pickup_inspection: true, status: toStatus } as Partial<Job>);
  } else {
    toStatus = job.has_pickup_inspection ? JOB_STATUS.POD_READY : JOB_STATUS.DELIVERY_COMPLETE;
    await updateJob(jobId, {
      has_delivery_inspection: true,
      status: toStatus,
      completed_at: new Date().toISOString(),
    } as Partial<Job>);
  }

  await logJobActivity(jobId, `${type}_inspection_submitted`, fromStatus, toStatus);

  void logClientEvent("inspection_submitted", "info", {
    jobId,
    context: { inspectionType: type, newStatus: toStatus },
  });

  return { inspectionId: inspection.id, damageItemIds };
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
