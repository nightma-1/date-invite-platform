-- Триггерные функции не должны торчать наружу как RPC-эндпоинты
-- (/rest/v1/rpc/...), а attach_referral и partner_stats бессмысленны для
-- анонима — он всё равно не пройдёт проверку auth.uid().

revoke all on function public.payments_attach_partner() from public, anon, authenticated;
revoke all on function public.payments_handle_commission() from public, anon, authenticated;

revoke all on function public.attach_referral(text) from public, anon;
grant execute on function public.attach_referral(text) to authenticated;

revoke all on function public.partner_stats() from public, anon;
grant execute on function public.partner_stats() to authenticated;
