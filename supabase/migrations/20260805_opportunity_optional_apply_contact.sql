-- Allow opportunity posts with neither apply_link nor contact_info
-- (Cohortly in-app apply is always available).
-- Run in Supabase → SQL Editor (production) if not auto-applied.
-- Idempotent: recreates enforce_opportunity_posting_rules without CONTACT_REQUIRED.

create or replace function public.enforce_opportunity_posting_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count int;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if length(trim(coalesce(new.title, ''))) = 0 then
      raise exception 'OPPORTUNITY_TITLE_REQUIRED';
    end if;

    if new.type is null or trim(new.type) = '' then
      raise exception 'OPPORTUNITY_TYPE_REQUIRED';
    end if;

    if length(trim(coalesce(new.description, ''))) < 100 then
      raise exception 'OPPORTUNITY_DESCRIPTION_TOO_SHORT';
    end if;

    -- apply_link and contact_info are both optional (in-app apply only is valid)
  end if;

  if tg_op = 'INSERT'
     or (
       tg_op = 'UPDATE'
       and public.opportunity_is_active(new.deadline)
       and not public.opportunity_is_active(old.deadline)
     ) then
    select count(*)::int into active_count
    from public.opportunities o
    where o.posted_by = new.posted_by
      and public.opportunity_is_active(o.deadline)
      and (tg_op = 'INSERT' or o.id is distinct from new.id);

    if active_count >= 5 then
      raise exception 'OPPORTUNITY_ACTIVE_CAP';
    end if;
  end if;

  return new;
end;
$$;
