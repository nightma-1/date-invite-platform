-- Уведомление в Telegram об ответе показывало только да/нет + дату/время,
-- но не выбор "куда пойти"/"что поесть" — добавляем selections в payload,
-- а форматирование текста (декодинг id опций в иконка+название) уже
-- делается на стороне api/telegram/notify.js (там же, где есть доступ к
-- invitation_steps.configuration_json.options).

create or replace function trg_notify_response_created()
returns trigger as $$
begin
  perform notify_telegram(new.invitation_id, 'answered', jsonb_build_object(
    'answered_yes', new.answered_yes,
    'selected_date', new.selected_date,
    'selected_time', new.selected_time,
    'selections', new.selections
  ));
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;
