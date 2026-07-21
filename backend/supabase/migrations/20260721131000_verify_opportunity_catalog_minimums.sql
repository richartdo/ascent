-- Fail the deployment atomically if the linked catalog does not contain the requested minimum.
do $$
declare
  opportunity_kind public.opportunity_type;
  opportunity_count integer;
begin
  select count(*) into opportunity_count from public.opportunities;
  if opportunity_count < 90 then
    raise exception 'Opportunity catalog verification failed: expected at least 90 records';
  end if;

  foreach opportunity_kind in array enum_range(null::public.opportunity_type)
  loop
    select count(*)
      into opportunity_count
      from public.opportunities
      where type = opportunity_kind;

    if opportunity_count < 10 then
      raise exception 'Opportunity catalog verification failed for type %', opportunity_kind;
    end if;
  end loop;
end;
$$;
