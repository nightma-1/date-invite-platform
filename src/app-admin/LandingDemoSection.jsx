/**
 * © 2026 Senti. Все права защищены.
 *
 * Админка → «Образец на главной». Владелец сам меняет тексты демо-
 * приглашения на senti.uz: имя, вопрос, кнопку «Да», тексты экранов,
 * варианты мест и еды — отдельно для каждого языка.
 *
 * Пустое поле = текст по умолчанию (он виден серым в поле). Хранится в
 * site_content под ключом 'landing_demo' (см. src/lib/siteContent.js).
 */

import { useEffect, useMemo, useState } from 'react';
import i18n from '../i18n/index.js';
import { getTemplateTokens } from '../templates/registry.js';
import {
  LANDING_DEMO_KEY,
  LANDING_DEMO_FIELDS,
  loadSiteContent,
  saveSiteContent,
  parseOptionLines,
  optionsToLines,
} from '../lib/siteContent.js';

const t = getTemplateTokens('romantic');
const LANGS = [
  { code: 'ru', label: '🇷🇺 RU' },
  { code: 'uz', label: '🇺🇿 UZ' },
  { code: 'en', label: '🇬🇧 EN' },
];

// Варианты в форме правим как текст (по строке на вариант) и превращаем
// в массив только при сохранении — иначе нельзя было бы набрать перенос строки.
function toForm(value) {
  const form = {};
  for (const { code } of LANGS) {
    const src = value?.[code] || {};
    const row = { recipientGender: src.recipientGender === 'male' ? 'male' : 'female' };
    for (const f of LANDING_DEMO_FIELDS) {
      row[f.id] = f.options ? optionsToLines(src[f.id]) : (src[f.id] || '');
    }
    form[code] = row;
  }
  return form;
}

function fromForm(form) {
  const value = {};
  for (const { code } of LANGS) {
    const row = form[code] || {};
    const out = {};
    if (row.recipientGender === 'male') out.recipientGender = 'male';
    for (const f of LANDING_DEMO_FIELDS) {
      if (f.options) {
        const opts = parseOptionLines(row[f.id]);
        if (opts.length) out[f.id] = opts;
      } else {
        const v = String(row[f.id] || '').trim().slice(0, f.max || 200);
        if (v) out[f.id] = v;
      }
    }
    if (Object.keys(out).length) value[code] = out;
  }
  return value;
}

export default function LandingDemoSection() {
  const [lang, setLang] = useState('ru');
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | { error }

  useEffect(() => {
    let cancelled = false;
    loadSiteContent(LANDING_DEMO_KEY)
      .then((value) => {
        if (cancelled) return;
        const f = toForm(value);
        setForm(f);
        setSavedForm(f);
      })
      .catch((e) => { if (!cancelled) setStatus({ error: e.message }); });
    return () => { cancelled = true; };
  }, []);

  // Тексты по умолчанию на выбранном языке — подсказкой в пустых полях
  const defaults = useMemo(() => {
    const ft = i18n.getFixedT(lang);
    const d = {};
    for (const f of LANDING_DEMO_FIELDS) {
      d[f.id] = f.options ? optionsToLines(ft(f.i18n, { returnObjects: true })) : ft(f.i18n);
    }
    return d;
  }, [lang]);

  const dirty = form && savedForm && JSON.stringify(form) !== JSON.stringify(savedForm);

  function setField(id, v) {
    setStatus(null);
    setForm((prev) => ({ ...prev, [lang]: { ...prev[lang], [id]: v } }));
  }

  async function save() {
    setStatus('saving');
    try {
      await saveSiteContent(LANDING_DEMO_KEY, fromForm(form));
      setSavedForm(form);
      setStatus('saved');
    } catch (e) {
      setStatus({ error: e.message || 'Не получилось сохранить' });
    }
  }

  const inputStyle = {
    width: '100%', border: `1.5px solid ${t.ink}20`, borderRadius: 12,
    padding: '9px 12px', fontFamily: t.fontUI, fontSize: 14, color: t.ink, background: '#fff',
  };

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
          Образец на главной
        </h2>
        <a href="/" target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: t.berry, fontFamily: t.fontUI }}>
          Открыть главную ↗
        </a>
      </div>
      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        Пустое поле — текст по умолчанию (виден серым). Для каждого языка свои тексты.
      </p>

      {!form && !status?.error && <p className="text-sm opacity-60">Загрузка…</p>}

      {form && (
        <>
          <div className="mb-4 flex gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
                style={{
                  fontFamily: t.fontUI, cursor: 'pointer',
                  background: lang === l.code ? t.berry : '#fff',
                  color: lang === l.code ? '#fff' : t.ink,
                  border: `1.5px solid ${lang === l.code ? t.berry : `${t.ink}20`}`,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
                Кого приглашают
              </label>
              <div className="flex gap-2">
                {[['female', '👩 Её'], ['male', '👨 Его']].map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setField('recipientGender', g)}
                    className="rounded-full px-3 py-1 text-xs"
                    style={{
                      fontFamily: t.fontUI, cursor: 'pointer',
                      background: form[lang].recipientGender === g ? `${t.berry}18` : '#fff',
                      color: t.ink,
                      border: `1.5px solid ${form[lang].recipientGender === g ? t.berry : `${t.ink}20`}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {LANDING_DEMO_FIELDS.map((f) => (
              <div key={f.id}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
                  {f.label}
                  {f.options && (
                    <span style={{ fontWeight: 400, opacity: 0.55 }}> — по строке на вариант, значок в начале строки</span>
                  )}
                </label>
                {f.options || f.multiline ? (
                  <textarea
                    value={form[lang][f.id]}
                    onChange={(e) => setField(f.id, e.target.value)}
                    placeholder={defaults[f.id]}
                    rows={f.options ? 4 : 2}
                    maxLength={f.options ? 500 : f.max}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  />
                ) : (
                  <input
                    type="text"
                    value={form[lang][f.id]}
                    onChange={(e) => setField(f.id, e.target.value)}
                    placeholder={defaults[f.id]}
                    maxLength={f.max}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || status === 'saving'}
              className="rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{
                fontFamily: t.fontUI, border: 'none',
                background: t.berry, color: '#fff',
                opacity: !dirty || status === 'saving' ? 0.5 : 1,
                cursor: !dirty || status === 'saving' ? 'default' : 'pointer',
              }}
            >
              {status === 'saving' ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {status === 'saved' && !dirty && (
              <span className="text-xs" style={{ color: t.berry, fontFamily: t.fontUI }}>
                Сохранено ✓ — уже на главной
              </span>
            )}
            {dirty && status !== 'saving' && (
              <span className="text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
                Есть несохранённые изменения
              </span>
            )}
          </div>
        </>
      )}

      {status?.error && (
        <p className="mt-3 text-xs" style={{ color: '#C0392B', fontFamily: t.fontUI }}>
          {status.error}
        </p>
      )}
    </section>
  );
}
