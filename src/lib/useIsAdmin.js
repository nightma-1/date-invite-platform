/**
 * © 2026 Senti. Все права защищены.
 *
 * Владелец ли сервиса смотрит страницу (profiles.is_admin).
 * Только для показа UI: всё, что важно, сервер проверяет сам.
 * null — ещё не знаем, true/false — ответ.
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function check(session) {
      if (!session) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
      if (!cancelled) setIsAdmin(Boolean(data?.is_admin));
    }
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => check(session));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return isAdmin;
}
