-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- ============================================================
-- Date Invite Platform — начальная схема
-- Вход через Supabase Auth (email/password или Google OAuth).
-- Telegram — необязательная привязка только для уведомлений.
-- ПРИМЕЧАНИЕ: RLS-политики здесь позже пересозданы миграцией
-- optimize_rls_and_indexes — смотри финальную версию там.
-- ============================================================

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_username text,
  telegram_chat_id bigint,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mood text not null,
  preview_image text,
  configuration jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table media_library (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('gif', 'music')),
  category text not null,
  url text not null,
  title text,
  active boolean not null default true
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  template_id uuid references templates(id),
  slug text unique not null,
  mood text,
  recipient_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'expired', 'archived')),
  opening_mechanic text not null default 'envelope'
    check (opening_mechanic in ('direct', 'envelope', 'pin')),
  pin_code text,
  published_at timestamptz,
  edit_until timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_invitations_user_id on invitations(user_id);
create index idx_invitations_slug on invitations(slug);
create index idx_invitations_status_expires on invitations(status, expires_at);

create table invitation_content (
  invitation_id uuid primary key references invitations(id) on delete cascade,
  question_text jsonb not null default '{}'::jsonb,
  reaction_text jsonb not null default '{}'::jsonb,
  final_screen jsonb not null default '{}'::jsonb,
  gif_url text,
  music_url text,
  photos text[] not null default '{}'
);

create table invitation_steps (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations(id) on delete cascade,
  step_type text not null
    check (step_type in ('question', 'yes_no', 'reaction', 'date', 'time', 'choice_block', 'final')),
  step_order int not null,
  enabled boolean not null default true,
  configuration_json jsonb not null default '{}'::jsonb
);

create index idx_invitation_steps_invitation_id on invitation_steps(invitation_id);

create table choice_blocks (
  id uuid primary key default gen_random_uuid(),
  invitation_step_id uuid not null references invitation_steps(id) on delete cascade,
  category_type text not null,
  title jsonb not null default '{}'::jsonb,
  allow_multiple boolean not null default false
);

create table choice_options (
  id uuid primary key default gen_random_uuid(),
  choice_block_id uuid not null references choice_blocks(id) on delete cascade,
  label jsonb not null default '{}'::jsonb,
  image_url text,
  order_index int not null default 0
);

create index idx_choice_options_block_id on choice_options(choice_block_id);

create table responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid unique not null references invitations(id) on delete cascade,
  answered_yes boolean not null,
  selected_date date,
  selected_time time,
  selections jsonb not null default '{}'::jsonb,
  custom_answers jsonb not null default '{}'::jsonb,
  first_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  invitation_id uuid not null references invitations(id) on delete cascade,
  amount int not null,
  currency text not null default 'UZS',
  provider text not null default 'click',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded')),
  transaction_id text,
  click_prepare_id bigserial unique,
  created_at timestamptz not null default now()
);

create index idx_payments_invitation_id on payments(invitation_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_invitations_updated_at
  before update on invitations
  for each row execute function set_updated_at();

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
$$ language plpgsql;

create trigger trg_invitations_publish
  before update on invitations
  for each row execute function set_publication_deadlines();

alter table profiles enable row level security;
alter table invitations enable row level security;
alter table invitation_content enable row level security;
alter table invitation_steps enable row level security;
alter table choice_blocks enable row level security;
alter table choice_options enable row level security;
alter table responses enable row level security;
alter table payments enable row level security;

create policy "public insert response for published invitation"
  on responses for insert
  with check (exists (
    select 1 from invitations i
    where i.id = responses.invitation_id and i.status = 'published'
  ));