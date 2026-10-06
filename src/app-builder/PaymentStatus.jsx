/**
 * © 2026 Senti. Все права защищены.
 *
 * Страница, на которую Click возвращает человека после оплаты
 * (return_url из api/click/create.js). Сама публикация (status: 'published')
 * происходит асинхронно — вебхук Click (api/click/webhook.js) может прийти
 * на пару секунд позже, чем человек вернётся в браузер — поэтому здесь не
 * проверка "один раз", а короткий поллинг статуса приглашения в БД.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import { T, DecorativeBlobs } from './BuilderUI.jsx';

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 16; // ~40 секунд — вебхук обычно приходит за 1-3 секунды

export default function PaymentStatus() {
  const { t } = useTranslation();
  const { invitationId } = useParams();
  const [status, setStatus] = useState('checking'); // checking | published | timeout | notfound
  const [slug, setSlug] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      attempt += 1;
      const { data, error } = await supabase
        .from('invitations')
        .select('status, slug')
        .eq('id', invitationId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        // RLS не пустит чужой/несуществующий черновик — для владельца, не
        // вошедшего в сессию (вкладка открылась заново), тоже придёт пусто
        setStatus('notfound');
        return;
      }

      if (data.status === 'published') {
        setSlug(data.slug);
        setStatus('published');
        return;
      }

      if (attempt >= MAX_ATTEMPTS) {
        setStatus('timeout');
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => { cancelled = true; };
  }, [invitationId]);

  async function retryPayment() {
    setRetrying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ invitationId }),
      });
      const data = await res.json();
      if (res.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
    } catch {
      // падаем в finally — покажем ту же кнопку ещё раз
    }
    setRetrying(false);
  }

  const shareUrl = slug ? `${window.location.origin}/i/${slug}` : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
    }}>
      <DecorativeBlobs />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', maxWidth: 400, width: '100%', position: 'relative', zIndex: 1 }}
      >
        {status === 'checking' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
            <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 22, color: T.darkPurple, marginBottom: 8 }}>
              {t('payment.checkingTitle')}
            </h1>
            <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, opacity: 0.8 }}>
              {t('payment.checkingSubtitle')}
            </p>
          </>
        )}

        {status === 'published' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 24, color: T.darkPurple, marginBottom: 8 }}>
              {t('builder.publishedTitle')}
            </h1>
            <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, marginBottom: 20, opacity: 0.8 }}>
              {t('builder.publishedSubtitle')}
            </p>

            {shareUrl && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'white',
                border: `1.5px solid ${T.pinkBorder}`, borderRadius: 16,
                padding: '10px 10px 10px 16px', marginBottom: 16,
              }}>
                <span style={{
                  flex: 1, fontFamily: T.font, fontSize: 13, color: T.dark,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left',
                }}>
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                  style={{
                    background: T.pink, color: '#fff', border: 'none', borderRadius: 100,
                    padding: '8px 16px', fontFamily: T.font, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {linkCopied ? t('builder.copied') : t('builder.copy')}
                </button>
              </div>
            )}

            {slug && (
              <a
                href={`/i/${slug}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', marginBottom: 20, fontFamily: T.font, fontSize: 13, color: T.pink, textDecoration: 'underline' }}
              >
                {t('builder.openAsRecipient')}
              </a>
            )}

            <Link to="/dashboard">
              <button style={{
                background: 'white', color: T.dark, padding: '12px 28px', borderRadius: 100,
                fontFamily: T.font, fontWeight: 700, fontSize: 15, border: `1.5px solid ${T.pinkBorder}`, cursor: 'pointer',
              }}>
                {t('builder.goToDashboard')}
              </button>
            </Link>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🤔</div>
            <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 22, color: T.darkPurple, marginBottom: 8 }}>
              {t('payment.timeoutTitle')}
            </h1>
            <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, marginBottom: 20, opacity: 0.8, lineHeight: 1.5 }}>
              {t('payment.timeoutSubtitle')}
            </p>
            <button
              type="button"
              onClick={retryPayment}
              disabled={retrying}
              style={{
                background: T.pink, color: '#fff', padding: '12px 28px', borderRadius: 100,
                fontFamily: T.font, fontWeight: 700, fontSize: 15, border: 'none',
                cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.7 : 1, marginBottom: 12,
              }}
            >
              {retrying ? t('payment.retrying') : t('payment.retryButton')}
            </button>
            <Link to="/dashboard" style={{ display: 'block', fontFamily: T.font, fontSize: 13, color: T.muted, textDecoration: 'underline' }}>
              {t('builder.goToDashboard')}
            </Link>
          </>
        )}

        {status === 'notfound' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
            <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 22, color: T.darkPurple, marginBottom: 8 }}>
              {t('payment.notfoundTitle')}
            </h1>
            <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, marginBottom: 20, opacity: 0.8, lineHeight: 1.5 }}>
              {t('payment.notfoundSubtitle')}
            </p>
            <Link to="/dashboard">
              <button style={{
                background: T.pink, color: '#fff', padding: '12px 28px', borderRadius: 100,
                fontFamily: T.font, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
              }}>
                {t('builder.goToDashboard')}
              </button>
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}
