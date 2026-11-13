/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Конструктор поводов: день рождения, «Ты меня простишь?», 8 марта,
 * годовщина, «Горжусь тобой», Новый год. Пока это тест: страница открывается
 * только владельцу сервиса (profiles.is_admin), остальные видят заглушку.
 * Это проверка только для интерфейса — опубликовать без оплаты сервер
 * всё равно даст лишь владельцу (/api/click/create).
 *
 * Экраны получателя рисует public/occasion.html, превью справа — та же
 * страница в рамке, поэтому автор видит ровно то, что получит человек.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { track } from '../lib/analytics.js';
import { inviteShareUrl } from '../lib/shareLink.js';
import AuthGate from './AuthGate.jsx';
import OccasionFrame from '../app-recipient/OccasionFrame.jsx';

const C = {
  ground: '#FFF6F3', surface: '#FFFFFF', blush: '#FFDCE5', ink: '#2A0F20',
  muted: '#7A5E6C', cherry: '#B8204F', line: '#F2D5DE',
};
const DISPLAY = "'Yeseva One', Georgia, serif";
const TEXT = "'Onest', system-ui, sans-serif";

const SCENARIOS = [
  { id: 'bday', label: 'День рождения' },
  { id: 'sorry', label: 'Ты меня простишь?' },
  { id: 'women', label: '8 марта' },
  { id: 'anniv', label: 'Годовщина' },
  { id: 'proud', label: 'Горжусь тобой' },
  { id: 'newyear', label: 'Новый год' },
];

const DEFAULT_WISH = {
  bday: 'Ты человек, рядом с которым любой день становится лучше. Пусть этот год будет таким же тёплым, как ты.',
  women: 'С 8 марта! Пусть будет легко, тепло и много того, что радует.',
  anniv: 'Спасибо, что мы вместе. Каждый из этих дней — мой любимый.',
  proud: 'Я горжусь тобой. Не только результатом — тем, как всё было сделано.',
  newyear: 'С Новым годом! Пусть этот год будет лёгким и щедрым на всё, что ты любишь.',
};

const PEACE_OPTIONS = ['кофе за мной', 'прогулка', 'фильм выбираешь ты', 'молчу весь вечер'];

function generateSlug() {
  return Math.random().toString(36).slice(2, 10);
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function OccasionBuilder() {
  const [auth, setAuth] = useState({ status: 'loading', user: null, isAdmin: false });

  async function loadAuth() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user || null;
    if (!user) {
      setAuth({ status: 'signed_out', user: null, isAdmin: false });
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    setAuth({ status: 'ready', user, isAdmin: Boolean(profile?.is_admin) });
  }
  useEffect(() => {
    loadAuth();
  }, []);

  if (auth.status === 'loading') return <Shell><p style={{ color: C.muted }}>Загружаем…</p></Shell>;
  if (auth.status === 'signed_out') {
    return (
      <Shell>
        <AuthGate onAuthenticated={loadAuth} />
      </Shell>
    );
  }
  if (!auth.isAdmin) {
    return (
      <Shell>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 32, margin: '0 0 12px' }}>Скоро здесь будут новые поводы</h1>
        <p style={{ color: C.muted }}>Пока можно создать приглашение на свидание.</p>
        <Link to="/builder" style={{ color: C.cherry, fontWeight: 600 }}>Создать приглашение →</Link>
      </Shell>
    );
  }
  return <OccasionForm user={auth.user} />;
}

