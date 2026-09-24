-- Клиент теперь делает upsert на responses (см. миграцию
-- allow_public_update_response), а старый триггер уведомления в Telegram
-- висел только на AFTER INSERT — из-за этого повторная отправка ответа
-- (получатель прошёл шаги ещё раз по той же ссылке) обновляла строку, но
-- уведомление в бот не приходило. Добавляем такой же триггер на UPDATE,
-- срабатывающий только когда реально поменялся сам ответ.
create trigger trg_response_updated_notify
  after update on responses
  for each row
  when (
    old.answered_yes is distinct from new.answered_yes
    or old.selected_date is distinct from new.selected_date
    or old.selected_time is distinct from new.selected_time
    or old.selections is distinct from new.selections
  )
  execute function trg_notify_response_created();
