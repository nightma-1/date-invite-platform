/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Раздел «Аналитика» в админке: посещаемость, воронка от захода на сайт до
 * оплаты, источники трафика и сторона получателя.
 *
 * Все цифры считает один RPC — admin_analytics(from, to). Он SECURITY DEFINER
 * и сам проверяет is_admin, так что обычный пользователь не получит данные,
 * даже если доберётся до этой страницы.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { A, DataTable, Stat } from './adminUi.jsx';

// Цвета и шрифты админки (см. adminUi.jsx); имя t осталось от старого стиля.
const t = A;

// Все даты в разделе — календарные дни по Ташкенту (UTC+5, без перехода на
// летнее время), независимо от часового пояса браузера. Так «сегодня» и
// «вчера» в админке совпадают с тем, как их считает база (admin_analytics).
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 400; // столько максимум отдаёт admin_analytics

function todayYmd() {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayStartIso(ymd) {
  return new Date(`${ymd}T00:00:00+05:00`).toISOString();
}

// Конец дня — за миллисекунду до полуночи: база берёт период как [from, to),
// а лишний пустой день после последнего в графике появляться не должен.
function dayEndIso(ymd) {
  return new Date(new Date(`${ymd}T00:00:00+05:00`).getTime() + DAY_MS - 1).toISOString();
}

function formatYmd(ymd) {
  const [y, m, d] = String(ymd).split('-');
  return `${d}.${m}.${y}`;
}

const PRESETS = [
  { key: 'today', label: 'Сегодня', range: () => ({ from: todayYmd(), to: todayYmd() }) },
  { key: 'yesterday', label: 'Вчера', range: () => ({ from: addDays(todayYmd(), -1), to: addDays(todayYmd(), -1) }) },
  { key: '7d', label: '7 дней', range: () => ({ from: addDays(todayYmd(), -6), to: todayYmd() }) },
  { key: '30d', label: '30 дней', range: () => ({ from: addDays(todayYmd(), -29), to: todayYmd() }) },
  { key: '90d', label: '90 дней', range: () => ({ from: addDays(todayYmd(), -89), to: todayYmd() }) },
];

function pillStyle(active) {
  return {
    padding: '5px 11px', borderRadius: 100, fontSize: 12, fontFamily: t.fontUI,
    cursor: 'pointer', fontWeight: 600,
    border: `1.5px solid ${active ? t.berry : `${t.ink}20`}`,
    background: active ? t.berry : 'transparent',
    color: active ? '#fff' : t.ink,
  };
}

// Что можно вывести на график. Одна метрика за раз и одна шкала — две разные
// величины на одних осях (например, посетители и выручка) всегда врут глазу.
const CHART_METRICS = [
  { key: 'visitors',        label: 'Посетители' },
  { key: 'builder_started', label: 'Открыли конструктор' },
  { key: 'drafts',          label: 'Черновики' },
  { key: 'paid',            label: 'Оплаты' },
  { key: 'revenue',         label: 'Выручка, сум', money: true },
  { key: 'spend',           label: 'Расход на рекламу, сум', money: true },
  { key: 'invite_views',    label: 'Просмотры приглашений' },
  { key: 'responses',       label: 'Ответы получателей' },
];

const STEP_LABELS = {
  question: 'Экран вопроса',
  yes_no: 'Да / нет',
  reaction: 'Реакция на «да»',
  date: 'Дата',
  time: 'Время',
  choice_block: 'Выбор',
  choice_place: 'Место',
  choice_food: 'Еда',
  final: 'Финальный экран',
};

// Меньше этого числа людей на шаге — проценты показываем серыми:
// 1 из 3 — это не «33%», а шум.
const LOW_SAMPLE = 20;

const num = (v) => Number(v || 0).toLocaleString('ru-RU');
const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('ru-RU')} сум`;

function percent(part, whole) {
  if (!whole) return '—';
  return `${((Number(part || 0) / Number(whole)) * 100).toFixed(1).replace('.0', '')}%`;
}

function costPer(spend, count) {
  if (!Number(spend)) return '—';
  if (!Number(count)) return 'нет';
  return money(Number(spend) / Number(count));
}

function roas(revenue, spend) {
  if (!Number(spend)) return '—';
  return `×${(Number(revenue || 0) / Number(spend)).toFixed(2).replace(/\.?0+$/, '')}`;
}

/** Изменение к прошлому периоду той же длины. */
function delta(cur, prev, { inverse = false } = {}) {
  const c = Number(cur || 0);
  const p = Number(prev || 0);
  if (prev === undefined || prev === null) return null;
  if (!p && !c) return null;
  if (!p) return { text: 'новое', good: !inverse };
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return { text: '0%', good: null };
  const up = pct > 0;
  return { text: `${up ? '↑' : '↓'}${Math.abs(pct)}%`, good: inverse ? !up : up };
}

function formatDay(iso) {
  // '2026-10-11' → '11.10'
  const [, m, d] = String(iso).split('-');
  return d && m ? `${d}.${m}` : String(iso);
}

function daysBetween(fromYmd, toYmd) {
  return Math.round((new Date(`${toYmd}T00:00:00Z`) - new Date(`${fromYmd}T00:00:00Z`)) / DAY_MS) + 1;
}

export default function AnalyticsSection() {
  // По умолчанию неделя: при нынешнем трафике так быстрее видно, сработали ли изменения
  const [preset, setPreset] = useState('7d');
  const [range, setRange] = useState(() => PRESETS.find((p) => p.key === '7d').range());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('visitors');
  const [showDetails, setShowDetails] = useState(false);

  const rangeLabel = range.from === range.to
    ? formatYmd(range.from)
    : `${formatYmd(range.from)} — ${formatYmd(range.to)}`;

  // Прошлый период той же длины, сразу перед выбранным: с ним сравниваем.
  const prevRange = useMemo(() => {
    const len = daysBetween(range.from, range.to);
    return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [cur, before] = await Promise.all([
      supabase.rpc('admin_analytics', { p_from: dayStartIso(range.from), p_to: dayEndIso(range.to) }),
      supabase.rpc('admin_analytics', { p_from: dayStartIso(prevRange.from), p_to: dayEndIso(prevRange.to) }),
    ]);
    if (cur.error) {
      // Самый частый случай — миграция аналитики ещё не применена к базе
      setError(
        /function|does not exist|schema cache/i.test(cur.error.message || '')
          ? 'Аналитика ещё не включена в базе: примените миграции supabase/migrations/…analytics….sql.'
          : (cur.error.message || 'Не получилось загрузить аналитику.')
      );
      setData(null);
      setPrev(null);
    } else {
      setData(cur.data);
      setPrev(before.error ? null : before.data);
    }
    setLoading(false);
  }, [range, prevRange]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals || {};
  const pt = prev?.totals || null;
  const alltime = data?.alltime || {};
  const daily = data?.daily || [];
  const viral = data?.viral || {};
  const spendTotal = Number(totals.spend || 0);

  // Воронка: каждый шаг считаем и от начала (сколько дошло с самого верха),
  // и от предыдущего шага (где именно теряем людей). Все шаги — на одних и
  // тех же людях: последний шаг — заплатившие из посетителей этого периода.
  const funnel = useMemo(() => {
    const steps = [
      { label: 'Зашли на сайт',           value: totals.visitors },
      { label: 'Открыли конструктор',     value: totals.builder_started },
      { label: 'Дошли до «Опубликовать»', value: totals.builder_finished },
      { label: 'Выбрали способ оплаты',   value: totals.payment_chosen },
      { label: 'Ушли на оплату',          value: totals.payment_started },
      { label: 'Оплатили',                value: totals.paid_in_funnel },
    ];
    return toBars(steps);
  }, [totals]);

  const builderSteps = useMemo(() => toBars((data?.builder_steps || []).map((s) => ({
    label: `${s.idx + 1}. ${STEP_LABELS[s.step] || s.step}`,
    value: s.visitors,
  }))), [data]);

  const knownCampaigns = useMemo(() => {
    const set = new Set();
    (data?.campaigns || []).forEach((c) => c.campaign && set.add(c.campaign));
    (data?.spend_rows || []).forEach((r) => r.campaign && set.add(r.campaign));
    return [...set];
  }, [data]);

  const chartMeta = CHART_METRICS.find((m) => m.key === metric) || CHART_METRICS[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.ink, fontFamily: t.fontUI, letterSpacing: '-0.01em' }}>
          Аналитика
          {data?.live?.visitors_30m > 0 && (
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: t.berry }}>
              ● сейчас на сайте: {num(data.live.visitors_30m)}
            </span>
          )}
        </h2>
        <div className="relative flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { setPreset(p.key); setRange(p.range()); setCalendarOpen(false); }}
              style={pillStyle(preset === p.key)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            data-calendar-toggle
            onClick={() => setCalendarOpen((open) => !open)}
            style={{ ...pillStyle(preset === 'custom'), ...(calendarOpen ? { borderColor: t.berry } : {}) }}
          >
            📅 {preset === 'custom' ? rangeLabel : 'Календарь'}
          </button>
          {calendarOpen && (
            <RangeCalendar
              value={range}
              maxYmd={todayYmd()}
              minYmd={addDays(todayYmd(), -(MAX_RANGE_DAYS - 1))}
              onApply={(next) => { setRange(next); setPreset('custom'); setCalendarOpen(false); }}
              onClose={() => setCalendarOpen(false)}
            />
          )}
          <button
            type="button"
            onClick={load}
            title="Обновить"
            style={{
              padding: '5px 10px', borderRadius: 100, fontSize: 12, fontFamily: t.fontUI,
              border: `1.5px solid ${t.ink}20`, background: 'transparent', color: t.ink, cursor: 'pointer',
            }}
          >
            ↻
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI, lineHeight: 1.5 }}>
        Период: {rangeLabel} · по времени Ташкента · без ваших устройств, приглашений и оплат.
        Стрелки — изменение к {formatYmd(prevRange.from)} — {formatYmd(prevRange.to)}.
      </p>

      {error && (
        <p className="mb-4 text-sm" style={{ color: '#C0392B', fontFamily: t.fontUI }}>{error}</p>
      )}
      {loading && !data && <p className="text-sm opacity-60">Считаем…</p>}

      {data && (
        <>
          {data.has_events === false && (
            <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI, lineHeight: 1.5 }}>
              Событий посещений за этот период нет. Цифры по черновикам, оплатам и ответам берутся
              из базы и верны всегда.
            </p>
          )}

          {/* Главное: люди и деньги */}
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Посетители" value={num(totals.visitors)} delta={delta(totals.visitors, pt?.visitors)}
              sub={`новых: ${num(totals.new_visitors)}`} />
            <Stat label="Оплаты" value={num(totals.paid)} delta={delta(totals.paid, pt?.paid)}
              sub={`из ${num(totals.payments_started)} попыток`} />
            <Stat label="Выручка" value={money(totals.revenue)} delta={delta(totals.revenue, pt?.revenue)}
              sub={`конверсия из посетителя: ${percent(totals.paid, totals.visitors)}`} />
            <Stat label="Расход на рекламу" value={money(spendTotal)} delta={delta(spendTotal, pt?.spend, { inverse: true })}
              sub={spendTotal ? `окупаемость ${roas(totals.revenue, spendTotal)}` : 'внесите расходы ниже'} />
          </div>

          {/* Цена: сколько стоит каждый шаг при текущих расходах */}
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Цена посетителя" value={costPer(spendTotal, totals.visitors)} muted={!spendTotal} />
            <Stat label="Цена старта конструктора" value={costPer(spendTotal, totals.builder_started)} muted={!spendTotal} />
            <Stat label="Цена оплаты" value={costPer(spendTotal, totals.paid)} muted={!spendTotal}
              delta={pt?.spend && pt?.paid && totals.paid
                ? delta(spendTotal / totals.paid, pt.spend / pt.paid, { inverse: true }) : null} />
            <Stat label="Окупаемость рекламы" value={roas(totals.revenue, spendTotal)} muted={!spendTotal}
              sub={spendTotal ? 'выручка ÷ расход' : null} />
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Регистрации" value={num(totals.signups)} delta={delta(totals.signups, pt?.signups)} />
            <Stat label="Черновики" value={num(totals.drafts)} delta={delta(totals.drafts, pt?.drafts)}
              sub={`опубликовано: ${num(totals.published)}`} />
            <Stat label="Просмотры приглашений" value={num(totals.invite_views)}
              sub={`уникальных: ${num(totals.invite_viewers)}`} />
            <Stat label="Ответы получателей" value={num(totals.responses)}
              sub={`«Да»: ${num(totals.responses_yes)} · в поддержку: ${num(totals.support_tickets)}`} />
          </div>

          {/* Воронка */}
          <SubTitle>Воронка: от захода до оплаты</SubTitle>
          <Bars rows={funnel} />
          <p className="mb-8 mt-1 text-[11px]" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI, lineHeight: 1.5 }}>
            «Оплатили» — те из посетителей периода, кто заплатил ({num(totals.paid_in_funnel)} из {num(totals.paid)} оплат).
            Остальные платили с устройства, где счётчик их раньше не видел.
            Серым — шаги, где меньше {LOW_SAMPLE} человек: проценты там ненадёжны.
          </p>

          {/* Конструктор по шагам */}
          <SubTitle>Конструктор по шагам: где бросают</SubTitle>
          {builderSteps.length ? <Bars rows={builderSteps} /> : <p className="text-sm opacity-60">Нет данных.</p>}
          <div className="mb-8" />

          {/* Препятствия и сбои */}
          <SubTitle>Препятствия и сбои</SubTitle>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Остановило «нет имени»" value={num(totals.name_blocked)} sub="забыли имя получателя" />
            <Stat label="Увидели экран входа" value={num(totals.auth_viewed)} sub={`вошли: ${num(totals.auth_passed)}`} />
            <Stat label="Оплата без публикации" value={num(totals.payment_timeouts)}
              sub="вебхук Click не пришёл за 40 с" alert={Number(totals.payment_timeouts) > 0} />
            <Stat label="Ошибки публикации" value={num(totals.publish_errors)}
              sub="сбой при сохранении" alert={Number(totals.publish_errors) > 0} />
          </div>
          {(data.issues || []).length > 0 ? (
            <Table
              className="mb-8"
              head={['Когда', 'Что', 'Ошибка', 'Устройство']}
              rows={data.issues.map((i) => [
                { d: new Date(i.at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), v: i.at },
                i.event === 'payment_timeout' ? 'оплата без публикации' : 'ошибка публикации',
                i.message || '—',
                i.device || '—',
              ])}
            />
          ) : <div className="mb-8" />}

          {/* Получатели, ставшие покупателями */}
          <SubTitle>Получатели → покупатели</SubTitle>
          <p className="mb-2 text-[11px]" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI, lineHeight: 1.5 }}>
            Люди, которые впервые попали на Senti через чужое приглашение. Это бесплатный канал роста.
          </p>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Пришли через приглашение" value={num(viral.recipients)} />
            <Stat label="Нажали «Сделать своё»" value={num(viral.cta_clicks)} />
            <Stat label="Открыли конструктор" value={num(viral.started_builder)} sub={percent(viral.started_builder, viral.recipients)} />
            <Stat label="Оплатили" value={num(viral.paid)} sub={money(viral.revenue)} />
          </div>

          {/* График по дням */}
          <SubTitle>По дням</SubTitle>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHART_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                style={{
                  padding: '4px 10px', borderRadius: 100, fontSize: 11.5, fontFamily: t.fontUI,
                  cursor: 'pointer', fontWeight: 600,
                  border: `1px solid ${metric === m.key ? t.berry : `${t.ink}18`}`,
                  background: metric === m.key ? `${t.berry}12` : 'transparent',
                  color: metric === m.key ? t.berry : t.ink,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mb-8">
            <DayBars rows={daily} metric={metric} label={chartMeta.label} isMoney={Boolean(chartMeta.money)} />
          </div>

          {/* Источники */}
          <SubTitle>Источники: кто приходит и кто платит</SubTitle>
          <Table
            className="mb-2"
            head={['Источник', 'Посетители', 'Конструктор', 'Ушли на оплату', 'Оплаты', 'Выручка']}
            rows={(data.sources || []).map((s) => [
              s.source === 'direct' ? 'Прямые заходы' : s.source,
              num(s.visitors), num(s.builder_started), num(s.payment_started), num(s.paid), money(s.revenue),
            ])}
            empty="Пока нет данных о переходах."
          />
          <p className="mb-8 text-[11px]" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI }}>
            Источник — откуда человек пришёл в первый раз. Оплата засчитывается источнику того, кто заплатил.
          </p>

          {/* Кампании и ролики */}
          <SubTitle>Рекламные кампании</SubTitle>
          <Table
            className="mb-4"
            head={['Кампания', 'Посетители', 'Конструктор', 'Оплаты', 'Выручка', 'Расход', 'Цена оплаты', 'Окупаемость']}
            rows={(data.campaigns || []).map((c) => [
              c.campaign, num(c.visitors), num(c.builder_started), num(c.paid), money(c.revenue),
              money(c.spend), costPer(c.spend, c.paid), roas(c.revenue, c.spend),
            ])}
            empty="Нет переходов с меткой utm_campaign."
          />

          <SubTitle>Ролики (utm_content)</SubTitle>
          {(data.contents || []).length > 0 ? (
            <Table
              className="mb-8"
              head={['Кампания', 'Ролик', 'Посетители', 'Конструктор', 'Оплаты', 'Выручка', 'Расход']}
              rows={data.contents.map((c) => [
                c.campaign || '—', c.content, num(c.visitors), num(c.builder_started), num(c.paid), money(c.revenue), money(c.spend),
              ])}
            />
          ) : (
            <p className="mb-8 text-xs" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI, lineHeight: 1.6 }}>
              Пока пусто. Чтобы видеть каждый ролик отдельно, в Meta Ads в «Параметры URL» объявления добавьте
              {' '}<code style={{ fontSize: 11 }}>utm_content={'{{ad.name}}'}</code> — рядом с уже стоящей меткой кампании.
              Данные начнут собираться с новых переходов.
            </p>
          )}

          {/* Ввод расходов */}
          <SubTitle>Расходы на рекламу</SubTitle>
          <SpendManager rows={data.spend_rows || []} campaigns={knownCampaigns} onChanged={load} />

          {/* Второстепенное — свёрнуто */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            style={{
              margin: '24px 0 12px', padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: t.berry, fontFamily: t.fontUI, fontSize: 13, fontWeight: 700,
            }}
          >
            {showDetails ? '▾ Скрыть подробности' : '▸ Подробности: устройства, языки, страницы, события'}
          </button>

          {showDetails && (
            <>
              <div className="mb-8 grid gap-6 md:grid-cols-2">
                <div>
                  <SubTitle>Устройства</SubTitle>
                  <Table head={['Устройство', 'Посетители']} rows={(data.devices || []).map((d) => [d.device, num(d.visitors)])} />
                </div>
                <div>
                  <SubTitle>Языки браузера</SubTitle>
                  <Table head={['Язык', 'Посетители']} rows={(data.langs || []).map((l) => [l.lang, num(l.visitors)])} />
                </div>
              </div>
              <div className="mb-8 grid gap-6 md:grid-cols-2">
                <div>
                  <SubTitle>Страницы</SubTitle>
                  <Table head={['Страница', 'Просмотры', 'Посетители']}
                    rows={(data.pages || []).map((p) => [p.path, num(p.views), num(p.visitors)])} />
                </div>
                <div>
                  <SubTitle>Шаблоны в созданных приглашениях</SubTitle>
                  <Table head={['Шаблон', 'Приглашений']}
                    rows={(data.templates || []).map((x) => [x.template, num(x.count)])}
                    empty="За период приглашений не создавали." />
                </div>
              </div>
              {(data.ref_codes || []).length > 0 && (
                <>
                  <SubTitle>Реферальные ссылки (?ref=)</SubTitle>
                  <Table className="mb-8" head={['Код', 'Посетители']} rows={data.ref_codes.map((r) => [r.code, num(r.visitors)])} />
                </>
              )}
              <SubTitle>Самые просматриваемые приглашения</SubTitle>
              <Table
                className="mb-8"
                head={['Ссылка', 'Кому', 'Просмотры', 'Зрителей', 'Ответов']}
                rows={(data.top_invitations || []).map((i) => [
                  `/i/${i.slug}`, i.recipient_name || '—', num(i.views), num(i.viewers), num(i.submits),
                ])}
                empty="Пока никто не открывал приглашения."
              />
              <SubTitle>Все события за период</SubTitle>
              <Table className="mb-8" head={['Событие', 'Раз', 'Посетителей']}
                rows={(data.events || []).map((e) => [e.event, num(e.count), num(e.visitors)])} empty="Событий нет." />
            </>
          )}

          {/* За всё время — чтобы не путать период с общими итогами проекта */}
          <SubTitle>За всё время</SubTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Пользователей" value={num(alltime.users)} />
            <Stat label="Приглашений" value={num(alltime.invitations)} sub={`опубликовано: ${num(alltime.published)}`} />
            <Stat label="Выручка" value={money(alltime.revenue)} sub={`оплат: ${num(alltime.paid)}`} />
            <Stat label="Расход на рекламу" value={money(alltime.spend)}
              sub={`ответов: ${num(alltime.responses)} (да: ${num(alltime.responses_yes)})`} />
          </div>
        </>
      )}
    </div>
  );
}

/** Шаги воронки: доля от первого шага и от предыдущего. */
function toBars(steps) {
  const top = Number(steps[0]?.value || 0);
  return steps.map((s, i) => {
    const value = Number(s.value || 0);
    const prevValue = i === 0 ? null : Number(steps[i - 1].value || 0);
    return {
      ...s,
      value,
      ofTop: top ? value / top : 0,
      ofPrev: i === 0 || !prevValue ? null : value / prevValue,
      low: (prevValue ?? value) < LOW_SAMPLE,
    };
  });
}

function Bars({ rows }) {
  return (
    <div className="space-y-1.5">
      {rows.map((step) => (
        <div key={step.label}>
          <div className="flex items-baseline justify-between text-xs" style={{ fontFamily: t.fontUI, color: t.ink }}>
            <span>{step.label}</span>
            <span style={{ opacity: step.low ? 0.4 : 0.6 }}>
              {num(step.value)}
              {step.ofPrev !== null && (
                <> · {(step.ofPrev * 100).toFixed(0)}% от предыдущего{step.low ? ' (мало данных)' : ''}</>
              )}
            </span>
          </div>
          <div style={{ height: 10, background: `${t.ink}0D`, borderRadius: 5, overflow: 'hidden', marginTop: 3 }}>
            <div
              style={{
                width: `${Math.max(step.ofTop * 100, step.value > 0 ? 1.5 : 0)}%`,
                height: '100%',
                background: step.low ? `${t.berry}66` : t.berry,
                borderRadius: 5,
                transition: 'width .3s ease-out',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Ручной ввод расходов на рекламу. Кампания — то же значение, что стоит в
 * utm_campaign ссылки (в Meta это номер кампании, если в рекламе стоит
 * {{campaign.id}}); тогда расход встанет в строку этой кампании.
 */
function SpendManager({ rows, campaigns, onChanged }) {
  const [day, setDay] = useState(() => addDays(todayYmd(), -1));
  const [campaign, setCampaign] = useState(campaigns[0] || '');
  const [content, setContent] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function add(e) {
    e.preventDefault();
    setFormError(null);
    const value = Math.round(Number(String(amount).replace(/[\s,]/g, '')));
    if (!day || !Number.isFinite(value) || value <= 0) {
      setFormError('Укажите дату и сумму в сумах.');
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from('ad_spend').insert({
      day,
      channel: 'meta',
      campaign: campaign.trim() || null,
      content: content.trim() || null,
      amount: value,
      note: note.trim() || null,
      created_by: sessionData.session?.user?.id || null,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message || 'Не получилось сохранить.');
      return;
    }
    setAmount('');
    setNote('');
    onChanged();
  }

  async function remove(id) {
    if (!confirm('Удалить эту запись о расходе?')) return;
    const { error } = await supabase.from('ad_spend').delete().eq('id', id);
    if (error) {
      alert(error.message || 'Не получилось удалить.');
      return;
    }
    onChanged();
  }

  const input = {
    padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.ink}25`, fontFamily: t.fontUI,
    fontSize: 13, color: t.ink, background: '#fff', minWidth: 0,
  };

  return (
    <div className="mb-4">
      <form onSubmit={add} className="mb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        <input type="date" value={day} max={todayYmd()} onChange={(e) => setDay(e.target.value)} style={input} aria-label="День" />
        <input list="senti-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)}
          placeholder="Кампания (utm_campaign)" style={input} />
        <datalist id="senti-campaigns">
          {campaigns.map((c) => <option key={c} value={c} />)}
        </datalist>
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ролик (необязательно)" style={input} />
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Сумма, сум" style={input} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" style={input} />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: 100, border: 'none', background: t.berry, color: '#fff',
            fontFamily: t.fontUI, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Сохраняем…' : 'Добавить расход'}
        </button>
      </form>
      {formError && <p className="mb-2 text-xs" style={{ color: '#C0392B', fontFamily: t.fontUI }}>{formError}</p>}
      <p className="mb-3 text-[11px]" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI, lineHeight: 1.5 }}>
        Расходы Meta Ads подтягиваются сами раз в день (строки с пометкой «Meta») — если в Vercel заданы ключи,
        см. «Система». Руками вносите только другие расходы. Кампания должна совпадать с меткой utm_campaign —
        тогда расход встанет в её строку в таблице кампаний выше.
      </p>
      <Table
        head={['День', 'Кампания', 'Ролик', 'Сумма', 'Заметка', '']}
        rows={rows.map((r) => [
          { d: formatYmd(r.day), v: r.day }, r.campaign || '—', r.content || '—', money(r.amount),
          String(r.note || '').startsWith('meta:') ? `Meta · ${r.note.slice(5)}` : (r.note || '—'),
          <button
            key={r.id}
            type="button"
            onClick={() => remove(r.id)}
            style={{ background: 'none', border: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 12, fontFamily: t.fontUI }}
          >
            удалить
          </button>,
        ])}
        empty="За этот период расходов не внесено."
      />
    </div>
  );
}

