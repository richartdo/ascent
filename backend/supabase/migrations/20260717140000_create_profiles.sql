create type public.profile_persona as enum (
  'student',
  'recent_graduate',
  'young_founder'
);

create type public.education_level as enum (
  'secondary',
  'undergraduate',
  'postgraduate',
  'graduate',
  'other'
);

create type public.remote_preference as enum (
  'remote_only',
  'remote_preferred',
  'no_preference'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  persona public.profile_persona,
  full_name text check (char_length(full_name) between 1 and 120),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  city text check (char_length(city) between 1 and 120),
  education_level public.education_level,
  institution text check (char_length(institution) between 1 and 180),
  field_of_study text check (char_length(field_of_study) between 1 and 180),
  graduation_year smallint check (graduation_year between 2000 and 2045),
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  career_goals text check (char_length(career_goals) between 1 and 2000),
  preferred_opportunity_types text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  remote_preference public.remote_preference,
  profile_completion smallint not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_skills_limit check (cardinality(skills) <= 50),
  constraint profiles_interests_limit check (cardinality(interests) <= 50),
  constraint profiles_opportunity_types_limit check (cardinality(preferred_opportunity_types) <= 9),
  constraint profiles_opportunity_types_allowed check (
    preferred_opportunity_types <@ array[
      'scholarship',
      'internship',
      'job',
      'grant',
      'fellowship',
      'competition',
      'accelerator',
      'hackathon',
      'training'
    ]::text[]
  ),
  constraint profiles_locations_limit check (cardinality(preferred_locations) <= 25)
);

create function public.set_profile_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  completed_fields integer;
begin
  completed_fields := num_nonnulls(
    new.persona,
    new.full_name,
    new.country_code,
    new.education_level,
    new.field_of_study,
    new.career_goals
  );
  completed_fields := completed_fields
    + case when cardinality(new.skills) > 0 then 1 else 0 end
    + case when cardinality(new.interests) > 0 then 1 else 0 end
    + case when cardinality(new.preferred_opportunity_types) > 0 then 1 else 0 end
    + case when cardinality(new.preferred_locations) > 0 then 1 else 0 end;

  new.profile_completion := completed_fields * 10;
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_derived_fields
before insert or update on public.profiles
for each row
execute function public.set_profile_derived_fields();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant insert (
  id,
  persona,
  full_name,
  country_code,
  city,
  education_level,
  institution,
  field_of_study,
  graduation_year,
  skills,
  interests,
  career_goals,
  preferred_opportunity_types,
  preferred_locations,
  remote_preference
) on table public.profiles to authenticated;
grant update (
  persona,
  full_name,
  country_code,
  city,
  education_level,
  institution,
  field_of_study,
  graduation_year,
  skills,
  interests,
  career_goals,
  preferred_opportunity_types,
  preferred_locations,
  remote_preference
) on table public.profiles to authenticated;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
