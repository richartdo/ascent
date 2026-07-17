create type public.opportunity_type as enum (
  'scholarship',
  'internship',
  'job',
  'grant',
  'fellowship',
  'competition',
  'accelerator',
  'hackathon',
  'training'
);

create type public.opportunity_location_mode as enum (
  'onsite',
  'hybrid',
  'remote',
  'unspecified'
);

create type public.opportunity_status as enum (
  'draft',
  'published',
  'closed',
  'archived'
);

create function public.country_codes_are_iso_alpha2(codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(codes <@ array[
    'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
    'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
    'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
    'DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
    'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
    'HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP',
    'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
    'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
    'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
    'QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
    'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
    'UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW'
  ]::text[], false)
$$;

create function public.text_array_items_within(items text[], maximum_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(char_length(item) between 1 and maximum_length), true)
  from unnest(items) as item
$$;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  organization text not null check (char_length(organization) between 1 and 180),
  type public.opportunity_type not null,
  description text not null check (char_length(description) between 1 and 10000),
  requirements text[] not null default '{}',
  eligibility jsonb not null default '{}'::jsonb,
  benefits text[] not null default '{}',
  country_codes text[] not null default '{}',
  is_global boolean not null default false,
  location text check (location is null or char_length(location) between 1 and 180),
  location_mode public.opportunity_location_mode not null default 'unspecified',
  deadline timestamptz,
  application_url text not null,
  canonical_url text not null,
  source_name text not null check (char_length(source_name) between 1 and 180),
  source_url text not null,
  status public.opportunity_status not null default 'draft',
  published_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(organization, '') || ' ' || coalesce(description, ''))
  ) stored,
  constraint opportunities_requirements_limit check (cardinality(requirements) <= 30),
  constraint opportunities_requirements_item_length check (public.text_array_items_within(requirements, 500)),
  constraint opportunities_benefits_limit check (cardinality(benefits) <= 30),
  constraint opportunities_benefits_item_length check (public.text_array_items_within(benefits, 500)),
  constraint opportunities_eligibility_object check (jsonb_typeof(eligibility) = 'object'),
  constraint opportunities_eligibility_size check (octet_length(eligibility::text) <= 12000),
  constraint opportunities_country_codes_limit check (cardinality(country_codes) <= 249),
  constraint opportunities_country_codes_valid check (public.country_codes_are_iso_alpha2(country_codes)),
  constraint opportunities_global_country_consistency check (
    (is_global and cardinality(country_codes) = 0)
    or (not is_global and cardinality(country_codes) > 0)
  ),
  constraint opportunities_application_url_http check (application_url ~* '^https?://[^[:space:]]+$'),
  constraint opportunities_canonical_url_http check (canonical_url ~* '^https?://[^[:space:]]+$'),
  constraint opportunities_source_url_http check (source_url ~* '^https?://[^[:space:]]+$'),
  constraint opportunities_canonical_url_unique unique (canonical_url),
  constraint opportunities_published_metadata check (
    status <> 'published' or (published_at is not null and last_verified_at is not null)
  )
);

create index opportunities_status_idx on public.opportunities (status);
create index opportunities_type_idx on public.opportunities (type);
create index opportunities_deadline_idx on public.opportunities (deadline);
create index opportunities_country_codes_idx on public.opportunities using gin (country_codes);
create index opportunities_location_mode_idx on public.opportunities (location_mode);
create index opportunities_published_idx on public.opportunities (published_at desc) where status = 'published';
create index opportunities_search_idx on public.opportunities using gin (search_vector);

create table public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_opportunities_user_opportunity_unique unique (user_id, opportunity_id)
);

create index saved_opportunities_user_created_idx on public.saved_opportunities (user_id, created_at desc);
create index saved_opportunities_opportunity_idx on public.saved_opportunities (opportunity_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

create trigger saved_opportunities_set_updated_at
before update on public.saved_opportunities
for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
alter table public.saved_opportunities enable row level security;
alter table public.saved_opportunities force row level security;

revoke all on table public.opportunities from anon;
revoke all on table public.opportunities from authenticated;
grant select on table public.opportunities to authenticated;

create policy "Authenticated users can read published opportunities"
on public.opportunities
for select
to authenticated
using (status = 'published');

revoke all on table public.saved_opportunities from anon;
revoke all on table public.saved_opportunities from authenticated;
grant select on table public.saved_opportunities to authenticated;
grant insert (user_id, opportunity_id, notes) on table public.saved_opportunities to authenticated;
grant update (notes) on table public.saved_opportunities to authenticated;
grant delete on table public.saved_opportunities to authenticated;

create policy "Users can read their own saved opportunities"
on public.saved_opportunities
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can save published opportunities"
on public.saved_opportunities
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.opportunities
    where opportunities.id = opportunity_id
      and opportunities.status = 'published'
  )
);

create policy "Users can update their own saved opportunities"
on public.saved_opportunities
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own saved opportunities"
on public.saved_opportunities
for delete
to authenticated
using ((select auth.uid()) = user_id);
