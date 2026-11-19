-- © 2026 Senti. Все права защищены.
--
-- Аналитика v3: деньги, источники продаж, тревоги и утренняя сводка.
--
--   * analytics_events.utm_content — метка конкретного ролика/креатива;
--   * ad_spend — расходы на рекламу (вносятся вручную в админке);
--   * admin_analytics: оплаты привязаны к источнику, кампании и ролику
--     (через первый заход того, кто заплатил), расходы и цена продажи,
--     шаги конструктора, «получатели → покупатели», ошибки оплаты;
--     функцию может вызвать и сервер (service_role) — для сводки;
--   * track_event шлёт тревогу в Telegram при payment_timeout/publish_error;
--   * send_daily_report() + pg_cron: сводка за вчера в 09:00 по Ташкенту.

-- ------------------------------------------------------------ метка ролика
alter table public.analytics_events add column if not exists utm_content text;

-- ------------------------------------------------------- расходы на рекламу
create table if not exists public.ad_spend (
  id         bigserial primary key,
  day        date not null,
  channel    text not null default 'meta',
  campaign   text,          -- = utm_campaign в ссылке рекламы
  content    text,          -- = utm_content (ролик/креатив), можно пусто
  amount     integer not null check (amount >= 0),  -- сум
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.ad_spend is
  'Расходы на рекламу по дням. campaign/content совпадают с utm_campaign/utm_content в ссылках.';

create index if not exists ad_spend_day_idx on public.ad_spend (day);

alter table public.ad_spend enable row level security;
revoke all on public.ad_spend from anon;
grant select, insert, update, delete on public.ad_spend to authenticated;
grant usage, select on sequence public.ad_spend_id_seq to authenticated;

drop policy if exists "admins manage ad_spend" on public.ad_spend;
create policy "admins manage ad_spend" on public.ad_spend
  for all to authenticated
  using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin))
  with check (exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin));

-- --------------------------------------------------------- запись события
-- Сигнатура меняется (новый параметр), поэтому старую версию удаляем.
-- Старые вкладки, которые ещё шлют 13 параметров, попадут в новую версию:
-- у p_utm_content есть значение по умолчанию.
drop function if exists public.track_event(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text
);

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
  p_lang             text default null,
  p_utm_content      text default null
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_recent int;
  v_props  jsonb;
  v_url    text;
  v_secret text;
begin
  if p_event is null or p_event !~ '^[a-z][a-z0-9_]{2,39}$' then
    return false;
  end if;
  if p_visitor_id is null or p_session_id is null then
    return false;
  end if;

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

  -- Тревога владельцу: оплата ушла, а приглашение не опубликовалось, или
  -- публикация упала. Не чаще раза в час на посетителя и вид ошибки.
  if p_event in ('payment_timeout', 'publish_error')
     and not exists (
       select 1 from analytics_events
        where visitor_id = p_visitor_id and event = p_event
          and occurred_at > now() - interval '1 hour'
     )
  then
    begin
      select value into v_url from app_secrets where key = 'notify_url';
      select value into v_secret from app_secrets where key = 'notify_secret';
      if v_url is not null and v_secret is not null then
        perform net.http_post(
          url := v_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
          body := jsonb_build_object(
            'event', 'admin_alert',
            'extra', jsonb_build_object(
              'kind', p_event,
              'message', left(v_props->>'message', 200),
              'path', left(p_path, 200),
              'device', left(p_device, 20)
            )
          )
        );
      end if;
    exception when others then
      raise warning 'admin alert failed: %', sqlerrm;
    end;
  end if;

  insert into analytics_events (
    visitor_id, session_id, user_id, event, path, invitation_slug,
    utm_source, utm_medium, utm_campaign, utm_content, ref_code, referrer_host,
    device, lang, props
  ) values (
    p_visitor_id, p_session_id, auth.uid(), p_event,
    left(p_path, 300), left(p_invitation_slug, 64),
    left(p_utm_source, 80), left(p_utm_medium, 80), left(p_utm_campaign, 120), left(p_utm_content, 120),
    left(lower(p_ref_code), 32), left(p_referrer_host, 120),
    left(p_device, 20), left(p_lang, 12), v_props
  );

  return true;
end;
$$;

