/**
 * © 2026 Senti. Все права защищены.
 *
 * Музей по ссылке получателя. Данные приходят через get_museum: таблица
 * museum_content закрыта, чтобы личные фото нельзя было выгрузить списком.
 */

import { useEffect, useState } from 'react';
import i18n from './museumI18n.js';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import MuseumExperience from './MuseumExperience.jsx';

export function toExperienceData(row) {
  return {
    recipientName: row.recipient_name,
    recipientGender: row.recipient_gender,
    authorName: row.author_name,
    dedication: row.dedication,
    signature: row.signature,
    videoUrl: row.video_url,
    photos: row.photos,
    theme: row.theme,
    voiceUrl: row.voice_url,
    songUrl: row.song_url,
    ambient: row.ambient,
    finaleQuestion: row.finale_question,
    hearts: row.hearts,
    guestbook: row.guestbook,
    guestPhotos: row.guest_photos,
  };
}

function Countdown({ opensAt, name, onOpen, t }) {
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, new Date(opensAt).getTime() - now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left === 0) onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0]);
  const total = Math.floor(left / 1000);
  const parts = [
    [Math.floor(total / 86400), t('museum.world.days')],
    [Math.floor(total / 3600) % 24, t('museum.world.hours')],
    [Math.floor(total / 60) % 60, t('museum.world.minutes')],
    [total % 60, t('museum.world.seconds')],
  ];
  const date = new Date(opensAt).toLocaleString(undefined, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  return (
    <div data-testid="countdown" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'radial-gradient(120% 90% at 50% 20%, #7c2c4a 0%, #2b1320 70%)', color: '#fff8f0', textAlign: 'center', fontFamily: 'Manrope, sans-serif' }}>
      <div>
        <p style={{ margin: 0, color: '#d9b26f', fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t('museum.world.coverKicker')}</p>
        <h1 style={{ margin: '14px 0 22px', fontFamily: '"Cormorant Garamond", serif', fontSize: 'clamp(34px, 8vw, 50px)', lineHeight: 1.08 }}>{t('museum.world.waitTitle', { name })}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          {parts.map(([value, label]) => (
            <div key={label} style={{ width: 70, padding: '12px 0', borderRadius: 14, background: 'rgba(255,255,255,.1)' }}>
              <b style={{ display: 'block', fontSize: 28 }}>{value}</b>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: '20px 0 0', fontSize: 14, opacity: 0.75 }}>{t('museum.world.waitText', { date })}</p>
      </div>
    </div>
  );
}

// Язык автора, пока получатель не выбрал свой на обложке
function applyAuthorLanguage(lang, slug) {
  const key = `senti-museum-lang-${slug}`;
  try {
    if (!lang || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* приватный режим: просто применим язык */ }
  i18n.changeLanguage(lang);
}

export default function MuseumRecipient({ slug, ownerId }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });

  const [attempt, setAttempt] = useState(0);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsOwner(Boolean(ownerId) && data.session?.user?.id === ownerId));
  }, [ownerId]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_museum', { p_slug: slug }).then(({ data, error }) => {
      if (cancelled) return;
      if (data?.lang) applyAuthorLanguage(data.lang, slug);
      if (data?.locked) {
        setState({ status: 'locked', opensAt: data.opens_at, name: data.recipient_name });
        supabase.auth.getSession().then(({ data: auth }) => {
          if (auth.session?.user?.id !== ownerId) supabase.rpc('museum_mark_early', { p_slug: slug }).then(() => {});
        });
      }
      else if (error || !data || !data.photos?.length) setState({ status: 'missing' });
      else setState({ status: 'ready', data: toExperienceData(data) });
    });
    return () => { cancelled = true; };
  }, [slug, attempt]);

  if (state.status === 'loading') return <div style={{ minHeight: '100dvh', background: '#2b1320' }} />;
  if (state.status === 'locked') {
    return <Countdown opensAt={state.opensAt} name={state.name} t={t} onOpen={() => setTimeout(() => setAttempt((n) => n + 1), 1200)} />;
  }
  if (state.status === 'missing') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#2b1320', color: '#fff8f0', textAlign: 'center', fontFamily: 'Manrope, sans-serif' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontFamily: '"Cormorant Garamond", serif', fontSize: 38 }}>{t('museum.world.notFoundTitle')}</h1>
          <p style={{ margin: 0 }}>{t('museum.world.notFoundText')}</p>
        </div>
      </div>
    );
  }
  return <MuseumExperience data={state.data} mode="live" slug={slug} isOwner={isOwner} localRoom={params.has('localroom')} />;
}
