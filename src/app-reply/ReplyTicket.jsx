/**
 * © 2026 Senti. Все права защищены.
 *
 * Ответная открытка девушки: «билет на свидание» + её слова + голосовое +
 * шутливое условие. Один компонент на два места:
 *   - превью в конструкторе (ReplyCardBuilder, interactive = false);
 *   - страница открытки у него (InvitationRuntime → reply_kind 'card').
 * Тексты — на языке исходного приглашения (lang), не на языке интерфейса.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import i18n from '../i18n/index.js';

const UNITS = {
  ru: { d: 'дн', h: 'ч', m: 'мин', locale: 'ru-RU' },
  uz: { d: 'kun', h: 'soat', m: 'daq', locale: 'uz-UZ' },
  en: { d: 'd', h: 'h', m: 'min', locale: 'en-GB' },
};

function dateTimeOf(ticket) {
  if (!ticket?.date) return null;
  const time = String(ticket.time || '19:00').slice(0, 5);
  // Время свидания — ташкентское
  return new Date(`${ticket.date}T${time}:00+05:00`);
}

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [target]);
  return target ? target.getTime() - now : null;
}

function formatLeft(ms, lang) {
  const u = UNITS[lang] || UNITS.ru;
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d} ${u.d} ${h} ${u.h}`;
  if (h > 0) return `${h} ${u.h} ${m} ${u.m}`;
  return `${m} ${u.m}`;
}

/** Кнопка, которую нельзя нажать: убегает от пальца */
function DodgeButton({ children, style, onDodge }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  function dodge(e) {
    e?.preventDefault?.();
    setPos({ x: (Math.random() - 0.5) * 180, y: (Math.random() - 0.5) * 120 });
    onDodge?.();
  }
  return (
    <motion.button
      type="button"
      animate={pos}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      onPointerEnter={dodge}
      onTouchStart={dodge}
      onClick={dodge}
      style={style}
    >
      {children}
    </motion.button>
  );
}

