-- Админские операции по реферальной программе. Все три функции сами
-- проверяют is_admin внутри: полагаться на то, что клиент не вызовет их
-- напрямую, нельзя.

-- Сводка по всем партнёрам. Агрегируем в базе, а не на клиенте: кликов со
-- временем станет много, тянуть их все в браузер незачем.
create or replace function public.admin_partner_overview()
returns table (
  id uuid,
  code text,
  name text,
  contact text,
  commission_percent numeric,
  hold_days integer,
  payout_details text,
  is_active boolean,
  linked boolean,
  clicks bigint,
  unique_visitors bigint,
  signups bigint,
  paid_orders bigint,
  earned_total bigint,
  on_hold bigint,
  available bigint,
  paid_out bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.code, p.name, p.contact, p.commission_percent, p.hold_days,
    p.payout_details, p.is_active, (p.user_id is not null),
    (select count(*) from public.referral_clicks c where c.partner_id = p.id),
    (select count(distinct c.visitor_id) from public.referral_clicks c
      where c.partner_id = p.id and c.visitor_id is not null),
    (select count(*) from public.profiles pr where pr.referred_by = p.id),
    (select count(*) from public.partner_commissions pc
      where pc.partner_id = p.id and pc.status <> 'cancelled'),
    coalesce((select sum(pc.commission_amount) from public.partner_commissions pc
      where pc.partner_id = p.id and pc.status <> 'cancelled'), 0),
    coalesce((select sum(pc.commission_amount) from public.partner_commissions pc
      where pc.partner_id = p.id and pc.status = 'pending' and pc.available_at > now()), 0),
    coalesce((select sum(pc.commission_amount) from public.partner_commissions pc
      where pc.partner_id = p.id and pc.status = 'pending' and pc.available_at <= now()), 0),
    coalesce((select sum(pc.commission_amount) from public.partner_commissions pc
      where pc.partner_id = p.id and pc.status = 'paid'), 0),
    p.created_at
  from public.partners p
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  order by p.created_at desc;
$$;

-- Привязка партнёра к аккаунту по email. auth.users недоступна клиенту,
-- поэтому поиск делаем здесь, под security definer и с проверкой админа.
create or replace function public.admin_link_partner(p_code text, p_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_partner uuid;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
    return 'forbidden';
  end if;

  select id into v_partner from public.partners where code = lower(p_code);
  if v_partner is null then return 'no_partner'; end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then return 'no_user'; end if;

  if exists (select 1 from public.partners p where p.user_id = v_user and p.id <> v_partner) then
    return 'user_taken';
  end if;

  update public.partners set user_id = v_user where id = v_partner;
  return 'ok';
end $$;

-- Отметить доступные начисления партнёра выплаченными (деньги переводятся
-- вручную; база только фиксирует факт). Возвращает закрытую выплатой сумму.
create or replace function public.admin_mark_paid(p_partner_id uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_sum bigint;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
    return -1;
  end if;

  with upd as (
    update public.partner_commissions
       set status = 'paid', paid_at = now()
     where partner_id = p_partner_id
       and status = 'pending'
       and available_at <= now()
    returning commission_amount
  )
  select coalesce(sum(commission_amount), 0) into v_sum from upd;

  return v_sum;
end $$;

revoke all on function public.admin_partner_overview() from public, anon;
grant execute on function public.admin_partner_overview() to authenticated;
revoke all on function public.admin_link_partner(text, text) from public, anon;
grant execute on function public.admin_link_partner(text, text) to authenticated;
revoke all on function public.admin_mark_paid(uuid) from public, anon;
grant execute on function public.admin_mark_paid(uuid) to authenticated;