revoke execute on function public.track_event(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text, text
) from public;
grant execute on function public.track_event(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ------------------------------------------------------- отчёт для админки
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
  -- Админ из браузера или сервер (утренняя сводка в Telegram).
  if coalesce(auth.role(), '') <> 'service_role'
     and not exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_to - v_from > interval '400 days' then
    v_from := v_to - interval '400 days';
  end if;

  with
  admins as (select id from profiles where is_admin),
  -- Свои браузеры (где хоть раз был вход админом) не считаем — и задним числом.
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
  -- Первый заход посетителя за всю историю: откуда он пришёл впервые.
  -- По нему считаем источник и людей, и их оплат (first-touch).
  touch as (
    select distinct on (visitor_id)
           visitor_id,
           occurred_at as first_at,
           coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), 'direct') as source,
           nullif(utm_campaign, '') as campaign,
           nullif(utm_content, '')  as content,
           path as first_path
      from analytics_events
     where visitor_id not in (select visitor_id from internal)
     order by visitor_id, occurred_at
  ),
  -- Каждому аккаунту — самый ранний его браузер (через события с user_id).
  user_touch as (
    select distinct on (uv.user_id)
           uv.user_id, t.visitor_id, t.source, t.campaign, t.content, t.first_path
      from (select user_id, visitor_id, min(occurred_at) as seen
              from analytics_events
             where user_id is not null
             group by 1, 2) uv
      join touch t on t.visitor_id = uv.visitor_id
     order by uv.user_id, t.first_at
  ),
  real_profiles as (
    select pr.* from profiles pr
      join auth.users u on u.id = pr.id
     where not coalesce(u.is_anonymous, false)
  ),
  first_seen as (
    select visitor_id, first_at from touch
     where visitor_id in (select distinct visitor_id from ev)
  ),
  pay as (
    select * from payments
     where created_at >= v_from and created_at < v_to
       and user_id not in (select id from admins)
  ),
  -- Оплаты периода с источником того, кто заплатил. Источник может быть
  -- пустым: человек платил с устройства, где счётчик его не видел.
  paid_orders as (
    select p.id, p.amount, p.user_id, (p.created_at at time zone v_tz)::date as day,
           ut.visitor_id, ut.source, ut.campaign, ut.content, ut.first_path
      from pay p
      left join user_touch ut on ut.user_id = p.user_id
     where p.status = 'paid'
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
  spend as (
    select * from ad_spend
     where day >= (v_from at time zone v_tz)::date
       and day <= (v_to at time zone v_tz)::date
  ),
  ev_touch as (
    select e.*, t.source as t_source, t.campaign as t_campaign, t.content as t_content, t.first_path
      from ev e join touch t on t.visitor_id = e.visitor_id
  ),
  days as (
    select generate_series(
      (v_from at time zone v_tz)::date,
      (v_to   at time zone v_tz)::date,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'days', (select count(*) from days), 'tz', v_tz),
    'has_events', (select count(*) > 0 from ev),

    'totals', jsonb_build_object(
      'visitors',        (select count(distinct visitor_id) from ev),
      'new_visitors',    (select count(*) from first_seen where first_at >= v_from),
      'sessions',        (select count(distinct session_id) from ev),
      'pageviews',       (select count(*) from ev where event = 'page_view'),
      'landing_visitors',(select count(distinct visitor_id) from ev where event = 'page_view' and path = '/'),
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
      -- Последний шаг воронки на тех же людях, что и верхние: заплатившие,
      -- чей браузер был среди посетителей периода.
      'paid_in_funnel',  (select count(distinct po.user_id) from paid_orders po
                           where po.visitor_id in (select visitor_id from ev)),
      'paid_attributed', (select count(*) from paid_orders where visitor_id is not null),
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
      'spend',           (select coalesce(sum(amount), 0) from spend),
      'invite_views',    (select count(*) from ev where event = 'invite_view'),
      'invite_viewers',  (select count(distinct visitor_id) from ev where event = 'invite_view'),
      'invites_opened',  (select count(*) from invitations
                           where first_viewed_at >= v_from and first_viewed_at < v_to
                             and user_id not in (select id from admins)),
      'responses',       (select count(*) from resp),
      'responses_yes',   (select count(*) from resp where answered_yes),
      'support_tickets', (select count(*) from support_tickets where created_at >= v_from and created_at < v_to),
      'payment_timeouts',(select count(distinct visitor_id) from ev where event = 'payment_timeout'),
      'publish_errors',  (select count(distinct visitor_id) from ev where event = 'publish_error')
    ),

    'alltime', jsonb_build_object(
      'users',         (select count(*) from real_profiles),
      'invitations',   (select count(*) from invitations where user_id not in (select id from admins)),
      'published',     (select count(*) from invitations
                         where status <> 'draft' and user_id not in (select id from admins)),
      'paid',          (select count(*) from payments
                         where status = 'paid' and user_id not in (select id from admins)),
      'revenue',       (select coalesce(sum(amount), 0) from payments
                         where status = 'paid' and user_id not in (select id from admins)),
      'spend',         (select coalesce(sum(amount), 0) from ad_spend),
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
          (select count(distinct e.visitor_id) from ev e where e.day = d.day) as visitors,
          (select count(*) from ev e where e.day = d.day and e.event = 'page_view') as pageviews,
          (select count(distinct e.visitor_id) from ev e where e.day = d.day and e.event = 'builder_start') as builder_started,
          (select count(*) from inv i where (i.created_at at time zone v_tz)::date = d.day) as drafts,
          (select count(*) from paid_orders p where p.day = d.day) as paid,
          (select coalesce(sum(p.amount), 0) from paid_orders p where p.day = d.day) as revenue,
          (select coalesce(sum(s.amount), 0) from spend s where s.day = d.day) as spend,
          (select count(*) from ev e where e.day = d.day and e.event = 'invite_view') as invite_views,
          (select count(*) from resp r where (r.created_at at time zone v_tz)::date = d.day) as responses
        from days d
      ) x
    ),

    -- Источники по первому заходу. Оплаты — по первому заходу того, кто заплатил.
    'sources', (
      select coalesce(jsonb_agg(x order by x.visitors desc, x.paid desc), '[]'::jsonb) from (
        select k.source,
          (select count(distinct visitor_id) from ev_touch where t_source = k.source) as visitors,
          (select count(distinct visitor_id) from ev_touch where t_source = k.source and event = 'builder_start') as builder_started,
          (select count(distinct visitor_id) from ev_touch where t_source = k.source and event = 'payment_redirect') as payment_started,
          (select count(*) from paid_orders where source = k.source) as paid,
          (select coalesce(sum(amount), 0) from paid_orders where source = k.source) as revenue
        from (select t_source as source from ev_touch
              union select source from paid_orders where source is not null) k
      ) x
      where x.visitors > 0 or x.paid > 0
    ),

    -- Кампании (utm_campaign) с расходами из ad_spend.
    'campaigns', (
      select coalesce(jsonb_agg(x order by x.spend desc, x.visitors desc), '[]'::jsonb) from (
        select k.campaign,
          (select count(distinct visitor_id) from ev_touch where t_campaign = k.campaign) as visitors,
          (select count(distinct visitor_id) from ev_touch where t_campaign = k.campaign and event = 'builder_start') as builder_started,
          (select count(*) from paid_orders where campaign = k.campaign) as paid,
          (select coalesce(sum(amount), 0) from paid_orders where campaign = k.campaign) as revenue,
          (select coalesce(sum(amount), 0) from spend where campaign = k.campaign) as spend
        from (select t_campaign as campaign from ev_touch where t_campaign is not null
              union select campaign from paid_orders where campaign is not null
              union select campaign from spend where campaign is not null) k
      ) x
    ),

    -- Ролики внутри кампаний (utm_content).
    'contents', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select k.campaign, k.content,
          (select count(distinct visitor_id) from ev_touch
            where t_campaign is not distinct from k.campaign and t_content = k.content) as visitors,
          (select count(distinct visitor_id) from ev_touch
            where t_campaign is not distinct from k.campaign and t_content = k.content and event = 'builder_start') as builder_started,
          (select count(*) from paid_orders
            where campaign is not distinct from k.campaign and content = k.content) as paid,
          (select coalesce(sum(amount), 0) from paid_orders
            where campaign is not distinct from k.campaign and content = k.content) as revenue,
          (select coalesce(sum(amount), 0) from spend
            where campaign is not distinct from k.campaign and content = k.content) as spend
        from (select t_campaign as campaign, t_content as content from ev_touch where t_content is not null
              union select campaign, content from paid_orders where content is not null
              union select campaign, content from spend where content is not null) k
      ) x
    ),

    -- Расходы списком — для таблицы в админке (правка и удаление).
    'spend_rows', (
      select coalesce(jsonb_agg(x order by x.day desc, x.id desc), '[]'::jsonb) from (
        select id, day, channel, campaign, content, amount, note from spend
      ) x
    ),

    -- Конструктор по шагам: где бросают.
    'builder_steps', (
      select coalesce(jsonb_agg(x order by x.idx), '[]'::jsonb) from (
        select (props->>'index')::int as idx, props->>'step' as step, count(distinct visitor_id) as visitors
          from ev
         where event = 'builder_step' and props ? 'index'
         group by 1, 2
      ) x
    ),

    -- Пришли через чужое приглашение (первый заход — на /i/...) и что дальше.
    'viral', jsonb_build_object(
      'recipients',      (select count(distinct visitor_id) from ev_touch where first_path like '/i/%'),
      'cta_clicks',      (select count(distinct visitor_id) from ev where event = 'recipient_cta_click'),
      'started_builder', (select count(distinct visitor_id) from ev_touch
                           where first_path like '/i/%' and event = 'builder_start'),
      'paid',            (select count(*) from paid_orders where first_path like '/i/%'),
      'revenue',         (select coalesce(sum(amount), 0) from paid_orders where first_path like '/i/%')
    ),

    -- Последние сбои оплаты и публикации.
    'issues', (
      select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (
        select occurred_at as at, event, left(props->>'message', 160) as message, path, device
          from ev
         where event in ('payment_timeout', 'publish_error')
         order by occurred_at desc
         limit 10
      ) x
    ),

    'devices', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select coalesce(nullif(device, ''), 'unknown') as device, count(distinct visitor_id) as visitors
        from ev group by 1
      ) x
    ),
    'langs', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select coalesce(nullif(lang, ''), 'unknown') as lang, count(distinct visitor_id) as visitors
        from ev group by 1 order by visitors desc limit 10
      ) x
    ),
    'pages', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
        select
          case
            when path like '/i/%' then '/i/:slug'
            when path like '/builder/%' then '/builder/:id'
            when path like '/payment/%' then '/payment/:id'
            when path like '/dashboard/%' then '/dashboard/:id'
            else coalesce(nullif(path, ''), '(неизвестно)')
          end as path,
          count(*) as views,
          count(distinct visitor_id) as visitors
        from ev where event = 'page_view' group by 1 order by views desc limit 20
      ) x
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb) from (
        select event, count(*) as count, count(distinct visitor_id) as visitors
        from ev group by 1 order by count desc limit 40
      ) x
    ),
    'ref_codes', (
      select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
        select ref_code as code, count(distinct visitor_id) as visitors
        from ev where ref_code is not null and ref_code <> '' group by 1 order by visitors desc limit 15
      ) x
    ),
    'top_invitations', (
      select coalesce(jsonb_agg(x order by x.views desc), '[]'::jsonb) from (
        select
          e.invitation_slug as slug,
          (select i.recipient_name from invitations i where i.slug = e.invitation_slug) as recipient_name,
          count(*) as views,
          count(distinct e.visitor_id) as viewers,
          count(*) filter (where e.event = 'invite_submit') as submits
        from ev e where e.invitation_slug is not null group by 1 order by views desc limit 10
      ) x
    ),
    'templates', (
      select coalesce(jsonb_agg(x order by x.count desc), '[]'::jsonb) from (
        select coalesce(template_key, '—') as template, count(*) as count
        from inv group by 1 order by count desc limit 10
      ) x
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_analytics(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_analytics(timestamptz, timestamptz) to authenticated, service_role;

-- -------------------------------------------------- утренняя сводка в Telegram
-- База будит /api/telegram/notify тем же секретом, что и уведомления об
-- ответах; сам текст сводки собирает сервер (он вызывает admin_analytics).
create or replace function public.send_daily_report()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('event', 'daily_report')
  );
end;
$$;

revoke execute on function public.send_daily_report() from public, anon, authenticated;

select cron.unschedule('daily-report-telegram')
where exists (select 1 from cron.job where jobname = 'daily-report-telegram');

-- 04:00 UTC = 09:00 по Ташкенту
select cron.schedule('daily-report-telegram', '0 4 * * *', 'select public.send_daily_report()');
