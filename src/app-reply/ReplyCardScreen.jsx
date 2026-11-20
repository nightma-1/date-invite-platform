/**
 * © 2026 Senti. Все права защищены.
 * Страница ответной открытки у него: конверт → билет → «Принимаю» / «Жду встречи».
 * Ответ пишется обычным submit_response — автору открытки (ей) уходит
 * уведомление, если она подключила бота.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';
import ReplyTicket from './ReplyTicket.jsx';

export default function ReplyCardScreen({ slug, tokens }) {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('reply_card', { p_slug: slug }).then(({ data: d }) => { if (!cancelled) setData(d || null); });
    return () => { cancelled = true; };
  }, [slug]);

  if (data === undefined) return null;
  if (!data) return null;
  const lang = ['ru', 'uz', 'en'].includes(data.card?.lang) ? data.card.lang : 'ru';

  async function onAnswer({ condition, attempts }) {
    track('reply_card_answer', { condition }, { slug });
    const { error } = await supabase.rpc('submit_response', {
      p_slug: slug, p_selections: { condition }, p_no_attempts: attempts || 0,
    });
    if (error) console.error('reply card answer failed', error);
  }

  return (
    <div style={{ minHeight: '100vh', background: tokens.bg || '#FDF0F3', padding: '36px 16px 48px' }}>
      <div style={{ maxWidth: 380, margin: '0 auto' }}>
        <ReplyTicket
          ticket={data.ticket}
          card={data.card}
          toName={data.to_name}
          lang={lang}
          tokens={tokens}
          interactive
          envelope
          onAnswer={onAnswer}
        />
        <a href="/?utm_source=senti&utm_medium=reply_card" target="_blank" rel="noreferrer"
          style={{ display: 'block', textAlign: 'center', marginTop: 28, fontFamily: tokens.fontUI, fontSize: 12, color: tokens.inkMuted || tokens.ink, opacity: 0.6 }}>
          Senti 💌
        </a>
      </div>
    </div>
  );
}
