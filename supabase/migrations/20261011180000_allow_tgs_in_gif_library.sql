-- Разрешаем загружать .tgs (анимированные стикеры Telegram) в библиотеку гифок.
-- .tgs — это gzip-нутый Lottie-JSON; браузер отдаёт его с пустым типом, клиент
-- проставляет contentType = application/gzip (см. src/lib/mediaLibrary.js).
-- application/x-tgsticker добавлен на случай источников, которые ставят его сами.
--
-- Пишем через append недостающих типов, а не через присваивание списка:
-- реальный allowed_mime_types бакета уже расходился с первой миграцией
-- (webm/mp4 и лимит 20 МБ добавляли руками), и перезапись их бы снесла.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(allowed_mime_types || array['application/gzip', 'application/x-tgsticker']) as mime
)
where id = 'gif-library';
