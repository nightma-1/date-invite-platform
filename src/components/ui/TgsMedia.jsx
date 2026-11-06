/**
 * © 2026 Senti. Все права защищены.
 *
 * .tgs (анимированный стикер Telegram) — это gzip-нутый Lottie-JSON.
 * Ни <img>, ни <video> его не покажут, поэтому распаковываем (pako) и
 * проигрываем через lottie-web.
 *
 * Плеер и распакованные анимации грузятся лениво: пока на странице нет ни
 * одного .tgs, в бандл ничего лишнего не приезжает. Сами данные кэшируются
 * по URL — в библиотеке один и тот же стикер часто рисуется несколько раз.
 */

import { useEffect, useRef, useState } from 'react';

let playerPromise = null;

function loadPlayer() {
  if (!playerPromise) {
    playerPromise = Promise.all([
      import('lottie-web/build/player/lottie_light.js'),
      import('pako'),
    ]).then(([lottieMod, pakoMod]) => ({
      lottie: lottieMod.default || lottieMod,
      pako: pakoMod.default || pakoMod,
    }));
  }
  return playerPromise;
}

const dataCache = new Map();

function loadTgsData(url) {
  if (!dataCache.has(url)) {
    const promise = (async () => {
      const [{ pako }, response] = await Promise.all([loadPlayer(), fetch(url)]);
      if (!response.ok) throw new Error(`TGS ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Сигнатура gzip — 1f 8b. Некоторые источники отдают уже распакованный
      // Lottie-JSON под тем же расширением, поэтому проверяем, а не гадаем.
      const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const text = isGzip ? pako.ungzip(bytes, { to: 'string' }) : new TextDecoder().decode(bytes);
      return JSON.parse(text);
    })();
    promise.catch(() => dataCache.delete(url));
    dataCache.set(url, promise);
  }
  return dataCache.get(url);
}

export default function TgsMedia({ src, style, className, objectFit, onError, ...rest }) {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let animation = null;
    let cancelled = false;
    setFailed(false);

    (async () => {
      try {
        const [{ lottie }, animationData] = await Promise.all([loadPlayer(), loadTgsData(src)]);
        if (cancelled || !hostRef.current) return;
        animation = lottie.loadAnimation({
          container: hostRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: {
            preserveAspectRatio: objectFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet',
          },
        });
      } catch (err) {
        if (cancelled) return;
        setFailed(true);
        onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [src, objectFit, onError]);

  if (failed) return null;

  return <div ref={hostRef} className={className} style={{ ...style, overflow: 'hidden' }} {...rest} />;
}
