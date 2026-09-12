-- Real-Time Analytics migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

-- Indexes the analytics queries actually hit (messages/conversations had no
-- created_at index before this - fine at current volume, but this is the
-- "avoid heavy COUNT(*) on hot tables" groundwork from the spec).
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_conversations_created_at on conversations(created_at);
create index if not exists idx_conversations_status on conversations(status);

-- Track resolution time: set the moment a conversation is marked closed,
-- cleared if it's reopened.
alter table conversations add column if not exists closed_at timestamptz;

create or replace function set_closed_at() returns trigger as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    new.closed_at = now();
  elsif new.status is distinct from 'closed' then
    new.closed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conversations_closed_at on conversations;
create trigger trg_conversations_closed_at
  before update on conversations
  for each row execute function set_closed_at();

-- Pre-aggregated daily rollups (populated by the daily cron), so historical
-- ranges don't re-scan raw tables - only "today" is computed live.
create table if not exists daily_stats (
  date date primary key,
  messages_inbound int not null default 0,
  messages_outbound_ai int not null default 0,
  messages_outbound_agent int not null default 0,
  new_conversations int not null default 0,
  conversations_closed int not null default 0,
  avg_frt_seconds numeric,
  avg_resolution_seconds numeric,
  automation_runs_success int not null default 0,
  automation_runs_error int not null default 0,
  created_at timestamptz not null default now()
);

alter table daily_stats enable row level security;
drop policy if exists "authenticated read daily_stats" on daily_stats;
create policy "authenticated read daily_stats" on daily_stats
  for select to authenticated using (true);
-- No write policy - only the service-role key (cron route) writes this.
