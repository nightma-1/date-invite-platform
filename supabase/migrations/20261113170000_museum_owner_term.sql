-- © 2026 Senti. Все права защищены.
--
-- Владелец публикует музей без платежа. Тогда срок берём из выбранного
-- в конструкторе, а не 30 дней по умолчанию.

create or replace function public.set_publication_deadlines()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_days integer;
  v_features jsonb;
  v_opens timestamptz;
begin
  if new.kind = 'museum' then
    if new.status = 'published' and old.status = 'draft' then
      select p.term_days, p.features into v_days, v_features
        from payments p
       where p.invitation_id = new.id and p.status = 'paid' and p.purpose = 'publish'
       order by p.created_at desc
       limit 1;
      if v_features is not null then
        perform museum_apply_paid_features(new.id, v_features);
      end if;
      select c.opens_at, coalesce(v_days, c.term_days) into v_opens, v_days
        from museum_content c where c.invitation_id = new.id;
      new.published_at = coalesce(new.published_at, now());
      new.expires_at = greatest(new.published_at, coalesce(v_opens, new.published_at)) + make_interval(days => coalesce(v_days, 30));
      new.edit_until = new.expires_at;
    end if;
    return new;
  end if;

  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at = coalesce(new.published_at, now());
    new.edit_until = new.published_at + interval '3 days';
    new.expires_at = new.published_at + interval '7 days';
  end if;
  return new;
end;
$function$;
