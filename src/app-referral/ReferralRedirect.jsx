/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Страница-перехватчик /r/:code. Пользователь её почти не видит: записали
 * клик, запомнили код и ушли на лендинг. Редирект делаем только после ответа
 * RPC — иначе на медленной мобильной сети запрос не успеет уйти до перехода.
 */

import { useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { trackReferralVisit } from '../lib/referral.js';
import { T } from '../app-builder/BuilderUI.jsx';

export default function ReferralRedirect() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // В StrictMode эффект в дев-режиме срабатывает дважды — без этого флага
  // каждый клик писался бы в статистику партнёра два раза.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    // Если блогер ведёт сразу в конструктор (?to=/builder) — уважаем это,
    // но только для внутренних путей, чтобы ссылка не стала открытым редиректом.
    const rawTo = searchParams.get('to') || '/';
    const to = rawTo.startsWith('/') && !rawTo.startsWith('//') ? rawTo : '/';

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      navigate(to, { replace: true });
    };

    // Страховка: если Supabase не ответит, человек всё равно попадёт на сайт.
    const timer = setTimeout(go, 2500);
    trackReferralVisit(code).finally(() => {
      clearTimeout(timer);
      go();
    });

    return () => clearTimeout(timer);
  }, [code, navigate, searchParams]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 100%)`,
        fontFamily: T.font,
        color: T.muted,
        fontSize: 14,
      }}
    >
      <span>💌</span>
    </div>
  );
}
