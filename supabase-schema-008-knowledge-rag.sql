-- AI Assist + RAG migration. Run in Supabase SQL Editor (project exayybmojinufmlsksqc).
-- Safe to re-run.

create extension if not exists vector;

create table if not exists knowledge_documents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  source_type text not null default 'paste' check (source_type in ('paste', 'upload')),
  created_at timestamptz not null default now()
);

-- Gemini's text-embedding-004 returns 768-dim vectors.
create table if not exists knowledge_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references knowledge_documents(id) on delete cascade not null,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_chunks_document on knowledge_chunks(document_id);
create index if not exists idx_knowledge_chunks_embedding
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_knowledge_chunks(query_embedding vector(768), match_count int default 4)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable
as $$
  select id, document_id, content, 1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Encrypted-at-rest key/value store for BYOK settings (AES-256-GCM,
-- encrypted/decrypted server-side with SETTINGS_ENCRYPTION_KEY - never
-- readable via the API in plaintext).
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;
alter table settings enable row level security;

drop policy if exists "authenticated all knowledge_documents" on knowledge_documents;
create policy "authenticated all knowledge_documents" on knowledge_documents
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated read knowledge_chunks" on knowledge_chunks;
create policy "authenticated read knowledge_chunks" on knowledge_chunks
  for select to authenticated using (true);

-- settings has no client-readable policy at all - only the service-role
-- key (server-side API routes) can touch it, by design.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'knowledge_documents') then
    alter publication supabase_realtime add table knowledge_documents;
  end if;
end $$;
