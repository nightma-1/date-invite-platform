/**
 * © 2026 Senti.
 * Полная сцена galaxy-letter: конверт → письмо → космос, где одна система
 * частиц-слов живёт галактикой и по команде собирается в портрет.
 *
 * Роли шрифтов (специально ограничены, чтобы они не спорили друг с другом):
 *   Comfortaa  — только логотип и монограмма на печати
 *   Caveat     — только рукописное: письмо, подписи, имя на конверте
 *   Cormorant  — имя получателя в финале
 *   Manrope    — весь интерфейс: кнопки, подсказки
 *
 * Компонент сознательно НЕ зарегистрирован в src/templates/registry.js и не
 * подключён к маршрутам конструктора — доступен только через скрытый
 * тестовый маршрут (см. GalaxyLetterLabPage.jsx), пока фича не готова.
 */
import { useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Starfield from './Starfield.jsx';
import TextParticleField from './TextParticleField.jsx';
import EnvelopeScene from './EnvelopeScene.jsx';
import LetterScene from './LetterScene.jsx';
import { getPalette } from './palettes.js';
import { composeStory, recordStory, pickVideoType, FRAMES } from './storyExport.js';
import useParallax from './useParallax.js';
import useAmbientSound from './useAmbientSound.js';

const STAGES = ['envelope', 'letter', 'cosmos'];

// «пролёт камеры» между сценами вместо плоского fade
const fly = {
  initial: { opacity: 0, scale: 0.88, filter: 'blur(6px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 1.25, filter: 'blur(10px)', transition: { duration: 0.55, ease: [0.4, 0, 1, 1] } },
};

export default function GalaxyLetterScene({
  recipientName,
  letterHeading,
  letterParagraphs,
  senderName,
  photoUrl,
  finalCaption,
  finalSubcaption,
  paletteId = 'senti',
  cropZoom,
  cropX,
  cropY,
  sound = true,
  onRestartRequest,
}) {
  const pal = getPalette(paletteId);
  const [stageIndex, setStageIndex] = useState(0);
  const [cosmosPhase, setCosmosPhase] = useState('galaxy');
  const [busy, setBusy] = useState(null);
  const [picker, setPicker] = useState(false);
  // по умолчанию галактика, а не портрет: публиковать чужое лицо — осознанный выбор
  const [frame, setFrame] = useState('galaxy');
  const [videoFailed, setVideoFailed] = useState(false);
  const fieldRef = useRef(null);
  const rootRef = useRef(null);
  const stage = STAGES[stageIndex];

  const parallax = useParallax({ strength: 1 });
  const audio = useAmbientSound();

  const next = () => setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));

  // Касание конверта — единственный момент, когда браузер отдаёт и звук,
  // и гироскоп: оба разрешения требуют жеста пользователя.
  function handleEnvelopeOpen() {
    parallax.enable();
    if (sound) audio.start();
    next();
  }

  function handleSettle(p) {
    const phase = p >= 1 ? 'portrait' : 'galaxy';
    setCosmosPhase(phase);
    if (phase === 'portrait' && sound) audio.chime();
  }

  /** Живые слои сцены: звёздный фон и поле частиц. */
  const sceneCanvases = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll('canvas') || []),
    [],
  );

  /**
   * Снимок сцены в нужной фазе. Чтобы отдать «галактику», когда на экране
   * уже собран портрет, откатываем систему частиц назад, ждём отрисовки и
   * возвращаем как было — человек этого почти не замечает.
   */
  const withPhase = useCallback(async (progress, fn) => {
    const field = fieldRef.current;
    const back = field?.getProgress?.() ?? 1;
    if (field && Math.abs(back - progress) > 0.01) {
      field.setProgress(progress);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    try { return await fn(); } finally {
      if (field && Math.abs(back - progress) > 0.01) field.setProgress(back);
    }
  }, []);

  const buildFrame = useCallback(async (id) => withPhase(id === 'portrait' ? 1 : 0, () => composeStory({
    pal,
    canvases: sceneCanvases(),
    frame: id,
    caption: finalCaption,
    subcaption: finalSubcaption,
    recipientName,
  })), [pal, sceneCanvases, finalCaption, finalSubcaption, recipientName, withPhase]);

  function download(href, name) {
    const a = document.createElement('a');
    a.download = name; a.href = href; a.click();
  }

  const fileBase = (recipientName || 'senti').toLowerCase().replace(/\s+/g, '-');

  async function saveFrame(id) {
    setBusy(id);
    try {
      const canvas = await buildFrame(id);
      download(canvas.toDataURL('image/png'), `${fileBase}-senti.png`);
      setPicker(false);
    } finally { setBusy(null); }
  }

  async function saveVideo() {
    setBusy('video');
    try {
      const res = await recordStory({
        pal,
        canvases: sceneCanvases(),
        field: fieldRef.current,
        caption: finalCaption,
        subcaption: finalSubcaption,
      });
      if (!res) { setVideoFailed(true); return; }
      const url = URL.createObjectURL(res.blob);
      download(url, `${fileBase}-senti.${res.ext}`);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setPicker(false);
    } catch {
      setVideoFailed(true);
    } finally { setBusy(null); }
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      const canvas = await buildFrame(frame);
      const blob = canvas && await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (blob) {
        const file = new File([blob], 'senti.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: finalSubcaption || 'Тебе письмо ✉️' });
          return;
        }
      }
    } catch { /* отменили или файлы не поддерживаются */ }

    if (navigator.share) {
      try { await navigator.share({ title: 'Senti — тебе письмо', text: finalSubcaption || 'Тебе письмо ✉️', url }); return; }
      catch { /* отменили */ }
    }
    if (navigator.clipboard) await navigator.clipboard.writeText(url);
  }

  return (
    <div
      ref={rootRef}
      data-galaxy-letter-root
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: pal.sky[2] }}
    >
      <Starfield
        paletteId={paletteId}
        density={stage === 'cosmos' ? 0.75 : 1}
        nebula
        parallaxX={parallax.x}
        parallaxY={parallax.y}
      />

      <AnimatePresence mode="wait">
        {stage === 'envelope' && (
          <motion.div key="envelope" {...fly} style={{ position: 'absolute', inset: 0 }}>
            <EnvelopeScene recipientName={recipientName} palette={pal} onOpen={handleEnvelopeOpen} />
          </motion.div>
        )}

        {stage === 'letter' && (
          <motion.div key="letter" {...fly} style={{ position: 'absolute', inset: 0 }}>
            <LetterScene
              heading={letterHeading}
              paragraphs={letterParagraphs}
              signature={senderName}
              palette={pal}
              onContinue={next}
            />
          </motion.div>
        )}

        {stage === 'cosmos' && (
          <motion.div key="cosmos" {...fly} style={{ position: 'absolute', inset: 0 }}>
            <TextParticleField
              ref={fieldRef}
              photoUrl={photoUrl}
              paletteId={paletteId}
              cropZoom={cropZoom}
              cropX={cropX}
              cropY={cropY}
              parallaxX={parallax.x}
              parallaxY={parallax.y}
              interactive
              onProgressSettle={handleSettle}
            />

            <AnimatePresence>
              {cosmosPhase === 'galaxy' && (
                <motion.div
                  key="cta"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: '10%', zIndex: 2,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontFamily: '"Manrope", sans-serif', color: pal.soft, fontSize: 12, opacity: 0.75 }}>
                    покрути галактику в любую сторону
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => { setCosmosPhase('assembling'); fieldRef.current?.animateTo(1, 2200); }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      pointerEvents: 'auto', border: 'none', borderRadius: 999,
                      padding: '13px 30px', background: pal.accent.bg, color: pal.accent.fg,
                      fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', boxShadow: `0 12px 30px -6px ${pal.accent.glow}`,
                    }}
                  >
                    Нажми!
                  </motion.button>
                </motion.div>
              )}

              {cosmosPhase === 'portrait' && (
                <motion.div
                  key="portrait-ui"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ delay: 0.25 }}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: '6%', zIndex: 2,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                    padding: '0 24px', textAlign: 'center',
                  }}
                >
                  {/* пока открыт выбор кадра, подписи прячем — иначе они лежат на лице */}
                  {!picker && (
                  <div>
                    {finalCaption && (
                      // имя собирается из россыпи — те же частицы, что и портрет
                      <div style={{
                        fontFamily: '"Cormorant Garamond", serif', fontSize: 34, color: '#fff',
                        textShadow: `0 0 26px ${pal.accent.glow}`, letterSpacing: 0.5,
                      }}>
                        {[...finalCaption].map((ch, i) => (
                          <motion.span
                            key={i}
                            initial={{
                              opacity: 0, filter: 'blur(8px)', scale: 0.5,
                              x: (Math.random() - 0.5) * 90, y: (Math.random() - 0.5) * 60,
                            }}
                            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1, x: 0, y: 0 }}
                            transition={{ duration: 0.9, delay: 0.5 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            style={{ display: 'inline-block', whiteSpace: 'pre' }}
                          >
                            {ch}
                          </motion.span>
                        ))}
                      </div>
                    )}
                    {finalSubcaption && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 0.9 }}
                        transition={{ delay: 0.6 + (finalCaption?.length || 0) * 0.07 }}
                        style={{ fontFamily: '"Caveat", cursive', fontSize: 19, color: pal.soft, marginTop: 2 }}
                      >
                        {finalSubcaption}
                      </motion.div>
                    )}
                    <div style={{ fontFamily: '"Manrope", sans-serif', fontSize: 10.5, color: pal.soft, opacity: 0.45, marginTop: 10 }}>
                      проведи пальцем вбок, и она снова станет галактикой
                    </div>
                  </div>
                  )}
                  {/* Что именно уйдёт в сторис, решает отправитель. По
                      умолчанию — галактика: она ничего не раскрывает. */}
                  <AnimatePresence>
                    {picker && (
                      <motion.div
                        key="picker"
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        style={{
                          width: '100%', maxWidth: 320, borderRadius: 18, padding: 12,
                          background: 'rgba(20,10,18,0.82)', backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,0.14)', textAlign: 'left',
                        }}
                      >
                        <div style={{ fontFamily: '"Manrope", sans-serif', fontSize: 11, color: pal.soft, opacity: 0.6, marginBottom: 8 }}>
                          что выложить
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          {FRAMES.map((f) => (
                            <button
                              key={f.id} type="button"
                              onClick={() => setFrame(f.id)}
                              style={{
                                flex: 1, borderRadius: 12, padding: '8px 4px', cursor: 'pointer',
                                border: `1px solid ${frame === f.id ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.14)'}`,
                                background: frame === f.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                                color: '#fff', fontFamily: '"Manrope", sans-serif', fontSize: 11.5, fontWeight: 600,
                              }}
                            >
                              {f.label}
                              <div style={{ fontSize: 8.5, fontWeight: 400, opacity: 0.55, marginTop: 2 }}>{f.hint}</div>
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button" onClick={saveVideo} disabled={!!busy || !pickVideoType()}
                            style={{
                              flex: 1, border: 'none', borderRadius: 999, padding: '11px 10px',
                              background: pal.accent.bg, color: pal.accent.fg, fontWeight: 700,
                              fontFamily: '"Manrope", sans-serif', fontSize: 12,
                              cursor: busy ? 'default' : 'pointer', opacity: busy === 'video' ? 0.6 : 1,
                            }}
                          >
                            {busy === 'video' ? 'пишу видео…' : '▶ Видео 6 сек'}
                          </button>
                          <button
                            type="button" onClick={() => saveFrame(frame)} disabled={!!busy}
                            style={{
                              flex: 1, borderRadius: 999, padding: '11px 10px',
                              border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.07)',
                              color: '#fff', fontFamily: '"Manrope", sans-serif', fontSize: 12, fontWeight: 600,
                              cursor: busy ? 'default' : 'pointer', opacity: busy === frame ? 0.6 : 1,
                            }}
                          >
                            {busy === frame ? 'готовлю…' : 'Картинка'}
                          </button>
                        </div>
                        {(videoFailed || !pickVideoType()) && (
                          <div style={{ fontFamily: '"Manrope", sans-serif', fontSize: 10, color: pal.soft, opacity: 0.6, marginTop: 8 }}>
                            Этот браузер не умеет записывать видео — сохрани картинку.
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                    <button
                      type="button" onClick={handleShare}
                      style={{
                        flex: 1, border: 'none', borderRadius: 999, padding: '13px 16px',
                        background: pal.accent.bg, color: pal.accent.fg,
                        fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', boxShadow: `0 12px 28px -8px ${pal.accent.glow}`,
                      }}
                    >
                      Поделиться
                    </button>
                    <button
                      type="button" onClick={() => setPicker((v) => !v)}
                      style={{
                        flex: 1, border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999,
                        padding: '13px 16px', background: 'rgba(255,255,255,0.07)', color: '#fff',
                        fontFamily: '"Manrope", sans-serif', fontWeight: 600, fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {picker ? 'Свернуть' : 'Сохранить себе'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {sound && audio.started && (
        <button
          type="button"
          onClick={audio.toggleMute}
          aria-label={audio.muted ? 'Включить звук' : 'Выключить звук'}
          style={{
            position: 'absolute', top: 14, left: 14, zIndex: 3,
            width: 32, height: 32, borderRadius: 999, cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: 13, lineHeight: 1, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {audio.muted ? '🔇' : '🔊'}
        </button>
      )}

      {stage === 'cosmos' && cosmosPhase === 'portrait' && onRestartRequest && (
        <button
          type="button"
          onClick={onRestartRequest}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 3,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
            color: pal.soft, borderRadius: 999, padding: '6px 12px', fontSize: 11,
            fontFamily: '"Manrope", sans-serif', cursor: 'pointer',
          }}
        >
          ↺ сначала
        </button>
      )}
    </div>
  );
}
