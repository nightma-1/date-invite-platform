-- © 2026 Senti. Все права защищены.
--
-- Повторный ответ получателя не сохранялся.
--
-- Фронт делал insert, а при конфликте (ответ уже есть) — update по
-- invitation_id. Но у анонимного получателя нет права ЧИТАТЬ ответы
-- (и не должно быть — это чужие данные), а Postgres применяет к UPDATE с
-- WHERE ещё и политики чтения. Итог: update молча задевал ноль строк,
-- ошибки не было, получатель видел «Ответ отправлен», а в базе и у автора
-- в боте оставался самый первый ответ.
--
-- Теперь ответ сохраняется одной функцией submit_response(): она сама
-- создаёт или обновляет строку, проверяет, что приглашение опубликовано
-- и не истекло, и ограничивает размеры входных данных. Счётчик
-- answer_count говорит боту, что это ответ «ещё раз».

alter table responses add column if not exists answer_count integer not null default 1;

create or replace function submit_response(
  p_slug          text,
  p_selected_date date default null,
  p_selected_time time default null,
  p_selections    jsonb default '{}'::jsonb,
  p_no_attempts   integer default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation_id uuid;
  v_selections jsonb := coalesce(p_selections, '{}'::jsonb);
begin
  select id into v_invitation_id
    from invitations
   where slug = p_slug
     and status = 'published'
     and (expires_at is null or expires_at > now());
  if v_invitation_id is null then
    return false;
  end if;

  if jsonb_typeof(v_selections) <> 'object' or pg_column_size(v_selections) > 4000 then
    v_selections := '{}'::jsonb;
  end if;

  insert into responses (invitation_id, answered_yes, selected_date, selected_time, selections, no_attempts)
  values (
    v_invitation_id, true, p_selected_date, p_selected_time, v_selections,
    least(greatest(coalesce(p_no_attempts, 0), 0), 999)
  )
  on conflict (invitation_id) do update
     set answered_yes  = excluded.answered_yes,
         selected_date = excluded.selected_date,
         selected_time = excluded.selected_time,
         selections    = excluded.selections,
         no_attempts   = excluded.no_attempts,
         answer_count  = responses.answer_count + 1;

  return true;
end;
$$;

revoke execute on function submit_response(text, date, time, jsonb, integer) from public;
grant execute on function submit_response(text, date, time, jsonb, integer) to anon, authenticated;

-- Уведомление на каждый повторный ответ, даже если выбор не поменялся:
-- автору важно знать, что к приглашению вернулись и ответили снова.
drop trigger if exists trg_response_updated_notify on responses;
create trigger trg_response_updated_notify
  after update on responses
  for each row
  when (old.answer_count is distinct from new.answer_count)
  execute function trg_notify_response_created();

create or replace function trg_notify_response_created()
returns trigger as $$
begin
  perform notify_telegram(new.invitation_id, 'answered', jsonb_build_object(
    'answered_yes', new.answered_yes,
    'selected_date', new.selected_date,
    'selected_time', new.selected_time,
    'selections', new.selections,
    'no_attempts', new.no_attempts,
    'answer_count', new.answer_count
  ));
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function trg_notify_response_created() from public, anon, authenticated;
