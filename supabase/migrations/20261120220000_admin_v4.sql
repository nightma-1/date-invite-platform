-- Админка v4: люди (история посетителя), действия с приглашениями и журнал
-- действий, состояние системы, промокоды, расходы из Meta Marketing API.

-- ── Журнал действий админа ─────────────────────────────────────────────
create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null,
  invitation_id uuid,
  user_id uuid,
  details jsonb
);
alter table public.admin_actions enable row level security;

create or replace function public.is_admin_caller()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin) $$;
revoke all on function public.is_admin_caller() from public, anon;
grant execute on function public.is_admin_caller() to authenticated;

-- ── Люди: список посетителей ───────────────────────────────────────────
create or replace function public.admin_visitors(p_days integer default 7)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with internal as (
    select distinct e.visitor_id from analytics_events e
    join profiles p on p.id = e.user_id and p.is_admin
  ),
  ev as (
    select * from analytics_events
    where occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
      and visitor_id is not null
      and visitor_id not in (select visitor_id from internal)
  ),
  firsts as (
    select distinct on (visitor_id) visitor_id, utm_source, utm_campaign, utm_content, referrer_host, ref_code, device, lang, path
    from analytics_events
    where visitor_id in (select visitor_id from ev)
    order by visitor_id, occurred_at
  ),
  agg as (
    select visitor_id,
      min(occurred_at) first_seen, max(occurred_at) last_seen, count(*) events,
      count(distinct session_id) sessions,
      max(user_id::text)::uuid user_id,
      bool_or(event = 'invite_view') saw_invite,
      bool_or(event = 'builder_start') started,
      max(case when event = 'builder_step' then coalesce((props->>'index')::int, 0) + 1 end) max_step,
      bool_or(event = 'builder_publish_click') publish_click,
      bool_or(event = 'draft_created') draft,
      bool_or(event = 'payment_redirect') pay_redirect,
      bool_or(event = 'payment_success') paid_event,
      bool_or(event in ('publish_error', 'auth_error')) had_error
    from ev group by visitor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'visitor_id', a.visitor_id, 'first_seen', a.first_seen, 'last_seen', a.last_seen,
    'events', a.events, 'sessions', a.sessions,
    'source', coalesce(f.utm_source, case when f.ref_code is not null then 'partner' end, f.referrer_host, 'direct'),
    'campaign', f.utm_campaign, 'content', f.utm_content, 'device', f.device, 'lang', f.lang, 'landing', f.path,
    'user_id', a.user_id,
    'owner', coalesce(u.email::text, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
    'stage', case
      when a.paid_event or exists (select 1 from payments p where p.user_id = a.user_id and p.status = 'paid') then 'paid'
      when a.pay_redirect then 'payment'
      when a.draft then 'draft'
      when a.publish_click then 'publish_click'
      when a.started then 'builder'
      when a.saw_invite then 'recipient'
      else 'visit' end,
    'max_step', a.max_step, 'had_error', a.had_error
  ) order by a.last_seen desc), '[]'::jsonb)
  from (select * from agg order by last_seen desc limit 1000) a
  left join firsts f on f.visitor_id = a.visitor_id
  left join auth.users u on u.id = a.user_id
  where public.is_admin_caller();
$$;
revoke all on function public.admin_visitors(integer) from public, anon;
grant execute on function public.admin_visitors(integer) to authenticated;

