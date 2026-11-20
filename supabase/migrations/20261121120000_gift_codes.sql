-- © 2026 Senti. Все права защищены.
--
-- Подарочный код «купи другу»: человек платит за одно приглашение через
-- Click и получает код GIFT-XXXXXX + ссылку senti.uz/builder?promo=GIFT-…
-- Друг собирает приглашение, код уже подставлен — публикация бесплатно.
--
-- Жизненный цикл: pending (создан, ждём Click) → active (оплачен) →
-- redeemed (использован, ровно один раз). Оплата подарка — обычная строка
-- в payments с purpose = 'gift' и gift_id вместо invitation_id; Click
-- присылает id подарка в merchant_trans_id (см. api/click/webhook.js).
-- Погашение — строка в payments на 0 сум с promo_code = код подарка.

create table if not exists public.gift_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^GIFT-[A-Z0-9]{6}$'),
  buyer_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'redeemed')),
  amount integer not null,
  paid_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_invitation_id uuid references public.invitations(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gift_codes enable row level security;
drop policy if exists "buyer reads own gifts" on public.gift_codes;
create policy "buyer reads own gifts" on public.gift_codes for select to authenticated
  using (buyer_id = (select auth.uid()));
create index if not exists gift_codes_buyer_idx on public.gift_codes (buyer_id, created_at desc);

alter table public.payments alter column invitation_id drop not null;
alter table public.payments add column if not exists gift_id uuid references public.gift_codes(id) on delete set null;
create index if not exists payments_gift_id_idx on public.payments (gift_id);
alter table public.payments drop constraint if exists payments_purpose_check;
alter table public.payments add constraint payments_purpose_check
  check (purpose in ('publish', 'extend', 'gift'));
alter table public.payments drop constraint if exists payments_target_check;
alter table public.payments add constraint payments_target_check
  check (invitation_id is not null or gift_id is not null);

-- Проверка кода в конструкторе: подарочный код = скидка 100%, пока не использован
create or replace function public.check_promo_code(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('code', g.code, 'discount_percent', 100, 'gift', true)
       from gift_codes g where g.code = upper(trim(p_code)) and g.status = 'active'),
    (select jsonb_build_object('code', pc.code, 'discount_percent', pc.discount_percent)
       from promo_codes pc
      where pc.code = upper(trim(p_code)) and pc.is_active
        and (pc.expires_at is null or pc.expires_at > now())
        and (pc.max_uses is null or (select count(*) from payments p where p.promo_code = pc.code and p.status = 'paid') < pc.max_uses))
  );
$$;
revoke all on function public.check_promo_code(text) from public;
grant execute on function public.check_promo_code(text) to anon, authenticated;

-- Для админки: все подарки
create or replace function public.admin_gift_codes()
returns table (id uuid, code text, status text, amount integer, buyer text, paid_at timestamptz,
  redeemed_at timestamptz, redeemed_slug text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select g.id, g.code, g.status, g.amount,
    coalesce(u.email::text, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', left(g.buyer_id::text, 8)),
    g.paid_at, g.redeemed_at, i.slug, g.created_at
  from gift_codes g
  left join auth.users u on u.id = g.buyer_id
  left join invitations i on i.id = g.redeemed_invitation_id
  where public.is_admin_caller()
  order by g.created_at desc
  limit 1000;
$$;
revoke all on function public.admin_gift_codes() from public, anon;
grant execute on function public.admin_gift_codes() to authenticated;
