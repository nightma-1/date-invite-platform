-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

alter table templates enable row level security;
alter table media_library enable row level security;

create policy "public read active templates"
  on templates for select
  using (active = true);

create policy "public read active media_library"
  on media_library for select
  using (active = true);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

create or replace function set_publication_deadlines()
returns trigger as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at = coalesce(new.published_at, now());
    new.edit_until = new.published_at + interval '3 days';
    new.expires_at = new.published_at + interval '7 days';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

revoke execute on function handle_new_user() from anon, authenticated;