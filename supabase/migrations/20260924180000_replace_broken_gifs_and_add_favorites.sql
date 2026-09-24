-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- Первый посев (seed_gif_library) взял 6 ссылок на Giphy из старого
-- захардкоженного массива в StepQuestion.jsx — при проверке все 6 оказались
-- битыми или ведущими не туда (Giphy успел перевыпустить/удалить эти ID).
-- Удаляем их и заменяем рабочими анимациями.
delete from media_library where type = 'gif' and url like '%giphy.com%';

insert into media_library (type, category, url, title, active) values
  ('gif', 'romantic', 'https://media.tenor.com/hThgRyZEYs8AAAAM/thank-you-nice.gif', '💗 Сердце из сердец', true),
  ('gif', 'romantic', 'https://media.tenor.com/Ljps64YOFKYAAAAM/love-you.gif', '🦋 Люблю тебя', true),
  ('gif', 'cute', 'https://media.tenor.com/miqvIBh1hhEAAAAM/flowers-bloom.gif', '🌸 Цветущее дерево', true),
  ('gif', 'cute', 'https://media.tenor.com/f5BOUBwUE7sAAAAM/little-flowers.gif', '🌼 Цветочки', true),
  ('gif', 'flirty', 'https://media.tenor.com/ejIB7ZbjzFUAAAAM/animation-stars.gif', '✨ Звёздный салют', true),
  ('gif', 'bold', 'https://media.tenor.com/CvfbXUbmOUIAAAAM/arien.gif', '🎉 Кот и конфетти', true),
  ('gif', 'bold', 'https://media.tenor.com/STaQLoMJvwMAAAAM/party-horn-blow-horn.gif', '📯 Кот с дудкой', true);

-- Из личного избранного пользователя на gifs.ru: котики/собачки-реакции —
-- отлично ложатся в категории "funny"/"cute". Кину Ривз и клип с миньонами
-- намеренно не включены (узнаваемые копирайтные персонажи/актёр — риск для
-- коммерческого продукта).
insert into media_library (type, category, url, title, active) values
  ('gif', 'funny', 'https://media.gifs.ru/bd78647ac5911bbedb716e79059914b379206eef_300.webp', '👋 Пока-пока', true),
  ('gif', 'funny', 'https://media.gifs.ru/8c1103baee4be9d06a5a3dcc8867f4c12a4f856455b13458b5872b862dd79ac5_300.webp', '😳 В шоке', true),
  ('gif', 'funny', 'https://media.gifs.ru/244e7f400c1916b6acf8b909d3f3c863e7156a58_300.webp', '😻 Вау, котик', true),
  ('gif', 'cute', 'https://media.gifs.ru/6d06d7f94f26a1b98ec6434c9e773f0a32f99ce1_300.webp', '🐶 Милый пёс', true),
  ('gif', 'funny', 'https://media.gifs.ru/ccd3719c7af8d0236378fa08b2b7083b7edd9e3c_300.webp', '😮 Ого!', true),
  ('gif', 'cute', 'https://media.gifs.ru/e4d396f880ca45e3ea105a2cf17d374fc3b3e933_300.webp', '🐕 Милота', true),
  ('gif', 'funny', 'https://media.gifs.ru/f1587b6e558e851dab2f7bc7e5e4bb7ceb7266d1_300.webp', '🙌 Дай пять', true),
  ('gif', 'funny', 'https://media.gifs.ru/af88024aba7512211a910cd9f3d4216d9b67cd3c_300.webp', '💃 Танцующий кот', true),
  ('gif', 'funny', 'https://media.gifs.ru/51573539ab70655e57ec055746daeb1ceffe027d_300.webp', '🤓 Умный кот', true),
  ('gif', 'funny', 'https://media.gifs.ru/3061a3d9afd788c743f7ea242af60e82b519fc63cf99e2b17b023cd04f8467a1_300.webp', '😼 Кот-бандит', true),
  ('gif', 'cute', 'https://media.gifs.ru/3671d835594acd8cbe836933cf33afb65420cf76_300.webp', '😊 Довольный кот', true);
