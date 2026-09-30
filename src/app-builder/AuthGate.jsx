/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';

export default function AuthGate({ onAuthenticated }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [error, setError] = useState(null);
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
      onAuthenticated(data.session.user);
    } catch (err) {
      setError(err.message || t('auth.genericError'));
    } finally {
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} style={inputStyle} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.password')} style={inputStyle} />

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
