-- © 2026 Senti. Все права защищены.
--
-- Аналитика: правки по итогам первого месяца.
--   * свои браузеры (где был вход админом) не считаются — и задним числом;
--   * гостевые аккаунты (оплата без регистрации) не считаются регистрациями;
--   * новые шаги воронки: выбор способа оплаты, экран входа, блок «нет имени»,
--     гостевая сессия и перенос гостя на аккаунт;
--   * приглашения, оплаты и ответы самого владельца не попадают в цифры.

create or replace function public.admin_analytics(
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now()
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz     text := 'Asia/Tashkent';
  v_from   timestamptz := least(p_from, p_to);
  v_to     timestamptz := greatest(p_from, p_to);
  v_result jsonb;
begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Период шире года не отдаём: защита от случайного тяжёлого запроса.
  if v_to - v_from > interval '400 days' then
    v_from := v_to - interval '400 days';
  end if;

  with
  -- Свои браузеры не считаем: все устройства, на которых хоть раз был
  -- вход админским аккаунтом, выпадают целиком, включая события до входа.
  -- Фронт вдобавок перестаёт слать события с таких браузеров (senti_internal).
  admins as (select id from profiles where is_admin),
  internal as (
    select distinct e.visitor_id
      from analytics_events e
      join profiles p on p.id = e.user_id and p.is_admin
  ),
  ev as (
    select *, (occurred_at at time zone v_tz)::date as day
      from analytics_events
     where occurred_at >= v_from and occurred_at < v_to
       and visitor_id not in (select visitor_id from internal)
  ),
  -- Гостевые аккаунты (оплата без регистрации) — не регистрации.
  real_profiles as (
    select pr.* from profiles pr
      join auth.users u on u.id = pr.id
     where not coalesce(u.is_anonymous, false)
  ),
  -- первый визит посетителя за всю историю — чтобы отделить новых от вернувшихся
  first_seen as (
    select visitor_id, min(occurred_at) as first_at
      from analytics_events
     where visitor_id in (select distinct visitor_id from ev)
     group by visitor_id
  ),
  -- Приглашения и оплаты самого владельца (тесты, бесплатная публикация)
  -- в денежные цифры не попадают.
  pay as (
    select * from payments
     where created_at >= v_from and created_at < v_to
       and user_id not in (select id from admins)
  ),
  inv as (
    select * from invitations
     where created_at >= v_from and created_at < v_to
       and user_id not in (select id from admins)
  ),
  resp as (
    select r.* from responses r join invitations i on i.id = r.invitation_id
     where r.created_at >= v_from and r.created_at < v_to
       and i.user_id not in (select id from admins)
  ),
  days as (
    select generate_series(
      (v_from at time zone v_tz)::date,
      (v_to   at time zone v_tz)::date,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'range', jsonb_build_object(
      'from', v_from,
      'to',   v_to,
      'days', (select count(*) from days),
      'tz',   v_tz
    ),

    -- Сырых событий может ещё не быть (трекер только что выкатили) — фронт по
    -- этому флагу показывает подсказку вместо пустых нулей.
    'has_events', (select count(*) > 0 from ev),

    'totals', jsonb_build_object(
      -- посещаемость
      'visitors',        (select count(distinct visitor_id) from ev),
      'new_visitors',    (select count(*) from first_seen where first_at >= v_from),
      'sessions',        (select count(distinct session_id) from ev),
      'pageviews',       (select count(*) from ev where event = 'page_view'),
      'landing_visitors',(select count(distinct visitor_id) from ev where event = 'page_view' and path = '/'),
      -- воронка создания
      'builder_started', (select count(distinct visitor_id) from ev where event = 'builder_start'),
      'builder_finished',(select count(distinct visitor_id) from ev where event = 'builder_publish_click'),
      'auth_passed',     (select count(distinct visitor_id) from ev where event = 'auth_success'),
      'auth_viewed',     (select count(distinct visitor_id) from ev where event = 'auth_view'),
      'payment_chosen',  (select count(distinct visitor_id) from ev where event = 'payment_method_choose'),
      'name_blocked',    (select count(distinct visitor_id) from ev
                           where event in ('builder_blocked_no_name', 'publish_blocked_no_name')),
      'guest_sessions',  (select count(distinct visitor_id) from ev where event = 'guest_session_created'),
      'guest_claimed',   (select count(distinct visitor_id) from ev where event = 'guest_claimed'),
      'payment_started', (select count(distinct visitor_id) from ev where event = 'payment_redirect'),
      -- то же самое, но по данным БД (это источник правды по деньгам)
      'signups',         (select count(*) from real_profiles where created_at >= v_from and created_at < v_to),
      'guest_accounts',  (select count(*) from profiles pr join auth.users u on u.id = pr.id
                           where u.is_anonymous and pr.created_at >= v_from and pr.created_at < v_to),
      'drafts',          (select count(*) from inv),
      'published',       (select count(*) from invitations
                           where published_at >= v_from and published_at < v_to
                             and user_id not in (select id from admins)),
      'payments_started',(select count(*) from pay),
      'paid',            (select count(*) from pay where status = 'paid'),
      'revenue',         (select coalesce(sum(amount), 0) from pay where status = 'paid'),
      -- сторона получателя
      'invite_views',       (select count(*) from ev where event = 'invite_view'),
      'invite_viewers',     (select count(distinct visitor_id) from ev where event = 'invite_view'),
      'invites_opened',     (select count(*) from invitations
                              where first_viewed_at >= v_from and first_viewed_at < v_to
                                and user_id not in (select id from admins)),
      'responses',          (select count(*) from resp),
      'responses_yes',      (select count(*) from resp where answered_yes),
      -- поддержка
      'support_tickets', (select count(*) from support_tickets
                           where created_at >= v_from and created_at < v_to)
    ),

    -- Итоги проекта целиком — чтобы период не путали с общими цифрами.
    'alltime', jsonb_build_object(
      'users',         (select count(*) from real_profiles),
      'invitations',   (select count(*) from invitations where user_id not in (select id from admins)),
      'published',     (select count(*) from invitations
                         where status <> 'draft' and user_id not in (select id from admins)),
      'paid',          (select count(*) from payments
                         where status = 'paid' and user_id not in (select id from admins)),
      'revenue',       (select coalesce(sum(amount), 0) from payments
                         where status = 'paid' and user_id not in (select id from admins)),
      'responses',     (select count(*) from responses r join invitations i on i.id = r.invitation_id
                         where i.user_id not in (select id from admins)),
      'responses_yes', (select count(*) from responses r join invitations i on i.id = r.invitation_id
                         where r.answered_yes and i.user_id not in (select id from admins))
    ),

    'live', jsonb_build_object(
      'visitors_30m', (select count(distinct visitor_id) from analytics_events
                        where occurred_at > now() - interval '30 minutes'
                          and visitor_id not in (select visitor_id from internal)),
      'events_30m',   (select count(*) from analytics_events
                        where occurred_at > now() - interval '30 minutes'
                          and visitor_id not in (select visitor_id from internal))
    ),

    'daily', (
      select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
        select
          d.day,
          (select count(distinct e.visitor_id) from ev e where e.day = d.day)                        as visitors,
          (select count(*) from ev e where e.day = d.day and e.event = 'page_view')                  as pageviews,
          (select count(distinct e.visitor_id) from ev e
            where e.day = d.day and e.event = 'builder_start')                                       as builder_started,
          (select count(*) from inv i
            where (i.created_at at time zone v_tz)::date = d.day)                                    as drafts,
          (select count(*) from pay p
            where p.status = 'paid' and (p.created_at at time zone v_tz)::date = d.day)              as paid,
          (select coalesce(sum(p.amount), 0) from pay p
            where p.status = 'paid' and (p.created_at at time zone v_tz)::date = d.day)              as revenue,
          (select count(*) from ev e where e.day = d.day and e.event = 'invite_view')                as invite_views,
          (select count(*) from resp r
            where (r.created_at at time zone v_tz)::date = d.day)                                    as responses
        from days d
      ) x
    ),

    -- Источник: utm_source, если есть; иначе домен реферера; иначе «прямой заход».
    'sources', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select
          coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') as source,
          count(distinct visitor_id)                                            as visitors,
          count(distinct session_id)                                            as sessions,
          count(distinct visitor_id) filter (where event = 'builder_start')     as builder_started,
          count(distinct visitor_id) filter (where event = 'payment_redirect')  as payment_started
        from ev
        group by 1
        order by visitors desc
        limit 25
      ) x
    ),

    'campaigns', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select
          utm_campaign                as campaign,
          coalesce(utm_medium, '—')   as medium,
          count(distinct visitor_id)  as visitors
        from ev
        where utm_campaign is not null and utm_campaign <> ''
        group by 1, 2
        order by visitors desc
        limit 15
      ) x
    ),

    'ref_codes', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select ref_code as code, count(distinct visitor_id) as visitors
        from ev
        where ref_code is not null and ref_code <> ''
        group by 1
        order by visitors desc
        limit 15
      ) x
    ),

    'devices', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select coalesce(nullif(device, ''), 'unknown') as device,
               count(distinct visitor_id)              as visitors
        from ev
        group by 1
      ) x
    ),

    'langs', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select coalesce(nullif(lang, ''), 'unknown') as lang,
               count(distinct visitor_id)            as visitors
        from ev
        group by 1
        order by visitors desc
        limit 10
      ) x
    ),

    -- /i/<slug> схлопываем в одну строку: конкретные приглашения — ниже.
    'pages', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
        select
          case
            when path like '/i/%'           then '/i/:slug'
            when path like '/builder/%'     then '/builder/:id'
            when path like '/payment/%'     then '/payment/:id'
            when path like '/dashboard/%'   then '/dashboard/:id'
            else coalesce(nullif(path, ''), '(неизвестно)')
          end                        as path,
          count(*)                   as views,
          count(distinct visitor_id) as visitors
        from ev
        where event = 'page_view'
        group by 1
        order by views desc
        limit 20
      ) x
    ),

    'events', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb) from (
        select event, count(*) as count, count(distinct visitor_id) as visitors
        from ev
        group by 1
        order by count desc
        limit 30
      ) x
    ),

    -- Топ приглашений по просмотрам получателями за период.
    'top_invitations', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
        select
          e.invitation_slug                                      as slug,
          (select i.recipient_name from invitations i where i.slug = e.invitation_slug) as recipient_name,
          count(*)                                               as views,
          count(distinct e.visitor_id)                           as viewers,
          count(*) filter (where e.event = 'invite_submit')      as submits
        from ev e
        where e.invitation_slug is not null
        group by 1
        order by views desc
        limit 10
      ) x
    ),

    -- Разрез по шаблонам: что люди реально выбирают в конструкторе.
    'templates', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb) from (
        select coalesce(template_key, '—') as template, count(*) as count
        from inv
        group by 1
        order by count desc
        limit 10
      ) x
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_analytics(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_analytics(timestamptz, timestamptz) to authenticated;