export default function ReplyTicket({
  ticket, card, toName, lang = 'ru', tokens, interactive = false, onAnswer, answered = false, envelope = false,
}) {
  const t = useMemo(() => i18n.getFixedT(lang, null, 'replyCard'), [lang]);
  const [opened, setOpened] = useState(!envelope);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(answered);
  const attempts = useRef(0);
  const target = useMemo(() => dateTimeOf(ticket), [ticket]);
  const left = useCountdown(target);
  const u = UNITS[lang] || UNITS.ru;
  const name = String(toName || '').trim();

  const ink = tokens?.ink || '#2D1926';
  const berry = tokens?.berry || '#f85589';
  const muted = tokens?.inkMuted || '#80757b';
  const fontUI = tokens?.fontUI || "'Comfortaa', sans-serif";
  const fontDisplay = tokens?.fontDisplay || fontUI;

  async function answer() {
    if (!interactive || busy || done) return;
    setBusy(true);
    try {
      await onAnswer?.({ condition: card?.condition ? 'accepted' : 'seen', attempts: attempts.current });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 100,
    background: `${berry}14`, color: ink, fontFamily: fontUI, fontSize: 13, fontWeight: 600,
  };
  const primary = {
    background: `linear-gradient(135deg, ${berry}, ${tokens?.amber || berry})`, color: '#fff', border: 'none',
    borderRadius: 100, padding: '13px 24px', fontFamily: fontUI, fontWeight: 700, fontSize: 15,
    cursor: interactive ? 'pointer' : 'default', boxShadow: `0 12px 26px -10px ${berry}80`,
  };

  if (!opened) {
    return (
      <motion.button
        type="button"
        onClick={() => setOpened(true)}
        whileTap={{ scale: 0.96 }}
        style={{
          width: '100%', background: tokens?.card || '#fff', border: `1.5px solid ${berry}30`, borderRadius: 24,
          padding: '40px 20px', cursor: 'pointer', boxShadow: `0 20px 40px -24px ${ink}50`,
        }}
      >
        <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} style={{ fontSize: 64 }}>💌</motion.div>
        <p style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ink, margin: '14px 0 6px' }}>
          {t('envelopeTitle', { name: ticket?.her_name || '' })}
        </p>
        <p style={{ fontFamily: fontUI, fontSize: 13, color: muted }}>{t('tapToOpen')}</p>
      </motion.button>
    );
  }

  const dateLabel = target
    ? new Intl.DateTimeFormat(u.locale, { weekday: 'short', day: 'numeric', month: 'long' }).format(target)
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45 }}>
      {/* Билет */}
      <div style={{
        background: tokens?.card || '#fff', borderRadius: 24, overflow: 'hidden',
        boxShadow: `0 22px 44px -26px ${ink}60`, border: `1.5px solid ${berry}25`, textAlign: 'center',
      }}>
        <div style={{ background: `linear-gradient(135deg, ${berry}, ${tokens?.amber || berry})`, color: '#fff', padding: '10px 16px', fontFamily: fontUI, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          🎟 {t('ticketLabel')}
        </div>
        <div style={{ padding: '20px 18px 16px' }}>
          <h1 style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 22, color: ink, margin: '0 0 14px', lineHeight: 1.25 }}>
            {name ? t('titleNamed', { name }) : t('title')}
          </h1>
          {(dateLabel || ticket?.choices?.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              {dateLabel && <span style={pill}>📅 {dateLabel}{ticket?.time ? ` · ${String(ticket.time).slice(0, 5)}` : ''}</span>}
              {(ticket?.choices || []).map((c, i) => (
                <span key={`${c.label}-${i}`} style={pill}>{c.icon} {String(c.label || '').trim()}</span>
              ))}
            </div>
          )}
          {left != null && (
            <p style={{ fontFamily: fontUI, fontSize: 13, color: muted, margin: '0 0 4px' }}>
              {left > 0 ? t('countdown', { time: formatLeft(left, lang) }) : t('datePassed')}
            </p>
          )}
        </div>
        {/* Линия отрыва */}
        <div style={{ borderTop: `2px dashed ${berry}30`, margin: '0 14px' }} />
        <div style={{ padding: '16px 18px 20px' }}>
          {card?.note && (
            <p style={{ fontFamily: fontUI, fontSize: 15, color: ink, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
              «{card.note}»
            </p>
          )}
          {card?.voice_url && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontFamily: fontUI, fontSize: 12, color: muted, margin: '0 0 6px' }}>🎙 {t('voiceLabel')}</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls preload="metadata" src={card.voice_url} style={{ width: '100%' }} />
            </div>
          )}
        </div>
      </div>

      {/* Условие или просто «жду встречи» */}
      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 20, color: ink, margin: '0 0 4px' }}>
                {card?.condition ? t('acceptedTitle') : '❤️'}
              </p>
              <p style={{ fontFamily: fontUI, fontSize: 13, color: muted }}>{card?.condition ? t('acceptedText') : t('seenText')}</p>
            </motion.div>
          ) : card?.condition ? (
            <motion.div key="cond" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p style={{ fontFamily: fontUI, fontSize: 13, color: muted, margin: '0 0 6px' }}>{t('conditionIntro')}</p>
              <p style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 19, color: ink, margin: '0 0 16px' }}>{card.condition}</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', minHeight: 56 }}>
                <button type="button" style={primary} onClick={answer} disabled={busy}>{t('accept')}</button>
                <DodgeButton
                  onDodge={() => { attempts.current += 1; }}
                  style={{
                    background: tokens?.card || '#fff', color: ink, border: `1.5px solid ${ink}25`, borderRadius: 100,
                    padding: '12px 20px', fontFamily: fontUI, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {t('decline')}
                </DodgeButton>
              </div>
            </motion.div>
          ) : (
            <motion.button key="seen" type="button" style={primary} onClick={answer} disabled={busy}>
              {t('seenButton')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export const CONDITION_PRESETS = {
  ru: ['Десерт за тобой 🍰', 'Фильм выбираю я 🎬', 'Не опаздывай 😄', 'Фото на память 📸'],
  uz: ['Desert sendan 🍰', 'Filmni men tanlayman 🎬', 'Kechikma 😄', 'Esdalik uchun surat 📸'],
  en: ["Dessert's on you 🍰", 'I pick the movie 🎬', "Don't be late 😄", 'A photo together 📸'],
};

export const DEFAULT_NOTE = {
  ru: 'Спасибо за такое приглашение 💌 Мне правда очень приятно.',
  uz: 'Bunday taklif uchun rahmat 💌 Menga rostdan ham juda yoqdi.',
  en: 'Thank you for such an invitation 💌 It really made my day.',
};
