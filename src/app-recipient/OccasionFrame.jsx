/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Поводы (день рождения, «Ты меня простишь?», 8 марта и т.д.) рисует не React,
 * а отдельная страница public/occasion.html — это перенесённый один в один
 * прототип с дождём, колодой карточек и коробкой подарка. Здесь мы только
 * передаём ей настройки повода (в адресе после #) и ловим её сообщения для
 * автора: страница шлёт их через postMessage, а мы сохраняем их тем же
 * submit_response, что и обычные приглашения. Дальше триггер в базе зовёт
 * /api/telegram/notify, и автор получает сообщение в бот.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';

// submit_response отбрасывает selections больше ~4000 байт — держим в
// журнале только последние события и режем длинные тексты.
const LOG_LIMIT = 8;
const TEXT_LIMIT = 280;

export function occasionSrc(occasion) {
  return `/occasion.html#${encodeURIComponent(JSON.stringify(occasion || {}))}`;
}

export default function OccasionFrame({ slug, occasion, isPreview = false, style }) {
  const frameRef = useRef(null);
  const logRef = useRef([]);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const msg = e.data;
      if (!msg || msg.source !== 'senti-occasion' || typeof msg.text !== 'string') return;
      // В превью автор смотрит сам — ничего не сохраняем и в бот не шлём.
      if (isPreview || !slug) return;

      const text = msg.text.slice(0, TEXT_LIMIT);
      logRef.current = [...logRef.current, text].slice(-LOG_LIMIT);
      const selections = { occasion: occasion?.scn || null, last: text, log: logRef.current };
      // Отправляем по очереди: каждый вызов — отдельное уведомление в бот,
      // и порядок сообщений автору должен совпадать с порядком экранов.
      queueRef.current = queueRef.current.then(async () => {
        const { error } = await supabase.rpc('submit_response', {
          p_slug: slug,
          p_selections: selections,
          p_no_attempts: 0,
        });
        if (error) console.error('occasion: submit_response failed', error);
      });
      track('occasion_event', { scn: occasion?.scn || null }, { slug });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [slug, occasion, isPreview]);

  return (
    <iframe
      ref={frameRef}
      title="Senti"
      src={occasionSrc(occasion)}
      allow="autoplay; vibrate"
      style={{ display: 'block', width: '100%', height: isPreview ? '100%' : '100dvh', border: 0, ...style }}
    />
  );
}
