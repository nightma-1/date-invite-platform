-- © 2026 Senti. Все права защищены.
--
-- Аналитика сайта для админки (/xujayin).
--
-- Зачем своя таблица, а не Google Analytics: нужна воронка, склеенная с
-- нашими же данными (черновики, оплаты, ответы получателей), и всё это
-- должно жить в одной базе, без внешних счётчиков и cookie-баннеров.
--
-- Три части:
--   1. analytics_events — сырые события с фронта. Писать может кто угодно,
--      но ТОЛЬКО через track_event() (у anon нет insert на таблицу),
--      читать — только админ.
--   2. track_event() — единственная точка записи: валидирует имя события,
--      режет длины и держит анти-флуд (не больше 120 событий в минуту
--      с одного visitor_id).
--   3. admin_analytics() — вся статистика одним вызовом: тоталы, воронка,
--      дни, источники, устройства, страницы, топ приглашений.
--
-- Сутки считаем по Ташкенту, а не по UTC: «сколько было вчера» владелец
-- смотрит по своему календарю.

-- ------------------------------------------------------------------ таблица
create table if not exists public.analytics_events (
  id             bigserial primary key,
  occurred_at    timestamptz not null default now(),
  -- visitor_id живёт в localStorage (человек), session_id — в sessionStorage
  -- (один заход). Оба генерит фронт, оба анонимные: ни IP, ни почты здесь нет.
  visitor_id     uuid not null,
  session_id     uuid not null,
  user_id        uuid references auth.users(id) on delete set null,
  event          text not null,
  path           text,
  -- для событий на стороне получателя: какое именно приглашение смотрят
  invitation_slug text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  ref_code       text,
  referrer_host  text,
  device         text,
  lang           text,
  props          jsonb not null default '{}'::jsonb
);

comment on table public.analytics_events is
  'Анонимные события посещений для админской аналитики. Пишется только через track_event().';

create index if not exists analytics_events_occurred_idx on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_event_idx    on public.analytics_events (event, occurred_at desc);
create index if not exists analytics_events_visitor_idx  on public.analytics_events (visitor_id, occurred_at desc);
create index if not exists analytics_events_slug_idx     on public.analytics_events (invitation_slug)
  where invitation_slug is not null;

alter table public.analytics_events enable row level security;

-- Никакого прямого доступа: anon и authenticated пишут только через RPC.
revoke all on public.analytics_events from anon, authenticated;
revoke all on sequence public.analytics_events_id_seq from anon, authenticated;
grant select on public.analytics_events to authenticated;

drop policy if exists "admins read analytics" on public.analytics_events;
create policy "admins read analytics" on public.analytics_events
  for select to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin));

