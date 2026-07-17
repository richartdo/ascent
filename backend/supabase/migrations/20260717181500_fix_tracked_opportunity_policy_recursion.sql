create function public.user_owns_application_for_opportunity(target_opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications
    where applications.opportunity_id = target_opportunity_id
      and applications.user_id = auth.uid()
  )
$$;

create function public.user_owns_saved_opportunity(target_opportunity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.saved_opportunities
    where saved_opportunities.opportunity_id = target_opportunity_id
      and saved_opportunities.user_id = auth.uid()
  )
$$;

revoke all on function public.user_owns_application_for_opportunity(uuid) from public;
revoke all on function public.user_owns_application_for_opportunity(uuid) from anon;
grant execute on function public.user_owns_application_for_opportunity(uuid) to authenticated;

revoke all on function public.user_owns_saved_opportunity(uuid) from public;
revoke all on function public.user_owns_saved_opportunity(uuid) from anon;
grant execute on function public.user_owns_saved_opportunity(uuid) to authenticated;

drop policy "Users can read published or tracked opportunities" on public.opportunities;

create policy "Users can read published or tracked opportunities"
on public.opportunities
for select
to authenticated
using (
  status = 'published'
  or public.user_owns_application_for_opportunity(id)
  or public.user_owns_saved_opportunity(id)
);
