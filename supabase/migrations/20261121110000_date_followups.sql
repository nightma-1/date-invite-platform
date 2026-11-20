-- © 2026 Senti. Все права защищены.
--
-- «Как прошло свидание?» — бот спрашивает автора на следующий день после
-- даты, которую выбрала получательница. Три шага в Telegram:
--   1. оценка кнопками: 😍 отлично / 🙂 нормально / 😕 не сложилось;
--   2. если «отлично» — можно ли показать приглашение в соцсетях Senti
--      (без имён, и только если ОБА участника не против);
--   3. пара слов о свидании — отзыв ответом на сообщение.
-- Ответы лежат в date_feedback, копия каждого ответа уходит админам.
-- Читают таблицу только service role (вебхук бота) и admin_* функция ниже.

alter table public.invitations add column if not exists followup_sent_at timestamptz;

create table if not exists public.date_feedback (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  user_id uuid,
  chat_id bigint,
  lang text not null default 'ru',
  asked_at timestamptz not null default now(),
  rating text check (rating in ('great', 'ok', 'bad')),
  consent text check (consent in ('yes', 'no')),
  review text check (review is null or length(review) <= 1000),
  awaiting_review boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.date_feedback enable row level security;
create index if not exists date_feedback_chat_idx on public.date_feedback (chat_id, updated_at desc);

insert into public.app_secrets(key, value) values ('date_followups', 'on')
on conflict (key) do nothing;

create or replace function public.send_date_followups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  r record;
  n integer := 0;
begin
  if coalesce((select value from app_secrets where key = 'date_followups'), 'on') <> 'on' then
    return 0;
  end if;
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  for r in
    select i.id, i.user_id, p.telegram_chat_id,
      coalesce((select s.configuration_json->>'lang' from invitation_steps s
        where s.invitation_id = i.id and s.step_type = 'question' limit 1), 'ru') as lang
    from invitations i
    join profiles p on p.id = i.user_id
    join lateral (
      select resp.answered_yes, resp.selected_date, resp.created_at
      from responses resp where resp.invitation_id = i.id
      order by resp.created_at desc limit 1
    ) last_resp on true
    where coalesce(i.kind, 'invite') = 'invite'
      and i.followup_sent_at is null
      and last_resp.answered_yes
      and p.telegram_chat_id is not null
      and not coalesce(p.is_admin, false)
      -- день после свидания; если дату не выбирали — через два дня после ответа
      and coalesce(last_resp.selected_date, (last_resp.created_at at time zone 'Asia/Tashkent')::date + 1)
          between v_today - 3 and v_today - 1
      -- не чаще одного вопроса в неделю одному человеку
      and not exists (
        select 1 from invitations j
        where j.user_id = i.user_id and j.followup_sent_at > now() - interval '7 days'
      )
    limit 200
  loop
    update invitations set followup_sent_at = now() where id = r.id;
    insert into date_feedback (invitation_id, user_id, chat_id, lang)
    values (r.id, r.user_id, r.telegram_chat_id, r.lang)
    on conflict (invitation_id) do nothing;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
      body := jsonb_build_object('event', 'date_followup', 'invitation_id', r.id, 'extra', jsonb_build_object('lang', r.lang))
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.send_date_followups() from public, anon, authenticated;

-- 14:20 по Ташкенту — днём, не утром и не ночью
select cron.schedule('date-followups', '20 9 * * *', 'select public.send_date_followups()');

-- Для админки: все ответы, свежие сверху
create or replace function public.admin_date_feedback()
returns table (
  invitation_id uuid, slug text, recipient_name text, owner text, lang text,
  asked_at timestamptz, rating text, consent text, review text, updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select f.invitation_id, i.slug, i.recipient_name,
    coalesce(u.email::text, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', left(f.user_id::text, 8)),
    f.lang, f.asked_at, f.rating, f.consent, f.review, f.updated_at
  from date_feedback f
  left join invitations i on i.id = f.invitation_id
  left join auth.users u on u.id = f.user_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by f.updated_at desc
  limit 1000;
$$;
revoke all on function public.admin_date_feedback() from public, anon;
grant execute on function public.admin_date_feedback() to authenticated;
