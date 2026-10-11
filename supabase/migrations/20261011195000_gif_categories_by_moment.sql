-- Категории гифок переходят с оси "настроение" на ось "момент приглашения":
-- пикер показывается внутри конкретного шага, и пользователь думает не
-- "хочу милое", а "хочу картинку под вопрос". Плюс одна запасная категория
-- для смешного вне момента — вместо бесполезной свалки "Другое".
insert into gif_categories (slug, label_ru, label_en, label_uz, position) values
  ('invite',  '💌 Приглашаю',      '💌 Inviting',     '💌 Taklif qilaman',    10),
  ('beg',     '🥹 Умоляю',         '🥹 Pretty please','🥹 Iltimos',           20),
  ('yes',     '🎉 Ура, да!',       '🎉 Yes!',         '🎉 Ura, ha!',          30),
  ('meeting', '🗓️ Про встречу',    '🗓️ The date',     '🗓️ Uchrashuv',         40),
  ('funny',   '😂 Просто смешное', '😂 Just funny',   '😂 Shunchaki kulgili', 50)
on conflict (slug) do update
  set label_ru = excluded.label_ru,
      label_en = excluded.label_en,
      label_uz = excluded.label_uz,
      position = excluded.position;

-- "Ура, да!" вместо "Она сказала да": приглашения шлют и парням,
-- у получателя в базе есть пол — гендерное название подошло бы не всем.

-- Романтика и флирт — это приглашение, милое — уговоры, смешное остаётся
-- на месте под новым названием. "Ура, да!" и "Про встречу" наполняются
-- вручную из админки.
update media_library set category = 'invite' where category in ('romantic', 'flirty');
update media_library set category = 'beg'    where category = 'cute';

-- Старые категории удаляем только после переезда гифок.
delete from gif_categories where slug in ('romantic', 'flirty', 'cute', 'bold', 'custom');
