create or replace function public.application_checklist_is_valid(checklist_value jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  checklist_item jsonb;
  checklist_id text;
  seen_ids text[] := array[]::text[];
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
