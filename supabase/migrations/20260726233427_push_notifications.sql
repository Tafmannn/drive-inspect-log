-- Web Push infrastructure.
--
-- push_subscriptions: one row per device a user opted in on (a user may have
-- several devices — never assume one row per user). RLS restricts every
-- client operation to the caller's own rows; the send path uses the service
-- role. Endpoints/keys are capability URLs — they must never be exposed to
-- other users or logged.
--
-- push_config: single-row VAPID key storage. RLS is enabled with NO
-- policies and grants are revoked, so only the service role (edge
-- functions) can read it. Rotation = update the row.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create table public.push_config (
  id boolean primary key default true check (id),
  vapid_public_key text not null,
  vapid_private_key text not null,
  vapid_subject text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
