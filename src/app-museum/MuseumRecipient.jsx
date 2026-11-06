/**
 * © 2026 Senti. Все права защищены.
 *
 * Музей по ссылке получателя. Данные приходят через get_museum: таблица
 * museum_content закрыта, чтобы личные фото нельзя было выгрузить списком.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import './museumI18n.js';
import { supabase } from '../lib/supabaseClient.js';
import MuseumExperience from './MuseumExperience.jsx';

export function toExperienceData(row) {
  return {
    recipientName: row.recipient_name,
    authorName: row.author_name,
    dedication: row.dedication,
    signature: row.signature,
    videoUrl: row.video_url,
    photos: row.photos,
  };
}

export default function MuseumRecipient({ slug }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_museum', { p_slug: slug }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || !data.photos?.length) setState({ status: 'missing' });
      else setState({ status: 'ready', data: toExperienceData(data) });
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (state.status === 'loading') return <div style={{ minHeight: '100dvh', background: '#2b1320' }} />;
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
  return <MuseumExperience data={state.data} mode="live" slug={slug} localRoom={params.has('localroom')} />;
}
