-- © 2026 Senti. Все права защищены.
--
-- Техподдержка. Две таблицы, обе — только для сервера (service_role):
--
-- 1. support_tickets — обращения с формы на сайте. Нужны, чтобы обращение не
--    потерялось, если Telegram в этот момент недоступен, и чтобы человеку
--    можно было назвать номер обращения.
-- 2. support_threads — связка «сообщение в группе поддержки → чат автора».
--    Бот поддержки пересылает входящие в рабочую группу; когда кто-то из
--    команды отвечает реплаем на такое сообщение, вебхук по message_id
--    находит, кому отправить ответ. Без этой таблицы ответ отправить некуда:
--    в reply_to_message лежит сообщение, отправленное самим ботом.
--
-- RLS включён и политик НЕТ сознательно: ни anon, ни authenticated не должны
-- видеть чужие обращения. Пишет и читает только service_role, который RLS
-- обходит (api/support/*).

-- ------------------------------------------------------------ обращения
create table if not exists support_tickets (
  id              uuid primary key default gen_random_uuid(),
  -- Короткий человекочитаемый номер: его показываем в интерфейсе и в Telegram.
  ticket_no       bigint generated always as identity,
  -- Автор, если он был авторизован. on delete set null — удаление аккаунта
  -- не должно ронять историю поддержки.
  user_id         uuid references auth.users(id) on delete set null,
  email           text,
  -- Как с человеком связаться, если он писал не из кабинета (telegram/телефон).
  contact         text,
  topic           text,
  message         text not null,
  -- Со страницы какой именно страницы написали — половина обращений
  -- диагностируется уже по этому полю.
  page_url        text,
  locale          text,
  user_agent      text,
  -- id карточки обращения в рабочей группе: по нему /start с кодом обращения
  -- привязывает Telegram автора к этой карточке, чтобы ответ реплаем дошёл.
  support_message_id bigint,
  status          text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at      timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx on support_tickets (created_at desc);
create index if not exists support_tickets_user_id_idx on support_tickets (user_id);
create unique index if not exists support_tickets_ticket_no_idx on support_tickets (ticket_no);

alter table support_tickets enable row level security;
revoke all on support_tickets from anon, authenticated;

-- ------------------------------------------------- связка «ответ → автор»
create table if not exists support_threads (
  -- Чат рабочей группы и id сообщения в ней. message_id уникален в пределах
  -- чата, поэтому ключ составной.
  support_chat_id     bigint not null,
  support_message_id  bigint not null,
  -- Куда слать ответ команды.
  user_chat_id        bigint not null,
  user_id             uuid references auth.users(id) on delete set null,
  ticket_id           uuid references support_tickets(id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (support_chat_id, support_message_id)
);

create index if not exists support_threads_created_at_idx on support_threads (created_at desc);

alter table support_threads enable row level security;
revoke all on support_threads from anon, authenticated;

-- ------------------------------------------------------------- уборка
-- Связки нужны ровно столько, сколько живёт переписка. Чистим раз в сутки,
-- чтобы таблица не росла бесконечно — тем же планировщиком, что и
-- expire_old_invitations.
create or replace function prune_support_threads()
returns void as $$
begin
  delete from support_threads where created_at < now() - interval '90 days';
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function prune_support_threads() from public;
revoke execute on function prune_support_threads() from anon, authenticated;

select cron.schedule('prune-support-threads-daily', '20 4 * * *',
  $$select public.prune_support_threads()$$);
