-- © 2026 Senti. Все права защищены.
--
-- Полные списки приглашений и платежей для админки (/xujayin/invitations,
-- /xujayin/payments). RLS показывает человеку только его собственные
-- черновики и платежи, поэтому админу нужны отдельные функции с проверкой
-- is_admin внутри. Отдают последние 1000 строк — сортировка и фильтры на
-- клиенте, при нынешних объёмах этого хватает с запасом.

create or replace function public.admin_invitations()
returns table (
  id uuid,
  slug text,
  kind text,
  status text,
  recipient_name text,
  template_key text,
  created_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  owner_email text,
  owner_telegram text,
  owner_is_admin boolean,
  views bigint,
  viewers bigint,
  answered boolean,
  answered_yes boolean,
  paid_amount bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.slug, i.kind, i.status, i.recipient_name, i.template_key,
    i.created_at, i.published_at, i.expires_at,
    u.email::text,
    pr.telegram_username,
    coalesce(pr.is_admin, false),
    (select count(*) from analytics_events e where e.invitation_slug = i.slug and e.event = 'invite_view'),
    (select count(distinct e.visitor_id) from analytics_events e where e.invitation_slug = i.slug and e.event = 'invite_view'),
    exists (select 1 from responses r where r.invitation_id = i.id),
    exists (select 1 from responses r where r.invitation_id = i.id and r.answered_yes),
    coalesce((select sum(p.amount) from payments p where p.invitation_id = i.id and p.status = 'paid'), 0)
  from invitations i
  left join profiles pr on pr.id = i.user_id
  left join auth.users u on u.id = i.user_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by i.created_at desc
  limit 1000;
$$;

revoke execute on function public.admin_invitations() from public, anon;
grant execute on function public.admin_invitations() to authenticated;

create or replace function public.admin_payments()
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  method text,
  provider text,
  amount integer,
  transaction_id text,
  click_prepare_id bigint,
  invitation_id uuid,
  slug text,
  recipient_name text,
  invitation_status text,
  invitation_kind text,
  owner_email text,
  owner_is_admin boolean,
  partner_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.created_at, p.status, p.method, p.provider, p.amount,
    p.transaction_id, p.click_prepare_id,
    p.invitation_id, i.slug, i.recipient_name, i.status, i.kind,
    u.email::text,
    coalesce(pr.is_admin, false),
    pa.code
  from payments p
  left join invitations i on i.id = p.invitation_id
  left join profiles pr on pr.id = p.user_id
  left join auth.users u on u.id = p.user_id
  left join partners pa on pa.id = p.partner_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by p.created_at desc
  limit 1000;
$$;

revoke execute on function public.admin_payments() from public, anon;
grant execute on function public.admin_payments() to authenticated;
