-- © 2026 Senti. Все права защищены.
--
-- Ответ получательницы на приглашение:
--   card   — «ответная открытка» сразу после её «Да»;
--   thanks — «спасибо за вечер», когда дата свидания прошла.
-- Ответ — обычное приглашение со ссылкой на исходное (reply_to). Скидку 50%
-- считает только сервер (api/click/create.js), здесь — данные и уведомление.
--
-- sender_name — необязательное имя автора («Твоё имя» в конструкторе): по нему
-- ответ сразу адресован ему, без ручного ввода.

alter table public.invitations add column if not exists sender_name text
  check (sender_name is null or length(sender_name) <= 40);
alter table public.invitations add column if not exists reply_to uuid
  references public.invitations(id) on delete set null;
alter table public.invitations add column if not exists reply_kind text
  check (reply_kind is null or reply_kind in ('card', 'thanks'));
create index if not exists invitations_reply_to_idx on public.invitations (reply_to) where reply_to is not null;

-- Что нужно конструктору ответа и странице получателя об исходном приглашении.
-- Наружу — только имя автора, шаблон, язык и прошла ли дата свидания.
create or replace function public.reply_context(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'invitation_id', i.id,
    'sender_name', i.sender_name,
    'template_key', i.template_key,
    'lang', (select s.configuration_json->>'lang' from invitation_steps s
             where s.invitation_id = i.id and s.step_type = 'question' limit 1),
    'answered_yes', coalesce(r.answered_yes, false),
    'date_passed', r.answered_yes and coalesce(r.selected_date, (r.created_at at time zone 'Asia/Tashkent')::date + 1)
                   < (now() at time zone 'Asia/Tashkent')::date
  )
  from invitations i
  left join lateral (
    select resp.answered_yes, resp.selected_date, resp.created_at
    from responses resp where resp.invitation_id = i.id
    order by resp.created_at desc limit 1
  ) r on true
  where i.slug = p_slug
    and coalesce(i.kind, 'invite') = 'invite'
    and i.status in ('published', 'expired');
$$;
revoke all on function public.reply_context(text) from public;
grant execute on function public.reply_context(text) to anon, authenticated;

-- Ответ опубликован → автору исходного приглашения в Telegram
create or replace function public.trg_notify_reply_published()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.reply_to is not null and new.status = 'published' and old.status is distinct from 'published' then
    perform notify_telegram(new.reply_to, 'reply_published', jsonb_build_object(
      'reply_slug', new.slug, 'reply_kind', coalesce(new.reply_kind, 'card')));
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_notify_reply_published() from public, anon, authenticated;

drop trigger if exists trg_reply_published_notify on public.invitations;
create trigger trg_reply_published_notify
  after update of status on public.invitations
  for each row execute function public.trg_notify_reply_published();
