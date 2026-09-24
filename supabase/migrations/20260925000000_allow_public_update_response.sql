-- responses.invitation_id уникален, и клиент теперь делает upsert (а не
-- insert) на finalize, чтобы повторная отправка (получатель вернулся по
-- той же ссылке) не падала с конфликтом. Insert-политика уже разрешала
-- анониму создавать ответ для опубликованного приглашения — добавляем
-- симметричную update-политику, иначе upsert падает при существующей строке.
create policy "public update response for published invitation" on responses
  for update
  using (exists (select 1 from invitations i where i.id = responses.invitation_id and i.status = 'published'))
  with check (exists (select 1 from invitations i where i.id = responses.invitation_id and i.status = 'published'));
