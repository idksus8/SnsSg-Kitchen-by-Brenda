-- Run this once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  name text,
  phone text,
  mode text,
  addr text,
  when_text text,
  note text,
  items jsonb not null default '[]',
  total_cents integer not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

-- Locked down: the browser can never read this table directly.
-- Only the site's server (using the secret key) reads and writes orders.
alter table public.orders enable row level security;