-- ------------------------------------------------------------- запись события
create or replace function public.track_event(
  p_event            text,
  p_visitor_id       uuid,
  p_session_id       uuid,
  p_path             text default null,
  p_props            jsonb default '{}'::jsonb,
  p_invitation_slug  text default null,
  p_utm_source       text default null,
  p_utm_medium       text default null,
  p_utm_campaign     text default null,
  p_ref_code         text default null,
  p_referrer_host    text default null,
  p_device           text default null,
  p_lang             text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
  v_props  jsonb;
begin
  -- Имя события — только наш формат. Это заодно отсекает попытки залить
  -- в таблицу мусор произвольной длины.
  if p_event is null or p_event !~ '^[a-z][a-z0-9_]{2,39}$' then
    return false;
  end if;
  if p_visitor_id is null or p_session_id is null then
    return false;
  end if;

  -- Анти-флуд: таблица открыта всему интернету через RPC, поэтому держим
  -- потолок на одного посетителя. Молча отбрасываем, а не падаем ошибкой —
  -- фронту на это реагировать нечем.
  select count(*) into v_recent
    from analytics_events
   where visitor_id = p_visitor_id
     and occurred_at > now() - interval '1 minute';
  if v_recent >= 120 then
    return false;
  end if;

  v_props := coalesce(p_props, '{}'::jsonb);
  if jsonb_typeof(v_props) <> 'object' or pg_column_size(v_props) > 2000 then
    v_props := '{}'::jsonb;
  end if;

  insert into analytics_events (
    visitor_id, session_id, user_id, event, path, invitation_slug,
    utm_source, utm_medium, utm_campaign, ref_code, referrer_host,
    device, lang, props
  ) values (
    p_visitor_id,
    p_session_id,
    auth.uid(),
    p_event,
    left(p_path, 300),
    left(p_invitation_slug, 64),
    left(p_utm_source, 80),
    left(p_utm_medium, 80),
    left(p_utm_campaign, 120),
    left(lower(p_ref_code), 32),
    left(p_referrer_host, 120),
    left(p_device, 20),
    left(p_lang, 12),
    v_props
  );

  return true;
end;
$$;

revoke execute on function public.track_event(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.track_event(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ------------------------------------------------------------------- очистка
-- Сырые события держим полгода: для «год назад» хватает агрегатов из
-- invitations/payments/responses, а таблица не должна расти бесконечно.
create or replace function public.prune_analytics_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from analytics_events where occurred_at < now() - interval '180 days';
$$;

revoke execute on function public.prune_analytics_events() from public, anon, authenticated;

select cron.unschedule('prune-analytics-daily')
where exists (select 1 from cron.job where jobname = 'prune-analytics-daily');

select cron.schedule('prune-analytics-daily', '40 4 * * *', 'select public.prune_analytics_events()');

-- --------------------------------------------------------- статистика админки
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
  ev as (
    select *, (occurred_at at time zone v_tz)::date as day
      from analytics_events
     where occurred_at >= v_from and occurred_at < v_to
  ),
  -- первый визит посетителя за всю историю — чтобы отделить новых от вернувшихся
  first_seen as (
    select visitor_id, min(occurred_at) as first_at
      from analytics_events
     where visitor_id in (select distinct visitor_id from ev)
     group by visitor_id
  ),
  pay as (
    select * from payments where created_at >= v_from and created_at < v_to
  ),
  inv as (
    select * from invitations where created_at >= v_from and created_at < v_to
  ),
  resp as (
    select * from responses where created_at >= v_from and created_at < v_to
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
      'payment_started', (select count(distinct visitor_id) from ev where event = 'payment_redirect'),
      -- то же самое, но по данным БД (это источник правды по деньгам)
      'signups',         (select count(*) from profiles where created_at >= v_from and created_at < v_to),
      'drafts',          (select count(*) from inv),
      'published',       (select count(*) from invitations
                           where published_at >= v_from and published_at < v_to),
      'payments_started',(select count(*) from pay),
      'paid',            (select count(*) from pay where status = 'paid'),
      'revenue',         (select coalesce(sum(amount), 0) from pay where status = 'paid'),
      -- сторона получателя
      'invite_views',       (select count(*) from ev where event = 'invite_view'),
      'invite_viewers',     (select count(distinct visitor_id) from ev where event = 'invite_view'),
      'invites_opened',     (select count(*) from invitations
                              where first_viewed_at >= v_from and first_viewed_at < v_to),
      'responses',          (select count(*) from resp),
      'responses_yes',      (select count(*) from resp where answered_yes),
      -- поддержка
      'support_tickets', (select count(*) from support_tickets
                           where created_at >= v_from and created_at < v_to)
    ),

    -- Итоги проекта целиком — чтобы период не путали с общими цифрами.
    'alltime', jsonb_build_object(
      'users',         (select count(*) from profiles),
      'invitations',   (select count(*) from invitations),
      'published',     (select count(*) from invitations where status <> 'draft'),
      'paid',          (select count(*) from payments where status = 'paid'),
      'revenue',       (select coalesce(sum(amount), 0) from payments where status = 'paid'),
      'responses',     (select count(*) from responses),
      'responses_yes', (select count(*) from responses where answered_yes)
    ),

    'live', jsonb_build_object(
      'visitors_30m', (select count(distinct visitor_id) from analytics_events
                        where occurred_at > now() - interval '30 minutes'),
      'events_30m',   (select count(*) from analytics_events
                        where occurred_at > now() - interval '30 minutes')
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
