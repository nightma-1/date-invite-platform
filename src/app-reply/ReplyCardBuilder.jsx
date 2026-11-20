/**
 * © 2026 Senti. Все права защищены.
 *
 * /reply/:slug — девушка отвечает на приглашение (slug — исходное приглашение).
 * Билет собирается сам из её ответа (reply_ticket), она пишет пару слов,
 * по желанию выбирает шутливое условие и записывает голосовое. Бесплатно:
 * сервер проверяет, что это настоящий ответ (api/click/create.js →
 * replyDiscountAllowed), и публикует без оплаты. Автору уходит уведомление
 * (триггер trg_reply_published_notify).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';
import { getTemplateTokens } from '../templates/registry.js';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';
import AuthGate from '../app-builder/AuthGate.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import ShareToTelegram from '../components/ui/ShareToTelegram.jsx';
import VoiceRecorder from '../app-museum/VoiceRecorder.jsx';
import ReplyTicket, { CONDITION_PRESETS, DEFAULT_NOTE } from './ReplyTicket.jsx';

const LANGS = ['ru', 'uz', 'en'];

function newSlug() {
  return Math.random().toString(36).slice(2, 10);
}

const field = {
  width: '100%', padding: '12px 14px', borderRadius: 14, border: `1.5px solid ${T.pinkBorder}`,
  fontFamily: T.font, fontSize: 14, color: T.dark, background: '#fff', outline: 'none',
};
const label = { display: 'block', fontFamily: T.font, fontWeight: 700, fontSize: 13, color: T.darkPurple, margin: '16px 0 6px' };
const chip = (on) => ({
  padding: '8px 12px', borderRadius: 100, fontFamily: T.font, fontSize: 13, cursor: 'pointer',
  border: `1.5px solid ${on ? T.pink : T.pinkBorder}`, background: on ? T.pink : '#fff', color: on ? '#fff' : T.dark,
});
const ghost = {
  background: '#fff', color: T.darkPurple, border: `1.5px solid ${T.pinkBorder}`, borderRadius: 100,
  padding: '9px 16px', fontFamily: T.font, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};

export default function ReplyCardBuilder() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [ticket, setTicket] = useState(undefined); // undefined — грузим, null — нельзя ответить
  const [hisName, setHisName] = useState('');
  const [note, setNote] = useState('');
  const [condition, setCondition] = useState('');
  const [ownCondition, setOwnCondition] = useState(false);
  const [voice, setVoice] = useState(null); // { blob, url }
  const [error, setError] = useState(null);
  const [askLogin, setAskLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { slug }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    track('reply_card_open', {}, { slug });
    supabase.rpc('reply_ticket', { p_slug: slug }).then(({ data }) => {
      if (cancelled) return;
      if (!data?.answered_yes) { setTicket(null); return; }
      setTicket(data);
      const lang = LANGS.includes(data.lang) ? data.lang : 'ru';
      setHisName(String(data.his_name || '').trim());
      setNote(DEFAULT_NOTE[lang]);
    });
    return () => { cancelled = true; };
  }, [slug]);

  const lang = LANGS.includes(ticket?.lang) ? ticket.lang : 'ru';
  const tokens = useMemo(() => getTemplateTokens(ticket?.template_key), [ticket?.template_key]);
  const card = { lang, note: note.trim(), condition: condition.trim(), voice_url: voice?.previewUrl || null };

  // Строки VoiceRecorder (он из музея) — подменяем на свои
  const voiceT = (key, opts) => t(`replyBuilder.voice.${key.split('.').pop()}`, opts);

  async function publish() {
    setError(null);
    if (!hisName.trim()) { setError(t('replyBuilder.nameRequired')); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) { setAskLogin(true); return; }
    setBusy(true);
    track('reply_card_publish_click', { condition: Boolean(card.condition), voice: Boolean(voice) }, { slug });
    try {
      const userId = session.user.id;
      let voiceUrl = null;
      if (voice?.blob) {
        const type = (voice.blob.type || 'audio/mp4').split(';')[0];
        const ext = type.split('/')[1].replace(/[^a-z0-9]/g, '') || 'm4a';
        const path = `${userId}/reply-voice-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('invitation-media')
          .upload(path, voice.blob, { contentType: type, cacheControl: '31536000', upsert: false });
        if (upErr) throw upErr;
        voiceUrl = supabase.storage.from('invitation-media').getPublicUrl(path).data.publicUrl;
      }
      // id не передаём: права на запись колонки id у клиента нет (её ставит
      // база), с ним вставка падает «permission denied for table invitations».
      const row = {
        user_id: userId,
        slug: newSlug(),
        template_key: ticket.template_key || 'romantic',
        mood: ticket.template_key || 'romantic',
        card_shape: 'polaroid',
        recipient_name: hisName.trim().slice(0, 40),
        sender_name: String(ticket.her_name || '').slice(0, 40) || null,
        reply_to: ticket.invitation_id,
        reply_kind: 'card',
        reply_card: { ...card, voice_url: voiceUrl },
        status: 'draft',
      };
      const { data: inv, error: insErr } = await supabase.from('invitations').insert(row).select('id, slug').single();
      if (insErr) throw insErr;

      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ invitationId: inv.id, method: 'invoice' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.published) throw new Error(data.error || 'reply publish');
      track('reply_card_published', {}, { slug: data.slug });
      setResult({ slug: data.slug });
    } catch (err) {
      console.error('reply card publish failed', err);
      setError(t('replyBuilder.publishFailed'));
    } finally {
      setBusy(false);
    }
  }

  const page = (children) => (
    <div style={{ minHeight: '100vh', background: `linear-gradient(180deg, #fff 0%, ${T.pinkLight} 60%, #ffeef5 100%)`, position: 'relative', padding: '20px 16px 48px' }}>
      <DecorativeBlobs />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', fontFamily: T.font }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <Link to="/"><img src="/logo.png" alt="Senti" style={{ height: 24 }} /></Link>
          <LanguageSwitcher />
        </div>
        {children}
      </div>
    </div>
  );

  if (ticket === undefined) return page(<p style={{ textAlign: 'center', color: T.muted }}>…</p>);
  if (ticket === null) {
    return page(
      <div style={{ textAlign: 'center', marginTop: 60 }}>
        <div style={{ fontSize: 48 }}>💌</div>
        <p style={{ color: T.darkPurple, fontWeight: 700, marginTop: 10 }}>{t('replyBuilder.notAvailable')}</p>
      </div>,
    );
  }

  if (result) {
    const url = `${window.location.origin}/i/${result.slug}`;
    return page(
      <div style={{ textAlign: 'center', marginTop: 30 }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <h1 style={{ fontWeight: 700, fontSize: 22, color: T.darkPurple, margin: '10px 0 6px' }}>{t('replyBuilder.sentTitle')}</h1>
        <p style={{ color: T.muted, fontSize: 13, marginBottom: 18 }}>{t('replyBuilder.sentText')}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: `1.5px solid ${T.pinkBorder}`, borderRadius: 16, padding: '10px 10px 10px 16px', marginBottom: 14 }}>
          <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{url}</span>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ background: T.pink, color: '#fff', border: 'none', borderRadius: 100, padding: '8px 16px', fontFamily: T.font, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {copied ? t('builder.copied') : t('builder.copy')}
          </button>
        </div>
        <ShareToTelegram url={url} slug={result.slug} />
        <a href={url} target="_blank" rel="noreferrer" style={{ color: T.pink, fontSize: 13 }}>{t('replyBuilder.openCard')}</a>
      </div>,
    );
  }

  return page(
    <>
      <h1 style={{ fontWeight: 700, fontSize: 22, color: T.darkPurple, margin: '0 0 6px', textAlign: 'center' }}>{t('replyBuilder.title')}</h1>
      <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.55, textAlign: 'center', margin: '0 0 18px' }}>{t('replyBuilder.subtitle')}</p>

      <p style={{ ...label, marginTop: 0 }}>{t('replyBuilder.preview')}</p>
      <ReplyTicket ticket={ticket} card={card} toName={hisName} lang={lang} tokens={tokens} />

      <label style={label} htmlFor="reply-his-name">{t('replyBuilder.hisName')}</label>
      <input id="reply-his-name" style={field} value={hisName} maxLength={40} onChange={(e) => setHisName(e.target.value)} placeholder={t('replyBuilder.hisNamePlaceholder')} />

      <label style={label} htmlFor="reply-note">{t('replyBuilder.note')}</label>
      <textarea id="reply-note" style={{ ...field, resize: 'vertical' }} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />

      <p style={label}>{t('replyBuilder.condition')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={chip(!condition && !ownCondition)} onClick={() => { setCondition(''); setOwnCondition(false); }}>{t('replyBuilder.noCondition')}</button>
        {CONDITION_PRESETS[lang].map((c) => (
          <button key={c} type="button" style={chip(condition === c && !ownCondition)} onClick={() => { setCondition(c); setOwnCondition(false); }}>{c}</button>
        ))}
        <button type="button" style={chip(ownCondition)} onClick={() => { setOwnCondition(true); setCondition(''); }}>{t('replyBuilder.ownCondition')}</button>
      </div>
      {ownCondition && (
        <input style={{ ...field, marginTop: 8 }} maxLength={80} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={t('replyBuilder.ownConditionPlaceholder')} />
      )}

      <p style={label}>{t('replyBuilder.voiceTitle')}</p>
      {voice ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={voice.previewUrl} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" style={ghost} onClick={() => setVoice(null)}>{t('replyBuilder.remove')}</button>
        </div>
      ) : (
        <VoiceRecorder styles={{ ghost }} t={voiceT} onError={setError} onDone={(blob) => setVoice({ blob, previewUrl: URL.createObjectURL(blob) })} />
      )}

      {askLogin ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: 16, border: `1.5px solid ${T.pinkBorder}`, marginTop: 20 }}>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 10px' }}>{t('replyBuilder.loginHint')}</p>
          <AuthGate context="checkout" onAuthenticated={() => { setAskLogin(false); publish(); }} />
        </div>
      ) : (
        <button
          type="button" onClick={publish} disabled={busy}
          style={{
            display: 'block', width: '100%', marginTop: 22, background: `linear-gradient(135deg, ${T.pink}, #ff8fb1)`, color: '#fff',
            border: 'none', borderRadius: 100, padding: '15px 24px', fontFamily: T.font, fontWeight: 700, fontSize: 15,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, boxShadow: `0 14px 30px -10px ${T.pink}90`,
          }}
        >
          {busy ? t('replyBuilder.publishing') : t('replyBuilder.publish')}
        </button>
      )}
      {error && <p style={{ color: '#C0392B', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{error}</p>}
    </>,
  );
}