function OccasionForm({ user }) {
  const [scn, setScn] = useState('sorry');
  const [to, setTo] = useState('');
  const [toF, setToF] = useState(true);
  const [from, setFrom] = useState('');
  const [fromF, setFromF] = useState(false);
  const [wishes, setWishes] = useState(DEFAULT_WISH);
  const [age, setAge] = useState('');
  const [gift, setGift] = useState('');
  const [since, setSince] = useState('');
  const [reason, setReason] = useState('');
  const [peace, setPeace] = useState(['прогулка']);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const occasion = useMemo(() => {
    const base = { scn, to: to.trim(), toF, from: from.trim(), fromF };
    if (scn === 'sorry') return { ...base, reason: reason.trim(), peace };
    const extra = { wish: (wishes[scn] || '').trim() };
    if (scn === 'bday') return { ...base, ...extra, age: age.trim(), gift: gift.trim() };
    if (scn === 'anniv') return { ...base, ...extra, since };
    return { ...base, ...extra };
  }, [scn, to, toF, from, fromF, wishes, age, gift, since, reason, peace]);

  const previewOccasion = useDebounced(occasion, 600);
  const previewKey = JSON.stringify(previewOccasion);

  const missing = !to.trim() ? 'Напиши, кому' : !from.trim() ? 'Напиши, от кого' : null;

  async function publish() {
    if (missing) {
      setError(missing);
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      const slug = generateSlug();
      const { data: inv, error: insertError } = await supabase
        .from('invitations')
        .insert({
          user_id: user.id,
          slug,
          kind: 'occasion',
          occasion,
          recipient_name: occasion.to,
          recipient_gender: toF ? 'female' : 'male',
          template_key: 'romantic',
          mood: 'romantic',
          card_shape: 'classic',
          status: 'draft',
        })
        .select('id, slug')
        .single();
      if (insertError) throw insertError;

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ invitationId: inv.id, method: 'click' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.published) throw new Error(data.error || 'не удалось опубликовать');
      track('occasion_published', { scn });
      setResult({ invitationId: inv.id, slug: data.slug || inv.slug, url: inviteShareUrl(data.slug || inv.slug, occasion.to, 'romantic') });
    } catch (e) {
      console.error('occasion publish failed', e);
      setError(`Не получилось опубликовать: ${e.message || e}`);
    } finally {
      setPublishing(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер обмена недоступен — ссылку видно на экране */
    }
  }

  if (result) {
    return (
      <Shell>
        <p style={labelStyle}>готово</p>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 34, margin: '6px 0 12px' }}>Ссылка готова</h1>
        <p style={{ color: C.muted, margin: '0 0 16px' }}>Отправь её в любой мессенджер. Ответы придут в Telegram-бот и в «Мои приглашения».</p>
        <div style={{ ...cardStyle, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 14 }}>{result.url}</code>
          <button type="button" onClick={copy} style={yesStyle}>{copied ? 'Скопировано' : 'Скопировать'}</button>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          <a href={`/i/${result.slug}`} target="_blank" rel="noreferrer" style={linkStyle}>Открыть как получатель</a>
          <Link to="/dashboard" style={linkStyle}>Мои приглашения</Link>
          <button type="button" onClick={() => setResult(null)} style={{ ...linkStyle, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Сделать ещё одно</button>
        </div>
      </Shell>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.ground, color: C.ink, fontFamily: TEXT }}>
      <FontLink />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px 48px' }}>
        <Link to="/dashboard" style={{ color: C.muted, fontSize: 14, textDecoration: 'none' }}>← Мои приглашения</Link>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 36, margin: '10px 0 4px' }}>Новые поводы</h1>
        <p style={{ color: C.muted, margin: '0 0 22px', fontSize: 14 }}>Тест: эту страницу видишь только ты. Публикация для тебя бесплатная.</p>

        <div className="occ-grid" style={{ display: 'grid', gap: 22, alignItems: 'start' }}>
          <style>{`.occ-grid{grid-template-columns:minmax(0,1fr)}@media(min-width:900px){.occ-grid{grid-template-columns:minmax(0,1fr) 380px}}`}</style>
          <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="Что хочешь сказать?">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SCENARIOS.map((s) => (
                  <Chip key={s.id} on={scn === s.id} onClick={() => setScn(s.id)}>{s.label}</Chip>
                ))}
              </div>
            </Field>

            <Row>
              <Field label="Кому">
                <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={16} placeholder="Имя" style={inputStyle} />
              </Field>
              <Toggle options={[['ей', true], ['ему', false]]} value={toF} onChange={setToF} />
            </Row>
            <Row>
              <Field label="От кого">
                <input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={16} placeholder="Твоё имя" style={inputStyle} />
              </Field>
              <Toggle options={[['он', false], ['она', true]]} value={fromF} onChange={setFromF} />
            </Row>

            {scn === 'sorry' ? (
              <>
                <Field label="За что извиняешься">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={160} rows={3}
                    placeholder="Коротко и честно. Например: что опоздал на час." style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
                <Field label="Предложение мира">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PEACE_OPTIONS.map((p) => (
                      <Chip key={p} on={peace.includes(p)}
                        onClick={() => setPeace((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}>{p}</Chip>
                    ))}
                  </div>
                </Field>
              </>
            ) : (
              <Field label="Поздравление">
                <textarea value={wishes[scn] || ''} onChange={(e) => setWishes((w) => ({ ...w, [scn]: e.target.value }))}
                  maxLength={220} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
            )}

            {scn === 'bday' && (
              <Row>
                <Field label="Сколько исполняется">
                  <input type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="можно не указывать" style={inputStyle} />
                </Field>
                <Field label="Что в коробке">
                  <input value={gift} onChange={(e) => setGift(e.target.value)} maxLength={50} placeholder="пусто — без подарка" style={inputStyle} />
                </Field>
              </Row>
            )}
            {scn === 'anniv' && (
              <Field label="Дата первого свидания">
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} style={inputStyle} />
              </Field>
            )}

            {error && <p role="alert" style={{ color: C.cherry, margin: 0, fontWeight: 600 }}>{error}</p>}
            <button type="button" onClick={publish} disabled={publishing} style={{ ...yesStyle, width: '100%', opacity: publishing ? 0.7 : 1 }}>
              {publishing ? 'Публикуем…' : 'Опубликовать бесплатно'}
            </button>
          </section>

          <section aria-label="Превью" style={{ position: 'sticky', top: 16 }}>
            <p style={{ ...labelStyle, margin: '0 0 8px' }}>так увидит получатель</p>
            <div style={{ height: 'min(760px, 80vh)', borderRadius: 28, overflow: 'hidden', background: '#1C0B16' }}>
              <OccasionFrame key={previewKey} occasion={{ ...previewOccasion, to: previewOccasion.to || 'Имя', from: previewOccasion.from || 'Я' }} isPreview />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FontLink() {
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Yeseva+One&family=Onest:wght@400;500;600;700&display=swap" />;
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.ground, color: C.ink, fontFamily: TEXT }}>
      <FontLink />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 16px' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>{children}</div>;
}

