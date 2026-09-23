create extension if not exists pgcrypto;

create table if not exists buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  value numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  status text not null default 'paid',
  created_at timestamptz not null default now()
);

create table if not exists meta_events (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references buyers(id) on delete cascade,
  event_id text not null unique,
  mode text not null,
  status text not null default 'pending',
  meta_response jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists meta_events_buyer_id_idx on meta_events(buyer_id);
