/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Прогон приглашения перед оплатой: автор проходит его целиком ровно так, как
 * пройдёт получатель — с убегающей кнопкой «Нет», переходами и финалом. Боковая
 * превьюшка в конструкторе показывает один экран в статике, а здесь видно
 * главное: то, что происходит МЕЖДУ экранами.
 *
 * Внутри рамки крутится настоящий InvitationRuntime в режиме превью, поэтому
 * показанное не может разойтись с тем, что получит девушка.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import InvitationRuntime from '../app-recipient/InvitationRuntime.jsx';
import { T } from './BuilderUI.jsx';

export default function PreviewOverlay({ previewData, onClose, onConfirm, confirmLabel, busy }) {
  const { t } = useTranslation();

  // Пока открыт прогон, страница конструктора под ним не должна скроллиться.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(40, 20, 30, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px 12px 0',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <p style={{
        color: '#fff', fontFamily: T.font, fontSize: 13, fontWeight: 600,
        marginBottom: 10, textAlign: 'center', textShadow: '0 1px 6px rgba(0,0,0,.35)',
      }}>
        {t('preview.title')}
      </p>

      {/* Рамка телефона: сразу понятно, что это чужой экран, а не твоя страница */}
      <div style={{
        width: 'min(360px, 100%)',
        height: 'min(720px, calc(100vh - 170px))',
        background: '#000',
        borderRadius: 38,
        padding: 8,
        boxShadow: '0 24px 60px -20px rgba(0,0,0,.6)',
        flexShrink: 0,
      }}>
        <div style={{
          width: '100%', height: '100%',
          borderRadius: 31,
          overflow: 'auto',
          position: 'relative',
          background: '#fff',
          WebkitOverflowScrolling: 'touch',
        }}>
          <InvitationRuntime previewData={previewData} />
        </div>
      </div>

      {/* Панель решения — висит под телефоном, чтобы из прогона можно было
          сразу уйти на оплату, не разыскивая кнопку в конструкторе. */}
      <div style={{
        position: 'sticky', bottom: 0,
        width: 'min(360px, 100%)',
        display: 'flex', gap: 10,
        padding: '12px 0 16px',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: '0 0 auto', padding: '0 18px', height: 50, borderRadius: 100,
            border: 'none', background: 'rgba(255,255,255,.92)', color: T.dark,
            fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}
        >
          {t('preview.fix')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          style={{
            flex: 1, height: 50, borderRadius: 100,
            border: 'none', background: T.pink, color: '#fff',
            fontFamily: T.font, fontWeight: 700, fontSize: 15,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
