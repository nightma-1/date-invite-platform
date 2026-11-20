-- © 2026 Senti. Все права защищены.
--
-- Счётчик на главной: «отправлено N приглашений, X% ответили «Да»».
--
-- Правила:
--   * считаем только приглашения на свидание (kind = 'invite'), которые хоть
--     раз были опубликованы (published / expired / archived), и не считаем
--     приглашения владельцев сервиса (profiles.is_admin) — свои тесты;
--   * доля «Да» — среди приглашений, на которые уже ответили;
--   * пока отправлено меньше 100, функция возвращает null — маленькие цифры
--     на главной работают против нас, а посторонним их видеть незачем.
--     Порог меняется здесь одной строкой.

create or replace function public.landing_stats()
returns jsonb as $$
declare
  v_min_sent constant integer := 100;
  v_sent integer;
  v_answered integer;
  v_yes integer;
begin
  select count(*) into v_sent
  from invitations i
  left join profiles p on p.id = i.user_id
  where i.kind = 'invite'
    and i.status in ('published', 'expired', 'archived')
    and coalesce(p.is_admin, false) = false;

  if v_sent < v_min_sent then
    return null;
  end if;

  select count(*) filter (where r.any_yes), count(*)
    into v_yes, v_answered
  from (
    select bool_or(resp.answered_yes) as any_yes
    from responses resp
    join invitations i on i.id = resp.invitation_id
    left join profiles p on p.id = i.user_id
    where i.kind = 'invite' and coalesce(p.is_admin, false) = false
    group by resp.invitation_id
  ) r;

  return jsonb_build_object(
    'sent', v_sent,
    'answered', v_answered,
    'yes_pct', case when v_answered > 0 then round(100.0 * v_yes / v_answered) else null end
  );
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function public.landing_stats() from public;
grant execute on function public.landing_stats() to anon, authenticated;
