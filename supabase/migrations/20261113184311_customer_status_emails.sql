-- Customer status emails: "your vehicle has been collected / delivered".
--
-- Design: an outbox written by a trigger in the same transaction as the job's
-- status change, so every path that moves a job (submit_inspection online,
-- offline sync, admin edits) queues exactly one email per event, and none is
-- lost if the sender is down. The notify-customers edge function sends what
-- is queued, only to the client's invited portal users.
--
--  1. clients.status_emails_enabled — per-client switch, default on (the
--     recipients are portal users the operator invited explicitly).
--  2. customer_notifications — the outbox. RLS on; admins of the org can
--     read their rows; no client-side writes (trigger + service role only).
--  3. enqueue_customer_notification() + AFTER UPDATE OF status trigger.
--     Only jobs linked to a client; only on the transition INTO a stage;
--     UNIQUE (job_id, event) makes it at-most-once per job. It can never
--     block the status change: any error is downgraded to a warning.
--
-- Only transitions after this migration queue emails — nothing historical.

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status_emails_enabled boolean NOT NULL DEFAULT true;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event         text NOT NULL CHECK (event IN ('collected', 'delivered')),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  recipients    text[] NOT NULL DEFAULT '{}',
  provider_ids  text[] NOT NULL DEFAULT '{}',
  skip_reason   text,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  sent_at       timestamptz,
  CONSTRAINT customer_notifications_job_event_key UNIQUE (job_id, event)
);

CREATE INDEX IF NOT EXISTS customer_notifications_open_idx
  ON public.customer_notifications (status, created_at)
  WHERE status IN ('pending', 'sending', 'failed');
CREATE INDEX IF NOT EXISTS customer_notifications_client_idx
  ON public.customer_notifications (client_id, created_at DESC);

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_notifications_select_admin"
  ON public.customer_notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
  );

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_customer_notification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
declare
  v_collected text[] := array['pickup_complete', 'in_transit', 'delivery_in_progress'];
  v_delivered text[] := array['delivery_complete', 'pod_ready', 'completed'];
  v_old text := coalesce(old.status, '');
  v_event text;
begin
  if new.client_id is null or new.org_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = any(v_delivered) and not (v_old = any(v_delivered)) then
    v_event := 'delivered';
  elsif new.status = any(v_collected)
        and not (v_old = any(v_collected) or v_old = any(v_delivered)) then
    v_event := 'collected';
  else
    return new;
  end if;

  begin
    insert into customer_notifications (org_id, job_id, client_id, event)
    values (new.org_id, new.id, new.client_id, v_event)
    on conflict (job_id, event) do nothing;
  exception when others then
    -- An email is never worth failing an inspection submit over.
    raise warning 'enqueue_customer_notification failed for job %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

CREATE OR REPLACE TRIGGER trg_enqueue_customer_notification
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_customer_notification();