-- ── Промокоды ─────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,24}$'),
  discount_percent integer not null check (discount_percent between 1 and 100),
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  partner_id uuid references public.partners(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
drop policy if exists "admins manage promo_codes" on public.promo_codes;
create policy "admins manage promo_codes" on public.promo_codes for all to authenticated
  using (public.is_admin_caller()) with check (public.is_admin_caller());

alter table public.payments add column if not exists promo_code text;
alter table public.payments drop constraint if exists payments_provider_check;

-- Проверка кода перед оплатой (показать новую цену). Саму скидку считает
-- только сервер в /api/click/create — клиенту цену не доверяем.
create or replace function public.check_promo_code(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('code', pc.code, 'discount_percent', pc.discount_percent)
  from promo_codes pc
  where pc.code = upper(trim(p_code)) and pc.is_active
    and (pc.expires_at is null or pc.expires_at > now())
    and (pc.max_uses is null or (select count(*) from payments p where p.promo_code = pc.code and p.status = 'paid') < pc.max_uses);
$$;
revoke all on function public.check_promo_code(text) from public;
grant execute on function public.check_promo_code(text) to anon, authenticated;

create or replace function public.admin_promo_codes()
returns table (id uuid, code text, discount_percent integer, max_uses integer, expires_at timestamptz,
  is_active boolean, partner_code text, partner_id uuid, note text, created_at timestamptz,
  uses bigint, revenue bigint, attempts bigint)
language sql stable security definer set search_path = public
as $$
  select pc.id, pc.code, pc.discount_percent, pc.max_uses, pc.expires_at, pc.is_active, pa.code, pc.partner_id, pc.note, pc.created_at,
    (select count(*) from payments p where p.promo_code = pc.code and p.status = 'paid'),
    (select coalesce(sum(p.amount), 0) from payments p where p.promo_code = pc.code and p.status = 'paid'),
    (select count(*) from payments p where p.promo_code = pc.code)
  from promo_codes pc left join partners pa on pa.id = pc.partner_id
  where public.is_admin_caller()
  order by pc.created_at desc;
$$;
revoke all on function public.admin_promo_codes() from public, anon;
grant execute on function public.admin_promo_codes() to authenticated;

-- ── Люди: история одного посетителя (и его аккаунта на других устройствах)
create or replace function public.admin_visitor_journey(p_visitor uuid default null, p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_users uuid[];
  v_visitors uuid[];
begin
  if not public.is_admin_caller() then return null; end if;
  select array_agg(distinct user_id) filter (where user_id is not null) into v_users
    from analytics_events where visitor_id = p_visitor;
  v_users := coalesce(v_users, '{}') || case when p_user is not null then array[p_user] else '{}'::uuid[] end;
  select array_agg(distinct visitor_id) into v_visitors
    from analytics_events where visitor_id = p_visitor or user_id = any(v_users);
  v_visitors := coalesce(v_visitors, case when p_visitor is not null then array[p_visitor] else '{}'::uuid[] end);

  return jsonb_build_object(
    'users', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
        'created_at', u.created_at, 'has_bot', pr.telegram_chat_id is not null, 'telegram', pr.telegram_username,
        'provider', (select string_agg(provider, ', ') from auth.identities x where x.user_id = u.id))), '[]')
      from auth.users u left join profiles pr on pr.id = u.id where u.id = any(v_users)),
    'devices', coalesce(array_length(v_visitors, 1), 0),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', e.occurred_at, 'event', e.event, 'path', e.path, 'slug', e.invitation_slug,
        'props', e.props, 'source', e.utm_source, 'campaign', e.utm_campaign, 'device', e.device,
        'visitor', e.visitor_id, 'session', e.session_id) order by e.occurred_at), '[]')
      from (select * from analytics_events where visitor_id = any(v_visitors) or user_id = any(v_users)
            order by occurred_at desc limit 600) e),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'slug', i.slug, 'recipient_name', i.recipient_name, 'status', i.status, 'kind', i.kind,
        'created_at', i.created_at, 'published_at', i.published_at, 'view_count', i.view_count,
        'reminder_sent_at', i.reminder_sent_at) order by i.created_at), '[]')
      from invitations i where i.user_id = any(v_users)),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'created_at', p.created_at, 'status', p.status, 'amount', p.amount, 'method', p.method,
        'promo_code', p.promo_code, 'invitation_id', p.invitation_id) order by p.created_at), '[]')
      from payments p where p.user_id = any(v_users)),
    'reminders', (select coalesce(jsonb_agg(jsonb_build_object(
        'sent_at', r.sent_at, 'delivered', r.delivered, 'recipient_name', r.recipient_name) order by r.sent_at), '[]')
      from draft_reminders r where r.user_id = any(v_users)),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', a.at, 'action', a.action, 'details', a.details, 'invitation_id', a.invitation_id) order by a.at), '[]')
      from admin_actions a where a.user_id = any(v_users))
  );
