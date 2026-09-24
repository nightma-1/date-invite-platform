-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- Недостающие индексы на внешние ключи
create index idx_choice_blocks_invitation_step_id on choice_blocks(invitation_step_id);
create index idx_invitations_template_id on invitations(template_id);
create index idx_payments_user_id on payments(user_id);

-- profiles
drop policy "user reads own profile" on profiles;
drop policy "user updates own profile" on profiles;

create policy "user reads own profile" on profiles for select
  using ((select auth.uid()) = id);
create policy "user updates own profile" on profiles for update
  using ((select auth.uid()) = id);

-- invitations: объединяем select в одну политику, остальные действия — раздельно
create policy "select own or published invitations" on invitations for select
  using ((select auth.uid()) = user_id or status = 'published');
create policy "owner insert invitations" on invitations for insert
  with check ((select auth.uid()) = user_id);
create policy "owner update invitations" on invitations for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete invitations" on invitations for delete
  using ((select auth.uid()) = user_id);

-- invitation_content
create policy "select own or published invitation_content" on invitation_content for select
  using (exists (
    select 1 from invitations i
    where i.id = invitation_content.invitation_id
      and ((select auth.uid()) = i.user_id or i.status = 'published')
  ));
create policy "owner insert invitation_content" on invitation_content for insert
  with check (exists (select 1 from invitations i where i.id = invitation_content.invitation_id and (select auth.uid()) = i.user_id));
create policy "owner update invitation_content" on invitation_content for update
  using (exists (select 1 from invitations i where i.id = invitation_content.invitation_id and (select auth.uid()) = i.user_id));
create policy "owner delete invitation_content" on invitation_content for delete
  using (exists (select 1 from invitations i where i.id = invitation_content.invitation_id and (select auth.uid()) = i.user_id));

-- invitation_steps
create policy "select own or published invitation_steps" on invitation_steps for select
  using (exists (
    select 1 from invitations i
    where i.id = invitation_steps.invitation_id
      and ((select auth.uid()) = i.user_id or i.status = 'published')
  ));
create policy "owner insert invitation_steps" on invitation_steps for insert
  with check (exists (select 1 from invitations i where i.id = invitation_steps.invitation_id and (select auth.uid()) = i.user_id));
create policy "owner update invitation_steps" on invitation_steps for update
  using (exists (select 1 from invitations i where i.id = invitation_steps.invitation_id and (select auth.uid()) = i.user_id));
create policy "owner delete invitation_steps" on invitation_steps for delete
  using (exists (select 1 from invitations i where i.id = invitation_steps.invitation_id and (select auth.uid()) = i.user_id));

-- choice_blocks
create policy "select own or published choice_blocks" on choice_blocks for select
  using (exists (
    select 1 from invitation_steps s join invitations i on i.id = s.invitation_id
    where s.id = choice_blocks.invitation_step_id
      and ((select auth.uid()) = i.user_id or i.status = 'published')
  ));
create policy "owner insert choice_blocks" on choice_blocks for insert
  with check (exists (select 1 from invitation_steps s join invitations i on i.id = s.invitation_id where s.id = choice_blocks.invitation_step_id and (select auth.uid()) = i.user_id));
create policy "owner update choice_blocks" on choice_blocks for update
  using (exists (select 1 from invitation_steps s join invitations i on i.id = s.invitation_id where s.id = choice_blocks.invitation_step_id and (select auth.uid()) = i.user_id));
create policy "owner delete choice_blocks" on choice_blocks for delete
  using (exists (select 1 from invitation_steps s join invitations i on i.id = s.invitation_id where s.id = choice_blocks.invitation_step_id and (select auth.uid()) = i.user_id));

-- choice_options
create policy "select own or published choice_options" on choice_options for select
  using (exists (
    select 1 from choice_blocks b
    join invitation_steps s on s.id = b.invitation_step_id
    join invitations i on i.id = s.invitation_id
    where b.id = choice_options.choice_block_id
      and ((select auth.uid()) = i.user_id or i.status = 'published')
  ));
create policy "owner insert choice_options" on choice_options for insert
  with check (exists (select 1 from choice_blocks b join invitation_steps s on s.id = b.invitation_step_id join invitations i on i.id = s.invitation_id where b.id = choice_options.choice_block_id and (select auth.uid()) = i.user_id));
create policy "owner update choice_options" on choice_options for update
  using (exists (select 1 from choice_blocks b join invitation_steps s on s.id = b.invitation_step_id join invitations i on i.id = s.invitation_id where b.id = choice_options.choice_block_id and (select auth.uid()) = i.user_id));
create policy "owner delete choice_options" on choice_options for delete
  using (exists (select 1 from choice_blocks b join invitation_steps s on s.id = b.invitation_step_id join invitations i on i.id = s.invitation_id where b.id = choice_options.choice_block_id and (select auth.uid()) = i.user_id));

-- responses / payments
create policy "owner read responses" on responses for select
  using (exists (select 1 from invitations i where i.id = responses.invitation_id and (select auth.uid()) = i.user_id));

create policy "owner read payments" on payments for select
  using ((select auth.uid()) = user_id);