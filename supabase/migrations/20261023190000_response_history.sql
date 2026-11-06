-- © 2026 Senti. Все права защищены.
--
-- История ответов. В responses хранится только последний ответ (на нём
-- строится кабинет и бот), а сюда пишется КАЖДЫЙ ответ отдельной строкой:
-- ответ 1, ответ 2, ответ 3… Автор видит, как менялся выбор.
--
-- Пишет триггер на responses — неважно, каким путём пришёл ответ.
-- Читать может только автор приглашения, писать напрямую — никто.

create table if not exists response_history (
  id            bigserial primary key,
  invitation_id uuid not null references invitations(id) on delete cascade,
  answer_no     integer not null,
  answered_yes  boolean not null,
  selected_date date,
  selected_time time,
  selections    jsonb not null default '{}'::jsonb,
  no_attempts   smallint,
  created_at    timestamptz not null default now(),
  unique (invitation_id, answer_no)
);

create index if not exists response_history_invitation_idx
  on response_history (invitation_id, answer_no desc);

alter table response_history enable row level security;

revoke all on response_history from anon, authenticated;
revoke all on sequence response_history_id_seq from anon, authenticated;
grant select on response_history to authenticated;

drop policy if exists "owner read response history" on response_history;
create policy "owner read response history" on response_history
  for select to authenticated
  using (exists (
    select 1 from invitations i
     where i.id = response_history.invitation_id
       and i.user_id = (select auth.uid())
  ));

create or replace function trg_record_response_history()
returns trigger as $$
begin
  if tg_op = 'INSERT' or old.answer_count is distinct from new.answer_count then
    insert into response_history (
      invitation_id, answer_no, answered_yes, selected_date, selected_time, selections, no_attempts
    ) values (
      new.invitation_id, new.answer_count, new.answered_yes, new.selected_date,
      new.selected_time, new.selections, new.no_attempts
    )
    on conflict (invitation_id, answer_no) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function trg_record_response_history() from public, anon, authenticated;

drop trigger if exists trg_responses_history on responses;
create trigger trg_responses_history
  after insert or update on responses
  for each row execute function trg_record_response_history();

-- Уже сохранённые ответы — в историю под их текущим номером. Более ранние
-- повторные ответы до сегодняшнего дня не сохранялись, их не восстановить.
insert into response_history (
  invitation_id, answer_no, answered_yes, selected_date, selected_time, selections, no_attempts, created_at
)
select invitation_id, answer_count, answered_yes, selected_date, selected_time, selections, no_attempts,
       -- у responses нет даты обновления: для повторного ответа время неизвестно
       case when answer_count = 1 then created_at else now() end
  from responses
on conflict (invitation_id, answer_no) do nothing;
