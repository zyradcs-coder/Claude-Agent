-- Sales Pipelines migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

create table if not exists pipelines (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists pipeline_stages (
  id uuid default gen_random_uuid() primary key,
  pipeline_id uuid references pipelines(id) on delete cascade not null,
  name text not null,
  order_weight int not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_pipeline_stages_pipeline on pipeline_stages(pipeline_id, order_weight);

create table if not exists deals (
  id uuid default gen_random_uuid() primary key,
  pipeline_id uuid references pipelines(id) on delete cascade not null,
  stage_id uuid references pipeline_stages(id) on delete restrict not null,
  contact_id uuid references contacts(id) on delete set null,
  title text not null,
  value numeric(12, 2) not null default 0,
  currency text not null default 'AED',
  expected_close_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_deals_pipeline on deals(pipeline_id);
create index if not exists idx_deals_stage on deals(stage_id);
create index if not exists idx_deals_contact on deals(contact_id);

drop trigger if exists trg_deals_updated_at on deals;
create trigger trg_deals_updated_at
  before update on deals
  for each row execute function set_updated_at(); -- reuses the function from migration 002

-- Seed one default pipeline, matching the spec's example stages.
insert into pipelines (id, name)
select gen_random_uuid(), 'Sales Pipeline'
where not exists (select 1 from pipelines);

do $$
declare
  pid uuid;
begin
  select id into pid from pipelines order by created_at asc limit 1;
  if pid is not null and not exists (select 1 from pipeline_stages where pipeline_id = pid) then
    insert into pipeline_stages (pipeline_id, name, order_weight, is_won, is_lost) values
      (pid, 'Lead In', 0, false, false),
      (pid, 'Quote Sent', 1, false, false),
      (pid, 'Follow-up', 2, false, false),
      (pid, 'Won', 3, true, false),
      (pid, 'Lost', 4, false, true);
  end if;
end $$;

alter table pipelines enable row level security;
alter table pipeline_stages enable row level security;
alter table deals enable row level security;

drop policy if exists "authenticated read pipelines" on pipelines;
create policy "authenticated read pipelines" on pipelines
  for select to authenticated using (true);

drop policy if exists "authenticated read stages" on pipeline_stages;
create policy "authenticated read stages" on pipeline_stages
  for select to authenticated using (true);

drop policy if exists "authenticated all deals" on deals;
create policy "authenticated all deals" on deals
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'deals') then
    alter publication supabase_realtime add table deals;
  end if;
end $$;
