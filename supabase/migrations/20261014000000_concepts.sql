-- Concepts Brendan has had explained, so briefings explain a term fully the first
-- time, remind briefly the next couple of times, then just use it.
create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  term text not null,
  term_key text generated always as (lower(regexp_replace(term, '[^A-Za-z0-9]+', ' ', 'g'))) stored,
  category text,
  explanation text not null,
  first_briefing_id uuid references public.briefings (id) on delete set null,
  first_explained date not null,
  last_explained date not null,
  times_explained int not null default 1,
  understood boolean not null default false
);
create unique index concepts_term_key_idx on public.concepts (term_key);
create index concepts_first_briefing_idx on public.concepts (first_briefing_id);
alter table public.concepts enable row level security;
create policy "allowed users" on public.concepts for all to authenticated using (private.is_allowed()) with check (private.is_allowed());