end;
$$;
revoke all on function public.admin_visitor_journey(uuid, uuid) from public, anon;
grant execute on function public.admin_visitor_journey(uuid, uuid) to authenticated;

-- ── Приглашение: всё о нём ────────────────────────────────────────────
create or replace function public.admin_invitation_detail(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when public.is_admin_caller() then jsonb_build_object(
    'invitation', to_jsonb(i) - 'pin_code',
    'owner', jsonb_build_object('id', u.id, 'email', u.email,
      'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      'has_bot', pr.telegram_chat_id is not null),
    'content', (select to_jsonb(c) from invitation_content c where c.invitation_id = i.id),
    'steps', (select coalesce(jsonb_agg(jsonb_build_object('type', s.step_type, 'order', s.step_order,
        'enabled', s.enabled, 'config', s.configuration_json) order by s.step_order), '[]')
      from invitation_steps s where s.invitation_id = i.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'created_at', p.created_at,
        'status', p.status, 'amount', p.amount, 'method', p.method, 'promo_code', p.promo_code) order by p.created_at), '[]')
      from payments p where p.invitation_id = i.id),
    'responses', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]')
      from responses r where r.invitation_id = i.id),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'details', a.details) order by a.at), '[]')
      from admin_actions a where a.invitation_id = i.id)
  ) end
  from invitations i
  left join auth.users u on u.id = i.user_id
  left join profiles pr on pr.id = i.user_id
  where i.id = p_id;
$$;
revoke all on function public.admin_invitation_detail(uuid) from public, anon;
grant execute on function public.admin_invitation_detail(uuid) to authenticated;

-- Действия ниже меняют то, что для обычных пользователей закрыто триггером
-- guard_invitation_writes (он пропускает только service role). Внутри
-- проверенной админ-функции на время транзакции выставляем роль service_role.
create or replace function public.admin_invitation_action(p_id uuid, p_action text, p_days integer default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inv invitations%rowtype;
begin
  if not public.is_admin_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from invitations where id = p_id;
  if not found then raise exception 'not found'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if p_action = 'publish_free' then
    if v_inv.status <> 'draft' then raise exception 'приглашение уже не черновик'; end if;
    update invitations set status = 'published' where id = p_id;
  elsif p_action = 'extend' then
    if coalesce(p_days, 0) not between 1 and 365 then raise exception 'неверный срок'; end if;
    update invitations
       set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(days => p_days),
           expiry_reminded_at = null,
           status = case when status = 'expired' then 'published' else status end
     where id = p_id;
  elsif p_action = 'unpublish' then
    update invitations set status = 'archived' where id = p_id and status in ('published', 'expired');
  elsif p_action = 'restore' then
    update invitations set status = 'published' where id = p_id and status = 'archived';
  else
    raise exception 'unknown action';
  end if;

  insert into admin_actions (admin_id, action, invitation_id, user_id, details)
  values (auth.uid(), p_action, p_id, v_inv.user_id,
          jsonb_strip_nulls(jsonb_build_object('days', p_days, 'note', p_note, 'from_status', v_inv.status)));
  return (select to_jsonb(i) - 'pin_code' from invitations i where i.id = p_id);
end;
$$;
revoke all on function public.admin_invitation_action(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_invitation_action(uuid, text, integer, text) to authenticated;

-- Отметить возврат денег (сам возврат делается в кабинете Click).
-- Комиссия партнёра отменится триггером payments_handle_commission.
create or replace function public.admin_refund_payment(p_payment uuid, p_unpublish boolean default false, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pay payments%rowtype;
begin
  if not public.is_admin_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_pay from payments where id = p_payment;
  if not found or v_pay.status <> 'paid' then raise exception 'можно вернуть только оплаченный платёж'; end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update payments set status = 'refunded' where id = p_payment;
  if p_unpublish then
    update invitations set status = 'archived' where id = v_pay.invitation_id and status in ('published', 'expired');
  end if;
  insert into admin_actions (admin_id, action, invitation_id, user_id, details)
  values (auth.uid(), 'refund', v_pay.invitation_id, v_pay.user_id,
          jsonb_strip_nulls(jsonb_build_object('payment_id', p_payment, 'amount', v_pay.amount, 'unpublish', p_unpublish, 'note', p_note)));
end;
$$;
revoke all on function public.admin_refund_payment(uuid, boolean, text) from public, anon;
grant execute on function public.admin_refund_payment(uuid, boolean, text) to authenticated;

-- Написать автору в @sentiuz_bot
create or replace function public.admin_message_user(p_user uuid, p_text text, p_invitation uuid default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not public.is_admin_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_text)), 0) = 0 or length(p_text) > 3500 then raise exception 'пустое или слишком длинное сообщение'; end if;
  if not exists (select 1 from profiles where id = p_user and telegram_chat_id is not null) then
    return false;
  end if;
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('event', 'admin_message', 'extra', jsonb_build_object('user_id', p_user, 'text', p_text))
  );
  insert into admin_actions (admin_id, action, invitation_id, user_id, details)
  values (auth.uid(), 'message', p_invitation, p_user, jsonb_build_object('text', left(p_text, 500)));
  return true;
