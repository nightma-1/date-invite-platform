-- © 2026 Senti. Все права защищены.
--
-- Ответная открытка девушки (reply_kind = 'card') — уже не мастер из шагов,
-- а одна страница: «билет на свидание» (дата, время, место и еда, которые
-- она выбрала в исходном приглашении + обратный отсчёт), её «спасибо»,
-- необязательное шутливое условие и необязательное голосовое.
--
-- invitations.reply_card: { lang, note, condition, voice_url }
-- Билет собирается из ответа на исходное приглашение (reply_to) — функции
-- reply_ticket (конструктор, по ссылке исходного) и reply_card (страница
-- открытки, по её собственной ссылке).

alter table public.invitations add column if not exists reply_card jsonb
  check (reply_card is null or pg_column_size(reply_card) <= 4000);

-- Голосовое в открытке лежит в том же bucket, что и картинки приглашений
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm', 'video/mp4',
     'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
   ]
 where id = 'invitation-media';

-- Билет: что она выбрала в исходном приглашении
create or replace function public._reply_ticket(p_invitation_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'her_name', o.recipient_name,
    'his_name', o.sender_name,
    'template_key', o.template_key,
    'lang', (select s.configuration_json->>'lang' from invitation_steps s
             where s.invitation_id = o.id and s.step_type = 'question' limit 1),
    'answered_yes', coalesce(r.answered_yes, false),
    'date', r.selected_date,
    'time', r.selected_time,
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('icon', opt->>'icon', 'label', opt->>'label'))
      from jsonb_each(coalesce(r.selections, '{}'::jsonb)) sel(step_id, ids)
      join invitation_steps s on s.invitation_id = o.id and s.id::text = sel.step_id
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(sel.ids) = 'array' then sel.ids else '[]'::jsonb end) oid(v)
      cross join lateral jsonb_array_elements(coalesce(s.configuration_json->'options', '[]'::jsonb)) opt
      where opt->>'id' = oid.v
    ), '[]'::jsonb)
  )
  from invitations o
  left join lateral (
    select resp.answered_yes, resp.selected_date, resp.selected_time, resp.selections
    from responses resp where resp.invitation_id = o.id
    order by resp.created_at desc limit 1
  ) r on true
  where o.id = p_invitation_id;
$$;
revoke all on function public._reply_ticket(uuid) from public, anon, authenticated;

-- Конструктор открытки: по ссылке исходного приглашения
create or replace function public.reply_ticket(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select public._reply_ticket(i.id) || jsonb_build_object('invitation_id', i.id)
  from invitations i
  where i.slug = p_slug and coalesce(i.kind, 'invite') = 'invite'
    and i.reply_to is null and i.status in ('published', 'expired');
$$;
revoke all on function public.reply_ticket(text) from public;
grant execute on function public.reply_ticket(text) to anon, authenticated;

-- Страница открытки: по её собственной ссылке
create or replace function public.reply_card(p_slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'to_name', i.recipient_name,
    'card', i.reply_card,
    'ticket', public._reply_ticket(i.reply_to)
  )
  from invitations i
  where i.slug = p_slug and i.reply_kind = 'card' and i.reply_to is not null
    and i.status = 'published';
$$;
revoke all on function public.reply_card(text) from public;
grant execute on function public.reply_card(text) to anon, authenticated;
