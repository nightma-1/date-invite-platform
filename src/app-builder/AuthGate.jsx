/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';

// Вход через Telegram уводит человека со страницы на сайт
// провайдера и возвращает обратно уже с сессией. Telegram подключён в Supabase
// как свой OIDC-провайдер с идентификатором custom:telegram.
const OAUTH_PROVIDERS = [
  { id: 'custom:telegram', key: 'withTelegram', bg: '#2AABEE', color: '#fff', border: '#2AABEE' },
];

// Адрес, куда вернуть человека после входа: текущая страница, но без
// следов прошлой неудачной попытки. Если оставить ?error=… от предыдущего
// раза, Supabase вернёт ключи входа вместе со старой ошибкой, и клиент
// увидит ошибку и не войдёт.
function cleanReturnUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  ['error', 'error_code', 'error_description', 'code', 'state'].forEach((k) => url.searchParams.delete(k));
  return url.toString();
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M21.9 4.3 18.6 19.9c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.4l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4Z" />
    </svg>
  );
}

export default function AuthGate({ onAuthenticated, onBeforeRedirect, initialError = null }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('signin');
  // Вернулись из Telegram с ошибкой (отменили вход, Telegram не ответил):
  // показываем понятный текст и убираем ?error=… из адреса.
  const [error, setError] = useState(() => {
    if (initialError) return initialError;
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('error')) return null;
      window.history.replaceState(null, '', cleanReturnUrl());
      return t('auth.oauthError');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    display: 'block', width: '100%', padding: '11px 14px',
    border: '1.5px solid #2A1F2B20', borderRadius: 6,
    fontFamily: '"Manrope", sans-serif', fontSize: 14, color: '#2A1F2B',
    background: '#fff', boxSizing: 'border-box',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError(t('auth.fillFields')); return; }
    setLoading(true);
    track('auth_start', { mode });
    try {
      const { data, error: authError } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      if (mode === 'signup' && !data.session) {
        // Supabase не возвращает ошибку, если email уже зарегистрирован и
        // подтверждён (защита от перебора email) — просто отдаёт "пустого"
        // пользователя без identities и без session. Раньше это трактовалось
        // как "надо подтвердить почту", и человек бесконечно ждал письмо,
        // которое никогда не придёт. Отличаем этот случай явно.
        const alreadyRegistered = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
        if (alreadyRegistered) {
          setMode('signin');
          setError(t('auth.alreadyRegistered'));
        } else {
          setError(t('auth.checkEmail'));
        }
        return;
      }
      if (!data.session) {
        throw new Error(t('auth.sessionError'));
      }
      track('auth_success', { mode });
      onAuthenticated(data.session.user);
    } catch (err) {
      track('auth_error', { mode });
      setError(err.message || t('auth.genericError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider) {
    setError(null);
    setLoading(true);
    track('auth_start', { mode: 'oauth', provider });
    try {
      // Запоминаем, что человек собирался сделать (например, оплатить), —
      // после возврата из Telegram страница загрузится заново.
      if (onBeforeRedirect) onBeforeRedirect(provider);
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: cleanReturnUrl() },
      });
      if (authError) throw authError;
      // Дальше браузер уходит на страницу провайдера.
    } catch (err) {
      track('auth_error', { mode: 'oauth', provider });
      setError(err.message || t('auth.genericError'));
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: '#fff', borderRadius: 12, padding: 32,
        width: '100%', maxWidth: 380,
        boxShadow: '0 4px 24px rgba(42,31,43,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <LanguageSwitcher />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>💌</div>
        <h2 style={{ fontFamily: '"Cormorant Garamond", serif', color: '#2A1F2B', fontSize: 22, fontWeight: 700, margin: 0 }}>
          {mode === 'signin' ? t('auth.signinTitle') : t('auth.signupTitle')}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {OAUTH_PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={loading}
            onClick={() => handleOAuth(p.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: p.bg, color: p.color, border: `1.5px solid ${p.border}`,
              padding: '11px', borderRadius: 6,
              fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            <TelegramIcon />
            {t(`auth.${p.key}`)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, color: '#6B4D5A', fontFamily: '"Manrope", sans-serif', fontSize: 12.5 }}>
        <span style={{ flex: 1, height: 1, background: '#2A1F2B1A' }} />
        {t('auth.orEmail')}
        <span style={{ flex: 1, height: 1, background: '#2A1F2B1A' }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} style={inputStyle} />
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
            style={{ ...inputStyle, paddingRight: 40 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            style={{
              position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6B4D5A', opacity: 0.7,
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {error && (
          <p style={{ color: '#C0392B', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            background: '#C23B62', color: '#fff',
            padding: '12px', borderRadius: 6,
            fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 15,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, marginTop: 4,
          }}
        >
          {loading ? t('auth.signingIn') : mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: '"Manrope", sans-serif', fontSize: 13,
            color: '#6B4D5A', textDecoration: 'underline',
          }}
        >
          {mode === 'signin' ? t('auth.toggleToSignup') : t('auth.toggleToSignin')}
        </button>
      </form>
    </motion.div>
  );
}
