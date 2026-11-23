/**
 * © 2026 Senti. Все права защищены.
 *
 * Блок партнёра под ответом «Да»: подарок к свиданию в магазине for Memory
 * со скидкой по коду. Скрыт, пока FORMEMORY_PUBLIC = false (виден только владельцу).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORMEMORY, FORMEMORY_PUBLIC } from '../lib/partners.js';
import { useIsAdmin } from '../lib/useIsAdmin.js';

export default function GiftPartner({ tokens, gender }) {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [copied, setCopied] = useState(false);
  if (!FORMEMORY_PUBLIC && !isAdmin && !import.meta.env.DEV) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(FORMEMORY.code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* буфер недоступен — код и так виден */ }
  };

  return (
    <div style={{
      marginTop: 22, borderRadius: 22, padding: '18px 20px', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #661E3A 0%, #471224 100%)', color: '#fff',
      boxShadow: '0 18px 40px -18px rgba(71,18,36,.55)', fontFamily: tokens.fontUI,
    }}>
      <div aria-hidden="true" style={{ position: 'absolute', right: 16, top: 10, fontSize: 30, opacity: 0.35 }}>🎁</div>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7, margin: 0 }}>
        {t('responseView.giftLabel')}
      </p>
      <p style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1.25, paddingRight: 36 }}>
        {t('responseView.giftTitle', { context: gender === 'male' || gender === 'female' ? gender : undefined })}
      </p>
      <p style={{ fontSize: 13, opacity: 0.85, margin: '0 0 14px', lineHeight: 1.45 }}>
        {t('responseView.giftText', { discount: FORMEMORY.discount })}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={copy}
          style={{
            border: '1.5px dashed rgba(255,255,255,.6)', background: 'rgba(255,255,255,.1)', color: '#fff',
            borderRadius: 100, padding: '9px 16px', fontWeight: 800, letterSpacing: '0.06em', fontSize: 14, cursor: 'pointer',
          }}
        >
          {copied ? t('responseView.giftCopied') : FORMEMORY.code}
        </button>
        <a
          href={FORMEMORY.url}
          target="_blank"
          rel="noopener"
          style={{
            background: '#fff', color: '#471224', borderRadius: 100, padding: '10px 18px',
            fontWeight: 700, fontSize: 14, textDecoration: 'none',
          }}
        >
          {t('responseView.giftButton')}
        </a>
      </div>
    </div>
  );
}
