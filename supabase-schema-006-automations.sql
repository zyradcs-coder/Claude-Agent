-- No-Code Automations migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

create table if not exists automations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  trigger_type text not null check (trigger_type in ('new_contact', 'keyword', 'conversation_idle')),
  trigger_config jsonb not null default '{}',
  action_type text not null check (action_type in ('apply_tag', 'assign_agent', 'send_message', 'move_stage')),
  action_config jsonb not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_automations_updated_at on automations;
create trigger trg_automations_updated_at
  before update on automations
  for each row execute function set_updated_at(); -- from migration 002

-- Audit log + idle-trigger dedupe (skip firing again for the same
-- conversation until it's had new activity since the last run).
create table if not exists automation_runs (
  id uuid default gen_random_uuid() primary key,
  automation_id uuid references automations(id) on delete cascade not null,
  conversation_id uuid references conversations(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  status text not null check (status in ('success', 'error', 'skipped')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_runs_automation on automation_runs(automation_id, created_at desc);
create index if not exists idx_automation_runs_dedupe on automation_runs(automation_id, conversation_id, created_at desc);

alter table automations enable row level security;
alter table automation_runs enable row level security;

drop policy if exists "authenticated all automations" on automations;
create policy "authenticated all automations" on automations
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read automation_runs" on automation_runs;
create policy "authenticated read automation_runs" on automation_runs
  for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'automations') then
    alter publication supabase_realtime add table automations;
  end if;
end $$;
