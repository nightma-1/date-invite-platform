/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Техподдержка: модальное окно с формой + прямая ссылка на бота поддержки.
 *
 * Форма работает и для гостя — большая часть обращений приходит именно от
 * тех, кто не смог войти или оплатить. Гостя просим оставить контакт,
 * авторизованному подставляем его e-mail.
 *
 * Отправляется в /api/support/send, оттуда — в рабочую группу в Telegram.
 * После отправки показываем номер обращения и ссылку на бота: нажав в нём
 * «Start», человек подключает свою личку к этому обращению и получает ответ
 * прямо в Telegram.
 *
 * Экспортируем две вещи:
 *   SupportDialog     — само окно (управляется снаружи);
 *   SupportTrigger    — кнопка/ссылка, которая его открывает, с тремя видами
 *                       оформления под разные места сайта.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient.js';
import { T } from '../../app-builder/BuilderUI.jsx';
import { SUPPORT_BOT_URL, supportTicketUrl } from '../../lib/support.js';

const MESSAGE_MAX = 2000;
const MESSAGE_MIN = 10;
const TOPICS = ['payment', 'invitation', 'account', 'suggestion', 'other'];

export function SupportDialog({ open, onClose, defaultTopic = 'other' }) {
  const { t, i18n } = useTranslation();
  const [topic, setTopic] = useState(defaultTopic);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState(null); // null = ещё не знаем / гость
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [ticket, setTicket] = useState(null);
  const textareaRef = useRef(null);

  // Сессия нужна только чтобы подставить e-mail и приложить токен —
  // форма обязана работать и без неё.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEmail(data.session?.user?.email || null);
    });
    return () => { cancelled = true; };
  }, [open]);

  // Сбрасываем форму на каждое открытие, чтобы прошлое обращение не висело в полях.
  useEffect(() => {
    if (!open) return;
    setTopic(defaultTopic);
    setMessage('');
    setContact('');
    setError(null);
    setTicket(null);
    setSending(false);
  }, [open, defaultTopic]);

  // Esc закрывает окно, а пока оно открыто — страница под ним не скроллится.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open && !ticket) textareaRef.current?.focus();
  }, [open, ticket]);

  const needsContact = !email;
  const canSend =
    message.trim().length >= MESSAGE_MIN && (!needsContact || contact.trim().length > 0) && !sending;

  async function submit(e) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch('/api/support/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          topic,
          message: message.trim(),
          contact: contact.trim(),
          // Со страницы какой именно страницы написали — без этого половину
          // обращений невозможно воспроизвести.
          pageUrl: window.location.href,
          locale: i18n.language,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          res.status === 429 ? t('support.errorTooMany') : t(`support.error_${data.code}`, t('support.errorGeneric'))
        );
        setSending(false);
        return;
      }

      setTicket(data.ticket);
    } catch {
      setError(t('support.errorNetwork'));
    }
    setSending(false);
  }

  // Рендерим в body, а не на месте вызова. Иначе модалка наследует стили
  // родителя: например, у подсказки в кабинете стоит opacity на абзаце, и
  // окно вместе с затемнением становилось полупрозрачным. Портал заодно
  // защищает от transform/filter у предков, которые ломают position: fixed.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(45, 25, 38, 0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 0,
          }}
          className="sm:items-center sm:p-5"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('support.title')}
            className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
            style={{ background: '#fff', boxShadow: '0 20px 60px rgba(45,25,38,0.25)' }}
          >
            <div style={{ padding: '22px 22px 24px' }}>
              <div className="mb-1 flex items-start justify-between gap-3">
                <h2 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 19, color: T.darkPurple, margin: 0 }}>
                  {ticket ? t('support.sentTitle') : t('support.title')}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('support.close')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 22, lineHeight: 1, color: T.muted, padding: 0, marginTop: -2,
                  }}
                >
                  ×
                </button>
              </div>

              {ticket ? (
                /* ---------------------------------------------- после отправки */
                <div>
                  <p style={{ fontFamily: T.font, fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 18 }}>
                    {t('support.sentText', { ticket })}
                  </p>
                  <a
                    href={supportTicketUrl(ticket)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'block', textAlign: 'center', textDecoration: 'none',
                      background: '#229ED9', color: '#fff', borderRadius: 100,
                      padding: '13px 20px', fontFamily: T.font, fontWeight: 700, fontSize: 14.5,
                      marginBottom: 10,
                    }}
                  >
                    {t('support.sentTelegramBtn')}
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      width: '100%', background: 'white', color: T.dark, borderRadius: 100,
                      padding: '12px 20px', fontFamily: T.font, fontWeight: 700, fontSize: 14,
                      border: `1.5px solid ${T.pinkBorder}`, cursor: 'pointer',
                    }}
                  >
                    {t('support.close')}
                  </button>
                </div>
              ) : (
                /* ------------------------------------------------------ форма */
                <form onSubmit={submit}>
                  <p style={{ fontFamily: T.font, fontSize: 13.5, color: T.muted, lineHeight: 1.6, marginBottom: 16 }}>
                    {t('support.subtitle')}
                  </p>

                  <p style={{ fontSize: 13, color: T.muted, marginBottom: 8, fontFamily: T.font }}>
                    {t('support.topicLabel')}
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {TOPICS.map((key) => {
                      const active = topic === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTopic(key)}
                          style={{
                            fontFamily: T.font, fontSize: 13, fontWeight: active ? 700 : 500,
                            padding: '7px 14px', borderRadius: 100, cursor: 'pointer',
                            background: active ? T.pink : '#fff',
                            color: active ? '#fff' : T.dark,
                            border: `1.5px solid ${active ? T.pink : '#e0e0e0'}`,
                            transition: 'background 120ms ease, border-color 120ms ease',
                          }}
                        >
                          {t(`support.topics.${key}`)}
                        </button>
                      );
                    })}
                  </div>

                  <p style={{ fontSize: 13, color: T.muted, marginBottom: 6, fontFamily: T.font }}>
                    {t('support.messageLabel')}
                  </p>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                    placeholder={t('support.messagePlaceholder')}
                    rows={5}
                    style={{
                      background: '#ffffff', borderRadius: 12, border: '1px solid #e0e0e0',
                      fontFamily: T.font, fontSize: 14, color: T.dark, padding: '12px 14px',
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      outline: 'none', lineHeight: 1.5,
                    }}
                  />
                  <p style={{ fontSize: 12, color: T.muted, textAlign: 'right', marginTop: 4, marginBottom: 12, fontFamily: T.font }}>
                    {message.length}/{MESSAGE_MAX}
                  </p>

                  {/* Поле контакта только для гостя: у авторизованного уже есть
                      e-mail, и лишнее поле просто удлиняет форму. */}
                  {needsContact && (
                    <>
                      <p style={{ fontSize: 13, color: T.muted, marginBottom: 6, fontFamily: T.font }}>
                        {t('support.contactLabel')}
                      </p>
                      <input
                        value={contact}
                        onChange={(e) => setContact(e.target.value.slice(0, 120))}
                        placeholder={t('support.contactPlaceholder')}
                        style={{
                          background: '#ffffff', borderRadius: 12, border: '1px solid #e0e0e0',
                          fontFamily: T.font, fontSize: 14, color: T.dark, padding: '12px 14px',
                          width: '100%', boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </>
                  )}

                  {error && (
                    <p style={{ fontFamily: T.font, fontSize: 13, color: '#c0392b', marginTop: 12, lineHeight: 1.5 }}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!canSend}
                    style={{
                      width: '100%', marginTop: 16, background: T.pink, color: '#fff',
                      borderRadius: 100, padding: '13px 20px', fontFamily: T.font,
                      fontWeight: 700, fontSize: 15, border: 'none',
                      cursor: canSend ? 'pointer' : 'default', opacity: canSend ? 1 : 0.45,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    {sending ? t('support.sending') : t('support.submit')}
                  </button>

                  <p style={{ fontFamily: T.font, fontSize: 12.5, color: T.muted, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
                    {t('support.orDirect')}{' '}
                    <a href={SUPPORT_BOT_URL} target="_blank" rel="noreferrer" style={{ color: '#229ED9', fontWeight: 700 }}>
                      {t('support.orDirectLink')}
                    </a>
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * Кнопка, открывающая окно поддержки. Варианты оформления:
 *   link  — текстовая ссылка (футер лендинга);
 *   quiet — мелкая подчёркнутая ссылка (кабинет, страница оплаты);
 *   card  — заметная карточка-кнопка (экран «оплата не прошла»).
 */
export function SupportTrigger({ variant = 'link', defaultTopic = 'other', label, style = {}, className = '' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const variants = {
    link: {
      color: T.muted, fontSize: 14, background: 'none', border: 'none',
      padding: 0, cursor: 'pointer', fontFamily: T.font,
    },
    quiet: {
      color: T.muted, fontSize: 13, background: 'none', border: 'none',
      padding: 0, cursor: 'pointer', fontFamily: T.font, textDecoration: 'underline',
    },
    card: {
      display: 'block', width: '100%', background: '#fff', color: T.dark,
      borderRadius: 100, padding: '12px 28px', fontFamily: T.font, fontWeight: 700,
      fontSize: 15, border: `1.5px solid ${T.pinkBorder}`, cursor: 'pointer',
    },
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={{ ...variants[variant], ...style }}
      >
        {label || t('support.trigger')}
      </button>
      <SupportDialog open={open} onClose={() => setOpen(false)} defaultTopic={defaultTopic} />
    </>
  );
}

export default SupportDialog;
