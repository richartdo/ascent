create type public.application_status as enum (
  'planning',
  'preparing',
  'submitted',
  'under_review',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn'
);

create type public.notification_type as enum (
  'deadline',
  'application',
  'system'
);

create function public.application_checklist_is_valid(checklist_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  checklist_item jsonb;
  checklist_id text;
  seen_ids text[] := '{}';
begin
  if jsonb_typeof(checklist_value) <> 'array'
    or jsonb_array_length(checklist_value) > 25
    or octet_length(checklist_value::text) > 20000 then
    return false;
  end if;

  for checklist_item in select value from jsonb_array_elements(checklist_value)
  loop
    if jsonb_typeof(checklist_item) <> 'object'
      or not (checklist_item ?& array['id', 'title', 'completed', 'completedAt'])
      or exists (
        select 1
        from jsonb_object_keys(checklist_item) as item_key
        where item_key <> all (array['id', 'title', 'completed', 'completedAt'])
      )
      or jsonb_typeof(checklist_item->'id') <> 'string'
      or jsonb_typeof(checklist_item->'title') <> 'string'
      or jsonb_typeof(checklist_item->'completed') <> 'boolean'
      or char_length(checklist_item->>'title') not between 1 and 160 then
      return false;
    end if;

    checklist_id := checklist_item->>'id';
    if checklist_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or checklist_id = any (seen_ids) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, checklist_id);

    if (checklist_item->>'completed')::boolean then
      if jsonb_typeof(checklist_item->'completedAt') <> 'string'
        or checklist_item->>'completedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
        or not pg_input_is_valid(checklist_item->>'completedAt', 'timestamp with time zone') then
        return false;
      end if;
    elsif checklist_item->'completedAt' <> 'null'::jsonb then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create function public.application_status_transition_is_valid(
  previous_status public.application_status,
  next_status public.application_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select previous_status = next_status
    or (previous_status = 'planning' and next_status in ('preparing', 'withdrawn'))
    or (previous_status = 'preparing' and next_status in ('planning', 'submitted', 'withdrawn'))
    or (previous_status = 'submitted' and next_status in ('under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn'))
    or (previous_status = 'under_review' and next_status in ('shortlisted', 'accepted', 'rejected', 'withdrawn'))
    or (previous_status = 'shortlisted' and next_status in ('accepted', 'rejected', 'withdrawn'))
    or (previous_status in ('accepted', 'rejected') and next_status = 'under_review')
    or (previous_status = 'withdrawn' and next_status = 'preparing')
$$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete restrict,
  status public.application_status not null default 'planning',
  checklist jsonb not null default '[]'::jsonb,
  notes text check (notes is null or char_length(notes) <= 5000),
  next_step text check (next_step is null or char_length(next_step) <= 1000),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_user_opportunity_unique unique (user_id, opportunity_id),
  constraint applications_checklist_valid check (public.application_checklist_is_valid(checklist))
);

create index applications_user_idx on public.applications (user_id);
create index applications_status_idx on public.applications (status);
create index applications_opportunity_idx on public.applications (opportunity_id);
create index applications_user_updated_idx on public.applications (user_id, updated_at desc);
create index applications_user_status_idx on public.applications (user_id, status);

create function public.set_application_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status_updated_at := now();
    if new.status in ('submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') then
      new.submitted_at := coalesce(new.submitted_at, now());
    else
      new.submitted_at := null;
    end if;
  elsif new.status is distinct from old.status then
    if not public.application_status_transition_is_valid(old.status, new.status) then
      raise exception using
        errcode = '23514',
        constraint = 'applications_status_transition_allowed',
        message = 'invalid application status transition';
    end if;
    new.status_updated_at := now();
    if new.submitted_at is null
      and new.status in ('submitted', 'under_review', 'shortlisted', 'accepted', 'rejected') then
      new.submitted_at := now();
    end if;
  else
    new.status_updated_at := old.status_updated_at;
    new.submitted_at := old.submitted_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_set_derived_fields
