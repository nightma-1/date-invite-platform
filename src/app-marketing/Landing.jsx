import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MOODS, templatesForMood, getTemplateTokens } from '../templates/registry.js';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';

const STEPS = [
  { n: '01', t: 'Создай', d: 'Выбери шаблон, напиши вопрос, добавь GIF — 3 минуты.' },
  { n: '02', t: 'Отправь', d: 'Одна ссылка в любой мессенджер.' },
  { n: '03', t: 'Узнай ответ', d: 'Она пройдёт интерактивный сценарий и ответит.' },
];

const GIFS = [
  'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif',
  'https://media.giphy.com/media/xT9IgDeNrJB2yUUEeQ/giphy.gif',
  'https://media.giphy.com/media/l41YtZOb9EUABnuqA/giphy.gif',
  'https://media.giphy.com/media/3o6Zt8A3kNKnCnWp9m/giphy.gif',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/3oEjHB1EKuujDjYoRi/giphy.gif',
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
  const t = getTemplateTokens('romantic');
  const [mood, setMood] = useState('romantic');
  const [openFaq, setOpenFaq] = useState(null);
  const templates = templatesForMood(mood);

  const btnStyle = {
    background: t.berry, color: '#fff', padding: '14px 28px',
    borderRadius: 6, fontWeight: 700, fontSize: 15,
    fontFamily: t.fontUI, border: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ background: t.bg, minHeight: '100vh', fontFamily: t.fontUI }}>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(160deg, #FDF0F3 55%, #F8E8ED)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 40, alignItems: 'center' }}>
            <div style={{ maxWidth: 520 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.berry, marginBottom: 12 }}>
                Приглашение на свидание
              </p>
              <h1 style={{ fontFamily: t.fontDisplay, color: t.ink, fontSize: 42, fontWeight: 700, lineHeight: 1.1, marginBottom: 16 }}>
                Не просто спроси её.
                <br />
                <span style={{ color: t.berry }}>Удиви её.</span>
              </h1>
              <p style={{ color: t.inkMuted, fontSize: 16, lineHeight: 1.6, marginBottom: 28, maxWidth: 400 }}>
                5 шаблонов, встроенные GIF, убегающая кнопка «Нет» — за 3 минуты и одну ссылку.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Link to="/builder">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={btnStyle}>
                    Создать приглашение
                  </motion.button>
                </Link>
                <Link to="/dashboard">
                  <button style={{ ...btnStyle, background: 'transparent', color: t.ink, border: '1px solid #2A1F2B25' }}>
                    Мои приглашения
                  </button>
                </Link>
              </div>
            </div>
            <div style={{ width: 300 }}>
              <QuestionScreen
                recipientName="Муниса"
                questionText="Пойдёшь со мной на свидание этим вечером? 🌙"
                tokens={t}
                onYes={() => {}}
              />
              <p style={{ textAlign: 'center', fontSize: 12, color: t.inkMuted, marginTop: 10 }}>
                ↑ Нажми «Нет» — она убегает
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ШАГИ */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{
              paddingRight: i < 2 ? 32 : 0,
              paddingLeft: i > 0 ? 32 : 0,
              borderRight: i < 2 ? '1px solid #2A1F2B12' : 'none',
            }}>
              <span style={{ display: 'block', fontSize: 48, fontFamily: t.fontDisplay, color: t.berry, fontWeight: 700, lineHeight: 1, marginBottom: 12 }}>
                {s.n}
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: t.ink, marginBottom: 6 }}>{s.t}</h3>
              <p style={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.6 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GIF ГАЛЕРЕЯ */}
      <section style={{ background: '#FDF8FA', padding: '64px 0' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px' }}>
          <h2 style={{ fontFamily: t.fontDisplay, color: t.ink, fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            GIF в приглашении
          </h2>
          <p style={{ color: t.inkMuted, fontSize: 15, marginBottom: 24 }}>
            6 встроенных GIF + загрузи своё фото или анимацию до 5 МБ
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {GIFS.map((gif, i) => (
              <div key={i} style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '1' }}>
                <img src={gif} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ШАБЛОНЫ */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <h2 style={{ fontFamily: t.fontDisplay, color: t.ink, fontSize: 32, fontWeight: 700 }}>5 шаблонов</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOODS.map((m) => {
              const a = mood === m.id;
              return (
                <button key={m.id} type="button" onClick={() => setMood(m.id)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 13,
                  border: `1.5px solid ${a ? t.berry : t.ink + '25'}`,
                  background: a ? t.berry : 'transparent',
                  color: a ? '#fff' : t.ink,
                  fontWeight: a ? 600 : 400, cursor: 'pointer', fontFamily: t.fontUI,
                }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {templates.map((tpl) => (
            <motion.div key={tpl.id} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
              <button type="button" onClick={() => navigate(`/builder?template=${tpl.id}`)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{ background: tpl.bg, borderRadius: 8, overflow: 'hidden', border: `1px solid ${tpl.ink}12` }}>
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
                    Выбрать шаблон →
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ЦЕНА */}
      <section style={{ background: t.ink }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.berry, marginBottom: 12 }}>
            Один раз
          </p>
          <p style={{ fontFamily: t.fontDisplay, color: '#fff', fontSize: 56, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
            19 000
          </p>
          <p style={{ color: '#fff', opacity: 0.5, fontSize: 18, marginBottom: 20 }}>сум</p>
          <div style={{ color: '#fff', opacity: 0.7, fontSize: 14, marginBottom: 28, lineHeight: 2.2 }}>
            <p>✓ 7 дней онлайн</p>
            <p>✓ 3 дня на редактирование</p>
            <p>✓ Без подписки</p>
            <p>✓ Ответ в реальном времени</p>
          </div>
          <Link to="/builder">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={btnStyle}>
              Создать приглашение
            </motion.button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '64px 20px' }}>
        <h2 style={{ fontFamily: t.fontDisplay, color: t.ink, fontSize: 32, fontWeight: 700, marginBottom: 24 }}>
          Вопросы
        </h2>
        {FAQ.map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${t.ink}15` }}>
            <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.fontUI }}>
              <span style={{ color: t.ink, fontWeight: 500, fontSize: 15, textAlign: 'left' }}>{item.q}</span>
              <span style={{ color: t.inkMuted, fontSize: 18, marginLeft: 12 }}>{openFaq === i ? '−' : '+'}</span>
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
                  <p style={{ paddingBottom: 16, color: t.inkMuted, fontSize: 14, lineHeight: 1.6 }}>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${t.ink}12`, padding: '24px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700, fontSize: 16 }}>Senti</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link to="/builder" style={{ color: t.inkMuted, textDecoration: 'none', fontSize: 14 }}>Создать</Link>
            <Link to="/dashboard" style={{ color: t.inkMuted, textDecoration: 'none', fontSize: 14 }}>Мои приглашения</Link>
            <Link to="/admin" style={{ color: t.inkMuted, textDecoration: 'none', fontSize: 14 }}>Админ</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