end;
$$;
revoke all on function public.admin_message_user(uuid, text, uuid) from public, anon;
grant execute on function public.admin_message_user(uuid, text, uuid) to authenticated;

-- ── Meta Marketing API: журнал синхронизаций ──────────────────────────
create table if not exists public.meta_sync_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  rows integer,
  spend_total integer,
  currency text,
  rate numeric,
  error text
);
alter table public.meta_sync_log enable row level security;

create or replace function public.request_meta_sync(p_days integer default 7)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Из pg_cron (роль postgres) или из админки
  if coalesce((select auth.role()), '') in ('anon', 'authenticated') and not public.is_admin_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('event', 'meta_sync', 'extra', jsonb_build_object('days', greatest(1, least(coalesce(p_days, 7), 90)))),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.request_meta_sync(integer) from public, anon;
grant execute on function public.request_meta_sync(integer) to authenticated;

-- ── Состояние системы ─────────────────────────────────────────────────
create or replace function public.admin_system_health()
returns jsonb
language sql stable security definer set search_path = public, cron
as $$
  select case when public.is_admin_caller() then jsonb_build_object(
    'cron', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_start', r.start_time, 'last_status', r.status, 'last_message', left(r.return_message, 200),
        'fails_7d', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '7 days'),
        'runs_7d', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '7 days')
      ) order by j.jobname), '[]')
      from cron.job j
      left join lateral (select * from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) r on true),
    'http_errors_24h', (select count(*) from net._http_response where created > now() - interval '24 hours' and (status_code >= 400 or error_msg is not null)),
    'http_last_errors', (select coalesce(jsonb_agg(x), '[]') from (
        select created as at, status_code, left(coalesce(error_msg, content::text), 160) as message
        from net._http_response where created > now() - interval '24 hours' and (status_code >= 400 or error_msg is not null)
        order by created desc limit 5) x),
    'publish_errors_7d', (select count(*) from analytics_events where event = 'publish_error' and occurred_at > now() - interval '7 days'),
    'payments_failed_7d', (select count(*) from payments where status = 'failed' and created_at > now() - interval '7 days'),
    'payments_pending_stale', (select count(*) from payments where status = 'pending' and created_at between now() - interval '7 days' and now() - interval '1 hour'),
    'last_paid_at', (select max(created_at) from payments where status = 'paid'),
    'last_event_at', (select max(occurred_at) from analytics_events),
    'reminders_failed_7d', (select count(*) from draft_reminders where delivered = false and sent_at > now() - interval '7 days'),
    'meta_last', (select to_jsonb(m) from meta_sync_log m order by at desc limit 1),
    'new_tickets_7d', (select count(*) from support_tickets where status = 'new' and created_at > now() - interval '7 days')
  ) end;
$$;
revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_system_health() to authenticated;