/**
 * Столбики по дням. Одна метрика — одна шкала: вторая величина на тех же осях
 * выглядела бы сопоставимой, хотя сравнивать их нельзя.
 */
function DayBars({ rows, metric, label, isMoney }) {
  const [hover, setHover] = useState(null);
  const values = rows.map((r) => Number(r[metric] || 0));
  const max = Math.max(1, ...values);
  const H = 150;
  // Мало дней (например, один выбранный) — узкие столбики фиксированной
  // ширины, иначе один столбик растянулся бы на всю страницу.
  const few = rows.length > 0 && rows.length <= 7;
  const GAP = few ? 24 : 2;
  const W = few ? rows.length * 64 : Math.max(rows.length * 8, 320);
  const barW = rows.length ? (few ? 40 : Math.max(3, (W - GAP * rows.length) / rows.length)) : 0;

  if (rows.length === 0) return <p className="text-sm opacity-60">Нет данных за период.</p>;

  const sum = values.reduce((a, b) => a + b, 0);

  return (
    <div>
      <p className="mb-1 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        {label} · всего за период: {isMoney ? money(sum) : num(sum)} · максимум за день: {isMoney ? money(max) : num(max)}
      </p>
      <div style={{ position: 'relative', width: few ? `${rows.length * 64}px` : '100%', maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: H + 18, display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={`${label} по дням`}
      >
        {/* Ненавязчивая сетка: только верх и низ шкалы */}
        <line x1="0" y1={H} x2={W} y2={H} stroke={`${t.ink}20`} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="0" x2={W} y2="0" stroke={`${t.ink}0D`} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {rows.map((r, i) => {
          const v = Number(r[metric] || 0);
          const h = v > 0 ? Math.max(2, (v / max) * H) : 0;
          const x = i * (barW + GAP);
          return (
            <g key={r.day}>
              {/* Прозрачная зона наведения во всю высоту: по тонкому столбику
                  в один-два пикселя мышью не попасть */}
              <rect
                x={x} y={0} width={barW + GAP} height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((cur) => (cur === i ? null : cur))}
              />
              {h > 0 && (
                <rect
                  x={x} y={H - h} width={barW} height={h} rx={Math.min(3, barW / 2)}
                  fill={t.berry}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              <title>{`${formatDay(r.day)}: ${isMoney ? money(v) : num(v)}`}</title>
            </g>
          );
        })}
      </svg>
      {/* Подписи — обычным текстом поверх графика: внутри SVG с
          preserveAspectRatio="none" буквы растягивались вместе со столбиками.
          Подписываем только края; максимум — в строке над графиком. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: t.fontUI, color: t.ink, opacity: 0.5, marginTop: -14 }}>
        <span>{formatDay(rows[0].day)}</span>
        {rows.length > 1 && <span>{formatDay(rows[rows.length - 1].day)}</span>}
      </div>
      {hover !== null && rows[hover] && (
        <div
          style={{
            position: 'absolute', top: 18, left: `${((hover + 0.5) / rows.length) * 100}%`,
            transform: 'translateX(-50%)', pointerEvents: 'none',
            background: t.ink, color: '#fff', borderRadius: 6, padding: '4px 8px',
            fontSize: 11, fontFamily: t.fontUI, whiteSpace: 'nowrap', zIndex: 2,
          }}
        >
          {formatDay(rows[hover].day)}: {isMoney ? money(rows[hover][metric]) : num(rows[hover][metric])}
        </div>
      )}
      </div>
    </div>
  );
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Календарь выбора периода: первый клик — начало, второй — конец. Один клик
 * и «Применить» — ровно один день. Будущие дни и даты глубже, чем отдаёт
 * база, недоступны.
 */
function RangeCalendar({ value, maxYmd, minYmd, onApply, onClose }) {
  const [month, setMonth] = useState(value.to.slice(0, 7));
  const [start, setStart] = useState(value.from);
  const [end, setEnd] = useState(value.to === value.from ? null : value.to);

  useEffect(() => {
    function onDown(e) {
      // Клик по самой кнопке-переключателю обрабатывает она сама, иначе
      // календарь закрылся бы здесь и тут же открылся обратно.
      if (e.target.closest?.('[data-calendar-toggle]') || e.target.closest?.('[data-calendar-popover]')) return;
      onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const [y, m] = month.split('-').map(Number);
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // неделя с понедельника
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  const canPrev = month > minYmd.slice(0, 7);
  const canNext = month < maxYmd.slice(0, 7);

  function shiftMonth(delta) {
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
  }

  function pick(d) {
    if (d > maxYmd || d < minYmd) return;
    if (!start || end) {
      setStart(d);
      setEnd(null);
      return;
    }
    if (d < start) {
      setEnd(start);
      setStart(d);
    } else {
      setEnd(d === start ? null : d);
    }
  }

  const summary = !start ? 'Выберите день' : end ? `${formatYmd(start)} — ${formatYmd(end)}` : formatYmd(start);
  const navBtn = (enabled) => ({
    width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.ink}18`, background: 'transparent',
    color: t.ink, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.25, fontSize: 14,
  });

  return (
    <div
      data-calendar-popover
      style={{
        position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 20, width: 280, maxWidth: '100%',
        background: '#fff', borderRadius: 14, padding: 14, border: `1px solid ${t.ink}15`,
        boxShadow: `0 12px 32px -8px ${t.ink}40`, fontFamily: t.fontUI, color: t.ink,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" disabled={!canPrev} onClick={() => canPrev && shiftMonth(-1)} style={navBtn(canPrev)} aria-label="Предыдущий месяц">‹</button>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{MONTHS[m - 1]} {y}</span>
        <button type="button" disabled={!canNext} onClick={() => canNext && shiftMonth(1)} style={navBtn(canNext)} aria-label="Следующий месяц">›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10.5, opacity: 0.45, padding: '2px 0' }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} />;
          const disabled = d > maxYmd || d < minYmd;
          const last = end || start;
          const isEdge = d === start || d === last;
          const inRange = start && end && d >= start && d <= end;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => pick(d)}
              style={{
                height: 34, borderRadius: 8, fontSize: 12, fontFamily: t.fontUI,
                fontWeight: isEdge ? 700 : 500,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.25 : 1,
                border: d === maxYmd && !isEdge ? `1px solid ${t.berry}66` : '1px solid transparent',
                background: isEdge ? t.berry : inRange ? `${t.berry}1A` : 'transparent',
                color: isEdge ? '#fff' : t.ink,
              }}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs" style={{ opacity: 0.6 }}>{summary}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!start}
          onClick={() => onApply({ from: start, to: end || start })}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 100, border: 'none', fontSize: 12, fontWeight: 700,
            fontFamily: t.fontUI, background: t.berry, color: '#fff',
            cursor: start ? 'pointer' : 'default', opacity: start ? 1 : 0.5,
          }}
        >
          Применить
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '7px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: t.fontUI,
            border: `1.5px solid ${t.ink}20`, background: 'transparent', color: t.ink, cursor: 'pointer',
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function SubTitle({ children }) {
  return (
    <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: t.ink, fontFamily: t.fontUI }}>
      {children}
    </h3>
  );
}

function Table({ head, rows, empty = 'Нет данных.', className = '' }) {
  return (
    <div className={className}>
      <DataTable head={head} rows={rows} empty={empty} />
    </div>
  );
}
