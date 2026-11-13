-- День рождения можно отправить заранее: повод откроется в 00:00 по Ташкенту
-- в день occasion.openAt. Ссылка должна жить 7 дней не с публикации, а с
-- момента открытия, иначе она закончится раньше праздника.
-- Ветка музея — как в 20261113170000_museum_owner_term (срок из конструктора).
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

  if new.kind = 'occasion' then
    if new.status = 'published' and (old.status is distinct from 'published') then
      new.published_at = coalesce(new.published_at, now());
      new.edit_until = new.published_at + interval '3 days';
      v_opens := null;
      if coalesce(new.occasion->>'openAt', '') ~ '^\d{4}-\d{2}-\d{2}$' then
        begin
          v_opens := ((new.occasion->>'openAt')::date)::timestamp at time zone 'Asia/Tashkent';
        exception when others then
          v_opens := null;
        end;
      end if;
      new.expires_at = greatest(new.published_at, coalesce(v_opens, new.published_at)) + interval '7 days';
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
