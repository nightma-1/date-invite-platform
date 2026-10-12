/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Прогон приглашения перед оплатой: автор проходит его целиком ровно так, как
 * пройдёт получатель — с убегающей кнопкой «Нет», переходами и финалом. Боковая
 * превьюшка в конструкторе показывает один экран в статике, а здесь видно
 * главное: то, что происходит МЕЖДУ экранами.
 *
 * Внутри крутится настоящий InvitationRuntime в режиме превью, поэтому
 * показанное не может разойтись с тем, что получит девушка.
 *
 * Про рамку телефона: на телефоне её НЕТ. Рисовать телефон внутри телефона —
 * и странно на вид, и расточительно: бортики съедают место, контент сжимается
 * в коробочку. На мобильном прогон открывается во весь экран (он и так уже
 * «в телефоне»), рамка остаётся только на десктопе, где она объясняет, что
 * перед тобой чужой экран, а не твоя страница.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import InvitationRuntime from '../app-recipient/InvitationRuntime.jsx';
import { T } from './BuilderUI.jsx';

function useIsDesktop() {
  const query = '(min-width: 760px) and (min-height: 700px)';
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export default function PreviewOverlay({ previewData, onClose, onConfirm, confirmLabel, busy }) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();

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

  const actionBar = (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center',
      width: '100%',
    }}>
      <button
        type="button"
        onClick={onClose}
        style={{
          flex: '0 0 auto', padding: '0 20px', height: 50, borderRadius: 100,
          border: `1.5px solid ${T.pinkBorder}`,
          background: '#fff', color: T.dark,
          fontFamily: T.font, fontWeight: 600, fontSize: 14,
          cursor: 'pointer', whiteSpace: 'nowrap',
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
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );

  // ── Телефон: прогон во весь экран, без рамки и затемнения ──────────────
  if (!isDesktop) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: '#fff',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Тонкая шапка: напоминает, что это превью, и даёт выход одним тапом */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px',
          borderBottom: `1px solid ${T.pinkBorder}`,
          background: '#fff',
        }}>
          <span style={{
            flex: 1, fontFamily: T.font, fontSize: 12.5, fontWeight: 600,
            color: T.muted, textAlign: 'center', paddingLeft: 34,
          }}>
            {t('preview.title')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('preview.fix')}
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
              border: `1px solid ${T.pinkBorder}`, background: '#fff',
              color: T.dark, fontSize: 15, cursor: 'pointer', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Само приглашение — занимает всё, что осталось */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', WebkitOverflowScrolling: 'touch' }}>
          <InvitationRuntime previewData={previewData} />
        </div>

        <div style={{
          flexShrink: 0, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          borderTop: `1px solid ${T.pinkBorder}`, background: '#fff',
        }}>
          {actionBar}
        </div>
      </div>
    );
  }

  // ── Десктоп: рамка телефона по центру ──────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(40, 20, 30, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <p style={{
        color: '#fff', fontFamily: T.font, fontSize: 13, fontWeight: 600,
        textAlign: 'center', textShadow: '0 1px 6px rgba(0,0,0,.35)', margin: 0,
      }}>
        {t('preview.title')}
      </p>

      <div style={{
        width: 390,
        height: 'min(780px, calc(100vh - 170px))',
        background: '#1b1b1f',
        borderRadius: 44,
        padding: 10,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.65)',
        flexShrink: 0,
      }}>
        <div style={{
          width: '100%', height: '100%',
          borderRadius: 35,
          overflow: 'auto',
          position: 'relative',
          background: '#fff',
        }}>
          <InvitationRuntime previewData={previewData} />
        </div>
      </div>

      <div style={{ width: 390, flexShrink: 0 }}>
        {actionBar}
      </div>
    </div>
  );
}
