/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * «Сохранить доступ» для гостя — человека, который оплатил приглашение без
 * регистрации (см. src/lib/guestAccount.js). Его приглашения и ответы
 * видны только в этом браузере, пока он не войдёт. После входа
 * initGuestClaim переносит всё на настоящий аккаунт, а карточка ловит
 * событие senti:guest-claimed и сообщает, что доступ сохранён.
 *
 * Ничего не показывает, если человек не гость.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient.js';
import { isGuest } from '../../lib/guestAccount.js';
import { track } from '../../lib/analytics.js';
import AuthGate from '../../app-builder/AuthGate.jsx';

export default function SaveAccessCard({ context = 'payment_success', style }) {
  const { t } = useTranslation();
  const [guest, setGuest] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setGuest(isGuest(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session && !isGuest(session)) setGuest(false);
    });
    function onClaimed() {
      if (!cancelled) setSaved(true);
    }
    window.addEventListener('senti:guest-claimed', onClaimed);
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.removeEventListener('senti:guest-claimed', onClaimed);
    };
  }, []);

  if (saved) {
    return (
      <p style={{ fontFamily: '"Manrope", sans-serif', fontSize: 13, color: '#2E7D4F', margin: '0 0 14px', ...style }}>
        {t('guest.saved')}
      </p>
    );
  }
  if (!guest) return null;

  if (open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, ...style }}>
        <AuthGate context={`save_access_${context}`} title={t('guest.authTitle')} onAuthenticated={() => {}} />
      </div>
    );
  }

  return (
    <div style={{
      background: '#FFF0F5', border: '1.5px solid #F5C2D4', borderRadius: 16,
      padding: '14px 16px', marginBottom: 16, textAlign: 'left', ...style,
    }}>
      <p style={{ fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 14, color: '#8A2449', margin: '0 0 4px' }}>
        {t('guest.title')}
      </p>
      <p style={{ fontFamily: '"Manrope", sans-serif', fontSize: 12.5, color: '#8A2449', opacity: 0.85, lineHeight: 1.45, margin: '0 0 10px' }}>
        {t('guest.text')}
      </p>
      <button
        type="button"
        onClick={() => { setOpen(true); track('guest_save_open', { context }); }}
        style={{
          background: '#C23B62', color: '#fff', border: 'none', borderRadius: 100,
          padding: '9px 18px', fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}
      >
        {t('guest.button')}
      </button>
    </div>
  );
}
