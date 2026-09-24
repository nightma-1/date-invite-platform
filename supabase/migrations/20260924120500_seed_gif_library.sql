-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- Стартовый набор гифок для экрана вопроса — раньше жил захардкоженным
-- массивом в StepQuestion.jsx, теперь это данные, которые видно и можно
-- пополнять из админ-панели. Категории совпадают с MOODS в registry.js,
-- чтобы фильтр по настроению работал единообразно.
insert into media_library (type, category, url, title, active) values
  ('gif', 'romantic', 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif', '💕 Романтик', true),
  ('gif', 'romantic', 'https://media.giphy.com/media/xT9IgDeNrJB2yUUEeQ/giphy.gif', '🌹 Цветы', true),
  ('gif', 'cute',     'https://media.giphy.com/media/l41YtZOb9EUABnuqA/giphy.gif', '🥰 Сердечки', true),
  ('gif', 'bold',      'https://media.giphy.com/media/3o6Zt8A3kNKnCnWp9m/giphy.gif', '🎉 Праздник', true),
  ('gif', 'flirty',   'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', '✨ Магия', true),
  ('gif', 'flirty',   'https://media.giphy.com/media/3oEjHB1EKuujDjYoRi/giphy.gif', '🌙 Ночь', true)
on conflict do nothing;
