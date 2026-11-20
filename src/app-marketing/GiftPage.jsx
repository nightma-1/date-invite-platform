/**
 * © 2026 Senti. Все права защищены.
 *
 * «Подари приглашение другу». /gift — покупка (19 000 сум через Click),
 * /gift/:giftId — куда Click возвращает после оплаты: ждём, пока вебхук
 * активирует код, и показываем код + готовое сообщение для друга.
 * Друг открывает senti.uz/builder?promo=GIFT-… — код уже подставлен
 * (lib/promo.js), публикация бесплатная (api/click/create.js → redeemGift).
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';
import { INVITATION_PRICE } from '../lib/promo.js';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';
import AuthGate from '../app-builder/AuthGate.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';

const POLL_MS = 2500;
const MAX_POLLS = 48; // ~2 минуты

const primaryBtn = {
  background: `linear-gradient(135deg, ${T.pink}, #ff8fb1)`, color: '#fff', border: 'none', borderRadius: 100,
  padding: '14px 26px', fontFamily: T.font, fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%',
  boxShadow: `0 14px 30px -10px ${T.pink}90`,
};
const ghostBtn = {
  background: '#fff', color: T.darkPurple, border: `1.5px solid ${T.pinkBorder}`, borderRadius: 100,
  padding: '13px 24px', fontFamily: T.font, fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%',
};

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative',
    }}>
      <DecorativeBlobs />
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}><LanguageSwitcher /></div>
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', maxWidth: 400, width: '100%', position: 'relative', zIndex: 1, fontFamily: T.font }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function giftLink(code) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://senti.uz';
  return `${origin}/builder?promo=${encodeURIComponent(code)}&utm_source=senti&utm_medium=gift`;
}

/** /gift — покупка */
export function GiftBuy() {
  const { t } = useTranslation();
  const [session, setSession] = useState(undefined);
  const [askLogin, setAskLogin] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    track('gift_page_view');
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function buy(method) {
    setError(null);
    if (!session) { setAskLogin(true); return; }
    setBusy(method);
    track('gift_buy_click', { method });
    try {
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ purpose: 'gift', method }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.paymentUrl) throw new Error(data.error || 'gift');
      window.location.href = data.paymentUrl;
    } catch {
      setError(t('gift.buyFailed'));
      setBusy(null);
    }
  }

  return (
    <Shell>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎁</div>
      <h1 style={{ fontWeight: 700, fontSize: 24, color: T.darkPurple, marginBottom: 10, lineHeight: 1.25 }}>
        {t('gift.title')}
      </h1>
      <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
        {t('gift.subtitle')}
      </p>
      <ol style={{ textAlign: 'left', color: T.darkPurple, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 20px', paddingLeft: 20 }}>
        <li>{t('gift.step1')}</li>
        <li>{t('gift.step2')}</li>
        <li>{t('gift.step3')}</li>
      </ol>
      <p style={{ fontWeight: 700, fontSize: 20, color: T.darkPurple, marginBottom: 14 }}>
        {INVITATION_PRICE.toLocaleString('ru-RU')} {t('builder.sum')}
      </p>

      {askLogin && !session ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: 16, border: `1.5px solid ${T.pinkBorder}`, textAlign: 'left' }}>
          <AuthGate context="checkout" onAuthenticated={() => setAskLogin(false)} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" style={primaryBtn} disabled={Boolean(busy)} onClick={() => buy('invoice')}>
            {busy === 'invoice' ? t('gift.redirecting') : t('gift.payClick')}
          </button>
          <button type="button" style={ghostBtn} disabled={Boolean(busy)} onClick={() => buy('card')}>
            {busy === 'card' ? t('gift.redirecting') : t('gift.payCard')}
          </button>
        </div>
      )}
      {error && <p style={{ color: '#C0392B', fontSize: 13, marginTop: 10 }}>{error}</p>}
      <Link to="/" style={{ display: 'block', marginTop: 18, color: T.muted, fontSize: 13 }}>← senti.uz</Link>
    </Shell>
  );
}

/** /gift/:giftId — после оплаты */
export function GiftStatus() {
  const { t } = useTranslation();
  const { giftId } = useParams();
  const [gift, setGift] = useState(null);
  const [state, setState] = useState('checking'); // checking | ready | redeemed | timeout | notfound
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    async function poll() {
      attempt += 1;
      const { data } = await supabase.from('gift_codes').select('code, status').eq('id', giftId).maybeSingle();
      if (cancelled) return;
      if (data?.status === 'active' || data?.status === 'redeemed') {
        setGift(data);
        setState(data.status === 'active' ? 'ready' : 'redeemed');
        if (data.status === 'active') track('gift_paid');
        return;
      }
      if (attempt >= MAX_POLLS) { setState(data ? 'timeout' : 'notfound'); return; }
      setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { cancelled = true; };
  }, [giftId]);

  const link = gift ? giftLink(gift.code) : '';
  const message = gift ? t('gift.message', { link, code: gift.code }) : '';

  function copy(what, text) {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    track('gift_share_click');
    if (navigator.share) {
      try { await navigator.share({ text: message }); return; } catch { /* закрыл окно — не ошибка */ }
    }
    copy('message', message);
  }

  if (state === 'checking') {
    return (
      <Shell>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
        <h1 style={{ fontWeight: 700, fontSize: 22, color: T.darkPurple, marginBottom: 8 }}>{t('payment.checkingTitle')}</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>{t('payment.checkingSubtitle')}</p>
      </Shell>
    );
  }
  if (state === 'timeout' || state === 'notfound') {
    return (
      <Shell>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🤔</div>
        <h1 style={{ fontWeight: 700, fontSize: 20, color: T.darkPurple, marginBottom: 8 }}>{t('gift.notReadyTitle')}</h1>
        <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.6 }}>{t('gift.notReadyText')}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎁</div>
      <h1 style={{ fontWeight: 700, fontSize: 24, color: T.darkPurple, marginBottom: 8 }}>
        {state === 'redeemed' ? t('gift.redeemedTitle') : t('gift.readyTitle')}
      </h1>
      <p style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
        {state === 'redeemed' ? t('gift.redeemedText') : t('gift.readyText')}
      </p>

      <button
        type="button" onClick={() => copy('code', gift.code)}
        style={{
          width: '100%', background: '#fff', border: `2px dashed ${T.pink}`, borderRadius: 18, padding: '16px 12px',
          fontFamily: 'monospace', fontSize: 24, fontWeight: 700, letterSpacing: 2, color: T.darkPurple, cursor: 'pointer', marginBottom: 6,
        }}
      >
        {gift.code}
      </button>
      <p style={{ color: T.muted, fontSize: 12, marginBottom: 18 }}>{copied === 'code' ? t('builder.copied') : t('gift.tapToCopy')}</p>

      {state === 'ready' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" style={primaryBtn} onClick={share}>
            {copied === 'message' ? t('builder.copied') : t('gift.share')}
          </button>
          <button type="button" style={ghostBtn} onClick={() => copy('link', link)}>
            {copied === 'link' ? t('builder.copied') : t('gift.copyLink')}
          </button>
        </div>
      )}
      <Link to="/" style={{ display: 'block', marginTop: 18, color: T.muted, fontSize: 13 }}>← senti.uz</Link>
    </Shell>
  );
}