function Chip({ on, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      style={{ border: 0, borderRadius: 999, padding: '9px 16px', fontFamily: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        background: on ? C.cherry : C.blush, color: on ? '#fff' : C.ink }}>
      {children}
    </button>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', background: C.blush, borderRadius: 999, padding: 4, gap: 4 }}>
      {options.map(([label, v]) => (
        <button key={label} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          style={{ border: 0, borderRadius: 999, padding: '9px 16px', fontFamily: TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            background: value === v ? C.surface : 'transparent', color: C.ink }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: C.cherry, margin: 0 };
const cardStyle = { background: C.surface, borderRadius: 24, padding: 20, boxShadow: '0 24px 40px -28px rgba(42,15,32,.35)' };
const inputStyle = { width: '100%', boxSizing: 'border-box', fontFamily: TEXT, fontSize: 16, color: C.ink, background: C.ground,
  border: `1.5px solid ${C.line}`, borderRadius: 12, padding: '11px 14px', outline: 'none' };
const yesStyle = { border: 0, borderRadius: 999, background: C.cherry, color: '#fff', fontFamily: TEXT, fontSize: 16, fontWeight: 600,
  padding: '14px 26px', cursor: 'pointer', boxShadow: '0 12px 24px -10px rgba(184,32,79,.55)' };
const linkStyle = { color: C.cherry, fontWeight: 600, fontSize: 15, textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: TEXT };
