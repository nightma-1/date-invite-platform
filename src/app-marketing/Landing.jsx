/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MOODS, templatesForMood, getTemplateTokens } from '../templates/registry.js';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';
import { T } from '../app-builder/BuilderUI.jsx';
import { listActiveGifs } from '../lib/mediaLibrary.js';

const STEPS = [
  { n: '01', t: 'Создай', d: 'Выбери картинку, напиши вопрос, добавь GIF — 3 минуты.' },
  { n: '02', t: 'Отправь', d: 'Одна ссылка в любой мессенджер.' },
  { n: '03', t: 'Узнай ответ', d: 'Она пройдёт сценарий и ответит.' },
];

const FAQ = [
  { q: 'Нужно ли ей регистрироваться?', a: 'Нет. Просто открывает ссылку.' },
  { q: 'Сколько действует ссылка?', a: '7 дней с момента публикации.' },
  { q: 'Можно ли изменить?', a: 'Да, в течение 3 дней после публикации.' },
  { q: 'Можно загрузить своё фото или GIF?', a: 'Да, до 5 МБ (JPG, PNG, WebP, GIF).' },
  { q: 'Как узнаю об ответе?', a: 'Ответ появится в «Моих приглашениях».' },
];

export default function Landing() {
  const navigate = useNavigate();
  const previewTokens = getTemplateTokens('romantic');
  const [mood, setMood] = useState('romantic');
  const [openFaq, setOpenFaq] = useState(null);
  const [landingGifs, setLandingGifs] = useState([]);
  const templates = templatesForMood(mood);

  useEffect(() => {
    listActiveGifs().then((all) => setLandingGifs(all.slice(0, 6))).catch(() => {});
  }, []);

  const primaryBtn = {
    background: T.pink, color: '#fff', padding: '15px 28px',
    borderRadius: 100, fontWeight: 700, fontSize: 15,
    fontFamily: T.font, border: 'none', cursor: 'pointer',
    boxShadow: `0 10px 24px ${T.pink}35`,
  };

  const ghostBtn = {
    ...primaryBtn, background: 'white', color: T.dark,
    border: `1.5px solid ${T.pinkBorder}`, boxShadow: 'none',
  };

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font, overflowX: 'hidden' }}>

      {/* HERO */}
      <section style={{
        background: `linear-gradient(165deg, #ffffff 0%, ${T.pinkLight} 60%, #ffeef5 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Тёплый декор — те же сердечки/пятна, что и в билдере */}
        <div style={{ position: 'absolute', top: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: T.pinkMid, opacity: 0.5, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, right: -60, width: 160, height: 160, borderRadius: '50%', background: T.pinkMid, opacity: 0.4, pointerEvents: 'none' }} />
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: '10%', left: '6%', fontSize: 22, opacity: 0.45, pointerEvents: 'none' }}
        >💗</motion.span>
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, 12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          style={{ position: 'absolute', top: '55%', right: '4%', fontSize: 20, opacity: 0.4, pointerEvents: 'none' }}
        >✨</motion.span>

        <div className="mx-auto max-w-[1040px] px-5 py-14 sm:py-16 lg:py-20" style={{ position: 'relative', zIndex: 1 }}>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_340px] lg:gap-12">
            <div className="text-center lg:text-left">
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.pink, marginBottom: 14 }}>
                💌 Приглашение на свидание
              </p>
              <h1 className="text-[34px] leading-[1.15] sm:text-[44px] lg:text-[50px]" style={{ fontFamily: T.font, color: T.darkPurple, fontWeight: 700, marginBottom: 16 }}>
                Не просто спроси её.
                <br />
                <span style={{ color: T.pink }}>Удиви её.</span>
              </h1>
              <p className="mx-auto lg:mx-0" style={{ color: T.muted, fontSize: 16, lineHeight: 1.6, marginBottom: 28, maxWidth: 420 }}>
                Тёплая картинка, свой вопрос и убегающая кнопка «Нет» — приглашение готово за 3 минуты и одну ссылку.
              </p>
              <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link to="/builder">
                  <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} style={primaryBtn}>
                    Создать приглашение
                  </motion.button>
                </Link>
                <Link to="/dashboard">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={ghostBtn}>
                    Мои приглашения
                  </motion.button>
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[280px] sm:max-w-[300px] lg:mx-0 lg:max-w-none lg:w-[300px]">
              <QuestionScreen
                recipientName="Муниса"
                questionText="Пойдёшь со мной на свидание этим вечером? 🌙"
                tokens={previewTokens}
                onYes={() => {}}
              />
              <p style={{ textAlign: 'center', fontSize: 12, color: T.muted, marginTop: 10 }}>
                ↑ Нажми «Нет» — она убегает
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ШАГИ */}
      <section className="mx-auto max-w-[1040px] px-5 py-14 sm:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((s, i) => (
            <div key={s.n} className="sm:[&:not(:first-child)]:pl-8 sm:[&:not(:last-child)]:pr-8 sm:[&:not(:last-child)]:border-r" style={{ borderColor: `${T.dark}12` }}>
              <span style={{ display: 'block', fontSize: 44, fontFamily: T.font, color: T.pink, fontWeight: 700, lineHeight: 1, marginBottom: 12 }}>
                {s.n}
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: T.dark, marginBottom: 6, fontFamily: T.font }}>{s.t}</h3>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GIF ГАЛЕРЕЯ */}
      <section style={{ background: T.pinkLight, padding: '56px 0' }} className="sm:py-16">
        <div className="mx-auto max-w-[1040px] px-5">
          <h2 style={{ fontFamily: T.font, color: T.darkPurple, fontSize: 26, fontWeight: 700, marginBottom: 8 }} className="sm:text-[32px]">
            GIF в приглашении
          </h2>
          <p style={{ color: T.muted, fontSize: 15, marginBottom: 24 }}>
            Библиотека живых гифок + загрузи своё фото или анимацию до 5 МБ
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {landingGifs.length > 0
              ? landingGifs.map((gif) => (
                  <div key={gif.id} style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '1', boxShadow: `0 6px 16px ${T.pink}18` }}>
                    <img src={gif.url} alt={gif.title || 'gif'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  </div>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 14, aspectRatio: '1', background: T.pinkMid, opacity: 0.5 }} />
                ))
            }
          </div>
        </div>
      </section>

      {/* ШАБЛОНЫ */}
      <section className="mx-auto max-w-[1040px] px-5 py-14 sm:py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 style={{ fontFamily: T.font, color: T.darkPurple, fontSize: 26, fontWeight: 700 }} className="sm:text-[32px]">Настроения приглашения</h2>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => {
              const a = mood === m.id;
              return (
                <button key={m.id} type="button" onClick={() => setMood(m.id)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 13,
                  border: `1.5px solid ${a ? T.pink : T.dark + '25'}`,
                  background: a ? T.pink : 'transparent',
                  color: a ? '#fff' : T.dark,
                  fontWeight: a ? 600 : 400, cursor: 'pointer', fontFamily: T.font,
                }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => (
            <motion.div key={tpl.id} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
              <button type="button" onClick={() => navigate(`/builder?template=${tpl.id}`)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{ background: tpl.bg, borderRadius: 16, overflow: 'hidden', border: `1px solid ${tpl.ink}12` }}>
                  <div style={{ padding: '20px 20px 0' }}>
                    <div style={{ height: 4, width: 32, borderRadius: 2, background: tpl.berry, marginBottom: 12 }} />
                    <p style={{ fontFamily: tpl.fontDisplay, color: tpl.ink, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{tpl.name}</p>
                    <p style={{ fontFamily: tpl.fontUI, color: tpl.inkMuted || tpl.ink, fontSize: 13 }}>
                      Пойдёшь со мной на свидание?
                    </p>
                  </div>
                  <div style={{ padding: '14px 20px 16px', display: 'flex', gap: 8 }}>
                    <div style={{ background: tpl.berry, color: '#fff', padding: '7px 16px', borderRadius: 4, fontFamily: tpl.fontUI, fontSize: 13, fontWeight: 600 }}>Да</div>
                    <div style={{ border: `1px solid ${tpl.ink}35`, color: tpl.inkMuted || tpl.ink, padding: '7px 16px', borderRadius: 4, fontFamily: tpl.fontUI, fontSize: 13 }}>Нет</div>
                  </div>
                  <div style={{ borderTop: `1px solid ${tpl.ink}10`, padding: '10px 20px', fontFamily: tpl.fontUI, fontSize: 12, color: tpl.berry, fontWeight: 600 }}>
                    Выбрать настроение →
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ЦЕНА */}
      <section style={{ background: `linear-gradient(160deg, ${T.darkPurple}, #1a0f1a)`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: T.pink, opacity: 0.15, pointerEvents: 'none' }} />
        <div className="mx-auto max-w-[480px] px-5 py-14 text-center sm:py-16" style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.pink, marginBottom: 12 }}>
            Один раз, без подписки
          </p>
          <p className="text-[44px] sm:text-[56px]" style={{ fontFamily: T.font, color: '#fff', fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
            19 000
          </p>
          <p style={{ color: '#fff', opacity: 0.55, fontSize: 18, marginBottom: 24, fontFamily: T.font }}>сум</p>
          <div style={{ color: '#fff', opacity: 0.8, fontSize: 14, marginBottom: 28, lineHeight: 2.2, fontFamily: T.font }}>
            <p>✓ 7 дней онлайн</p>
            <p>✓ 3 дня на редактирование</p>
            <p>✓ Без подписки</p>
            <p>✓ Ответ в реальном времени</p>
          </div>
          <Link to="/builder">
            <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} style={primaryBtn}>
              Создать приглашение
            </motion.button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[720px] px-5 py-14 sm:py-16">
        <h2 style={{ fontFamily: T.font, color: T.darkPurple, fontSize: 26, fontWeight: 700, marginBottom: 24 }} className="sm:text-[32px]">
          Вопросы
        </h2>
        {FAQ.map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${T.dark}15` }}>
            <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, textAlign: 'left' }}>
              <span style={{ color: T.dark, fontWeight: 500, fontSize: 15 }}>{item.q}</span>
              <span style={{ color: T.pink, fontSize: 20, marginLeft: 12, flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
            </button>
            <AnimatePresence>
              {openFaq === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  <p style={{ paddingBottom: 16, color: T.muted, fontSize: 14, lineHeight: 1.6 }}>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${T.dark}12`, padding: '24px 20px' }}>
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-center gap-4 sm:justify-between" style={{ textAlign: 'center' }}>
          <span style={{ fontFamily: T.font, color: T.darkPurple, fontWeight: 700, fontSize: 17 }}>Senti ❤️</span>
          <div className="flex flex-wrap justify-center gap-5">
            <Link to="/builder" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>Создать</Link>
            <Link to="/dashboard" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>Мои приглашения</Link>
            <Link to="/admin" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>Админ</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
