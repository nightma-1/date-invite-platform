/**
 * © 2026 Senti. Все права защищены.
 * «Отправить в Telegram» — сразу выбрать её чат и переслать ссылку.
 * В Mini App открывает чат внутри Telegram, на сайте — t.me/share.
 */

import { useTranslation } from 'react-i18next';
import { shareToTelegram } from '../../lib/telegramMiniApp.js';
import { track } from '../../lib/analytics.js';
import { T } from '../../app-builder/BuilderUI.jsx';

export default function ShareToTelegram({ url, slug }) {
  const { t } = useTranslation();
  if (!url) return null;
  return (
    <button
      type="button"
      onClick={() => { track('share_telegram_click', {}, { slug }); shareToTelegram(url, t('builder.tgShareText')); }}
      style={{
        width: '100%', background: '#229ED9', color: '#fff', border: 'none', borderRadius: 100,
        padding: '12px 20px', fontFamily: T.font, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16,
      }}
    >
      {t('builder.tgShare')}
    </button>
  );
}
