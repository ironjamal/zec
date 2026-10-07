create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_type text not null,
  project_type_label text not null,
  description text not null,
  name text not null,
  email text not null,
  budget text,
  budget_label text,
  business_name text,
  website text,
  timeline text,
  phone text
);

alter table public.contact_submissions enable row level security;

revoke all on table public.contact_submissions from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant insert on table public.contact_submissions to service_role;

comment on table public.contact_submissions is
  'Private project enquiries submitted through the ZEC website; only the server role may insert, with no read access through the Data API.';
