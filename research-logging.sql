create table if not exists public.research_events (
  event_id text primary key,
  participant_id text not null,
  session_id text not null,
  condition text,
  sequence integer,
  event_type text not null,
  action_id text,
  target_block_ids jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  app_version text,
  interface_language text,
  received_at timestamptz not null default now()
);

create index if not exists research_events_participant_session_idx
  on public.research_events (participant_id, session_id, sequence);

alter table public.research_events enable row level security;

-- The browser never talks to this table directly. The Express server writes
-- with SUPABASE_SECRET_KEY (or the legacy service-role key), so no public
-- insert/select policy is needed.