before insert or update on public.applications
for each row execute function public.set_application_derived_fields();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(title) between 1 and 180),
  message text not null check (char_length(message) between 1 and 1000),
  opportunity_id uuid references public.opportunities (id) on delete set null,
  application_id uuid references public.applications (id) on delete cascade,
  scheduled_for timestamptz not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_user_dedupe_unique unique (user_id, dedupe_key)
);

create index notifications_user_scheduled_idx on public.notifications (user_id, scheduled_for desc);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc)
where read_at is null and dismissed_at is null;
create index notifications_application_idx on public.notifications (application_id);
create index notifications_opportunity_idx on public.notifications (opportunity_id);

create trigger notifications_set_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.applications enable row level security;
alter table public.applications force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

revoke all on table public.applications from anon;
revoke all on table public.applications from authenticated;
grant select on table public.applications to authenticated;
grant insert (user_id, opportunity_id, status, checklist, notes, next_step)
on table public.applications to authenticated;
grant update (status, checklist, notes, next_step)
on table public.applications to authenticated;
grant delete on table public.applications to authenticated;

create policy "Users can read their own applications"
on public.applications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create applications for published opportunities"
on public.applications
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

create policy "Users can update their own applications"
on public.applications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own applications"
on public.applications
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at, dismissed_at) on table public.notifications to authenticated;

create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own notification state"
on public.notifications
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy "Authenticated users can read published opportunities" on public.opportunities;

create policy "Users can read published or tracked opportunities"
on public.opportunities
for select
to authenticated
using (
  status = 'published'
  or exists (
    select 1
    from public.applications
    where applications.opportunity_id = opportunities.id
      and applications.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.saved_opportunities
    where saved_opportunities.opportunity_id = opportunities.id
      and saved_opportunities.user_id = (select auth.uid())
  )
);

create function public.sync_my_deadline_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication is required';
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    opportunity_id,
    application_id,
    scheduled_for,
    dedupe_key
  )
  select
    current_user_id,
    'deadline'::public.notification_type,
    pg_catalog.left('Application deadline in ' || reminder.window_label, 180),
    pg_catalog.left('The deadline for ' || opportunities.title || ' is approaching.', 1000),
    opportunities.id,
    applications.id,
    opportunities.deadline - reminder.window_interval,
    'deadline:' || applications.id::text || ':' || reminder.window_key
  from public.applications
  join public.opportunities
    on opportunities.id = applications.opportunity_id
  cross join lateral (
    select
      case
        when opportunities.deadline <= pg_catalog.now() + interval '1 day' then '1d'
        when opportunities.deadline <= pg_catalog.now() + interval '3 days' then '3d'
        when opportunities.deadline <= pg_catalog.now() + interval '7 days' then '7d'
        else '30d'
      end as window_key,
      case
        when opportunities.deadline <= pg_catalog.now() + interval '1 day' then '1 day'
        when opportunities.deadline <= pg_catalog.now() + interval '3 days' then '3 days'
        when opportunities.deadline <= pg_catalog.now() + interval '7 days' then '7 days'
        else '30 days'
      end as window_label,
      case
        when opportunities.deadline <= pg_catalog.now() + interval '1 day' then interval '1 day'
        when opportunities.deadline <= pg_catalog.now() + interval '3 days' then interval '3 days'
        when opportunities.deadline <= pg_catalog.now() + interval '7 days' then interval '7 days'
        else interval '30 days'
      end as window_interval
  ) as reminder
  where applications.user_id = current_user_id
    and applications.status not in ('accepted', 'rejected', 'withdrawn')
    and opportunities.status = 'published'
    and opportunities.deadline is not null
    and opportunities.deadline > pg_catalog.now()
    and opportunities.deadline <= pg_catalog.now() + interval '30 days'
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

revoke all on function public.sync_my_deadline_notifications() from public;
revoke all on function public.sync_my_deadline_notifications() from anon;
grant execute on function public.sync_my_deadline_notifications() to authenticated;
