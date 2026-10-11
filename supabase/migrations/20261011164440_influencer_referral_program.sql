-- Реферальная программа для инфлюенсеров.
--
-- Ключевая идея: фронт не участвует в начислении денег. Он только помечает,
-- по чьей ссылке пришёл человек (profiles.referred_by), а комиссию считает
-- триггер на payments, когда статус становится 'paid'. Поэтому вебхук Click
-- на Vercel трогать не нужно — он просто меняет статус, как и раньше.

-- ============ 1. Партнёры (инфлюенсеры) ============
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  code text not null unique check (code ~ '^[a-z0-9_-]{3,32}$'),
  name text not null,
  contact text,
  commission_percent numeric(5,2) not null default 20
    check (commission_percent >= 0 and commission_percent <= 100),
  payout_details text,
  hold_days integer not null default 7 check (hold_days >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- ============ 2. Клики по ссылке ============
create table if not exists public.referral_clicks (
  id bigserial primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  visitor_id uuid,
  user_agent text,
  referer text,
  landing_path text,
  created_at timestamptz not null default now()
);
create index if not exists referral_clicks_partner_created_idx
  on public.referral_clicks (partner_id, created_at desc);
create index if not exists referral_clicks_partner_visitor_idx
  on public.referral_clicks (partner_id, visitor_id);

-- ============ 3. Атрибуция ============
alter table public.profiles
  add column if not exists referred_by uuid references public.partners(id) on delete set null,
  add column if not exists referred_at timestamptz;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

alter table public.payments
  add column if not exists partner_id uuid references public.partners(id) on delete set null;
create index if not exists payments_partner_idx on public.payments (partner_id);

-- ============ 4. Начисления ============
create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  -- unique: одна оплата — максимум одно начисление, даже если вебхук Click
  -- придёт дважды (а он приходит дважды при ретраях).
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  order_amount integer not null,
  -- Процент фиксируется здесь, а не читается из partners при выплате:
  -- иначе смена процента задним числом пересчитала бы всю историю.
  commission_percent numeric(5,2) not null,
  commission_amount integer not null,
  currency text not null default 'UZS',
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  -- Холд: защита от возвратов. Отдельного крона нет — «доступно к выплате»
  -- вычисляется как pending с available_at <= now().
  available_at timestamptz not null default now(),
  paid_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists partner_commissions_partner_idx
  on public.partner_commissions (partner_id, status, created_at desc);

-- ============ 5. Снимок партнёра в момент создания платежа ============
create or replace function public.payments_attach_partner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.partner_id is null then
    select pr.referred_by into new.partner_id from public.profiles pr where pr.id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_payments_attach_partner on public.payments;
create trigger trg_payments_attach_partner
  before insert on public.payments
  for each row execute function public.payments_attach_partner();

-- ============ 6. Начисление / отмена комиссии ============
create or replace function public.payments_handle_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_partner_id uuid;
  v_percent numeric(5,2);
  v_hold integer;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    v_partner_id := new.partner_id;
    if v_partner_id is null then
      select pr.referred_by into v_partner_id from public.profiles pr where pr.id = new.user_id;
    end if;
    if v_partner_id is null then return new; end if;

    -- партнёр не получает комиссию за собственную покупку
    if exists (select 1 from public.partners p
               where p.id = v_partner_id and p.user_id = new.user_id) then
      return new;
    end if;

    select p.commission_percent, p.hold_days into v_percent, v_hold
      from public.partners p where p.id = v_partner_id and p.is_active;
    if v_percent is null then return new; end if;

    insert into public.partner_commissions
      (partner_id, payment_id, order_amount, commission_percent,
       commission_amount, currency, status, available_at)
    values
      (v_partner_id, new.id, new.amount, v_percent,
       round(new.amount * v_percent / 100.0), new.currency, 'pending',
       now() + make_interval(days => v_hold))
    on conflict (payment_id) do nothing;

  elsif new.status in ('refunded','failed') and old.status is distinct from new.status then
    update public.partner_commissions
       set status = 'cancelled',
           note = coalesce(note || ' | ', '') || 'auto: payment ' || new.status
     where payment_id = new.id and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists trg_payments_handle_commission on public.payments;
create trigger trg_payments_handle_commission
  after update of status on public.payments
  for each row execute function public.payments_handle_commission();

-- ============ 7. RPC: трекинг клика (доступен анониму) ============
-- Через RPC, а не прямым insert'ом: иначе пришлось бы открыть anon'у запись
-- в referral_clicks, и таблицу можно было бы засыпать мусором напрямую.
create or replace function public.track_referral_click(
  p_code text,
  p_visitor_id uuid default null,
  p_user_agent text default null,
  p_referer text default null,
  p_landing_path text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  select id into v_partner from public.partners
   where code = lower(p_code) and is_active;
  if v_partner is null then return false; end if;

  insert into public.referral_clicks (partner_id, visitor_id, user_agent, referer, landing_path)
  values (v_partner, p_visitor_id, left(p_user_agent, 400), left(p_referer, 500), left(p_landing_path, 300));
  return true;
end $$;

-- ============ 8. RPC: привязать юзера к партнёру (один раз) ============
create or replace function public.attach_referral(p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_partner uuid;
begin
  if auth.uid() is null then return false; end if;
  select id into v_partner from public.partners where code = lower(p_code) and is_active;
  if v_partner is null then return false; end if;

  update public.profiles
     set referred_by = v_partner, referred_at = now()
   where id = auth.uid()
     and referred_by is null
     and not exists (select 1 from public.partners p where p.id = v_partner and p.user_id = auth.uid());
  return found;
end $$;

-- ============ 9. RPC: статистика для панели партнёра ============
create or replace function public.partner_stats()
returns table (
  code text,
  commission_percent numeric,
  clicks bigint,
  unique_visitors bigint,
  signups bigint,
  paid_orders bigint,
  earned_total bigint,
  on_hold bigint,
  available bigint,
  paid_out bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.code,
    p.commission_percent,
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
      where pc.partner_id = p.id and pc.status = 'paid'), 0)
  from public.partners p
  where p.user_id = auth.uid();
$$;

-- ============ 10. RLS ============
alter table public.partners enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.partner_commissions enable row level security;

drop policy if exists partners_self_read on public.partners;
create policy partners_self_read on public.partners
  for select to authenticated using (user_id = auth.uid());

drop policy if exists partners_admin_all on public.partners;
create policy partners_admin_all on public.partners
  for all to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin))
  with check (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin));

drop policy if exists clicks_self_read on public.referral_clicks;
create policy clicks_self_read on public.referral_clicks
  for select to authenticated using (
    exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid())
  );

drop policy if exists clicks_admin_read on public.referral_clicks;
create policy clicks_admin_read on public.referral_clicks
  for select to authenticated using (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin)
  );

drop policy if exists commissions_self_read on public.partner_commissions;
create policy commissions_self_read on public.partner_commissions
  for select to authenticated using (
    exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid())
  );

drop policy if exists commissions_admin_all on public.partner_commissions;
create policy commissions_admin_all on public.partner_commissions
  for all to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin))
  with check (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin));

-- ============ 11. Гранты ============
revoke all on function public.track_referral_click(text, uuid, text, text, text) from public;
grant execute on function public.track_referral_click(text, uuid, text, text, text) to anon, authenticated;
revoke all on function public.attach_referral(text) from public;
grant execute on function public.attach_referral(text) to authenticated;
revoke all on function public.partner_stats() from public;
grant execute on function public.partner_stats() to authenticated;
