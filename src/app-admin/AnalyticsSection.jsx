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
import { getTemplateTokens } from '../templates/registry.js';
import TicketCard from '../components/ui/TicketCard.jsx';

const t = getTemplateTokens('romantic');

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
  { key: 'pageviews',       label: 'Просмотры страниц' },
  { key: 'builder_started', label: 'Открыли конструктор' },
  { key: 'drafts',          label: 'Черновики' },
  { key: 'paid',            label: 'Оплаты' },
  { key: 'revenue',         label: 'Выручка, сум' },
  { key: 'invite_views',    label: 'Просмотры приглашений' },
  { key: 'responses',       label: 'Ответы получателей' },
];

const num = (v) => Number(v || 0).toLocaleString('ru-RU');
const money = (v) => `${Number(v || 0).toLocaleString('ru-RU')} сум`;

function percent(part, whole) {
  if (!whole) return '—';
  return `${((Number(part || 0) / Number(whole)) * 100).toFixed(1).replace('.0', '')}%`;
}

function formatDay(iso) {
  // '2026-10-11' → '11.10'
  const [, m, d] = String(iso).split('-');
  return d && m ? `${d}.${m}` : String(iso);
}

export default function AnalyticsSection() {
  const [preset, setPreset] = useState('30d');
  const [range, setRange] = useState(() => PRESETS.find((p) => p.key === '30d').range());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('visitors');

  const rangeLabel = range.from === range.to
    ? formatYmd(range.from)
    : `${formatYmd(range.from)} — ${formatYmd(range.to)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: rpcError } = await supabase.rpc('admin_analytics', {
      p_from: dayStartIso(range.from),
      p_to: dayEndIso(range.to),
    });
    if (rpcError) {
      // Самый частый случай — миграция аналитики ещё не применена к базе
      setError(
        /function|does not exist|schema cache/i.test(rpcError.message || '')
          ? 'Аналитика ещё не включена в базе: примените миграцию supabase/migrations/…_site_analytics.sql.'
          : (rpcError.message || 'Не получилось загрузить аналитику.')
      );
      setData(null);
    } else {
      setData(result);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals || {};
  const alltime = data?.alltime || {};
  const daily = data?.daily || [];

  // Воронка: каждый шаг считаем и от начала (сколько дошло с самого верха),
  // и от предыдущего шага (где именно теряем людей).
  const funnel = useMemo(() => {
    const steps = [
      { label: 'Зашли на сайт',         value: totals.visitors },
      { label: 'Открыли конструктор',   value: totals.builder_started },
      { label: 'Дошли до «Опубликовать»', value: totals.builder_finished },
      { label: 'Вошли в аккаунт',       value: totals.auth_passed },
      { label: 'Ушли на оплату',        value: totals.payment_started },
      { label: 'Оплатили',              value: totals.paid },
    ];
    const top = Number(steps[0].value || 0);
    return steps.map((s, i) => ({
      ...s,
      value: Number(s.value || 0),
      ofTop: top ? Number(s.value || 0) / top : 0,
      ofPrev: i === 0 || !steps[i - 1].value ? null : Number(s.value || 0) / Number(steps[i - 1].value),
    }));
  }, [totals]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
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

      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        Период: {rangeLabel} · по времени Ташкента
      </p>

      {error && (
        <p className="mb-4 text-sm" style={{ color: '#C0392B', fontFamily: t.fontUI }}>{error}</p>
      )}
      {loading && !data && <p className="text-sm opacity-60">Считаем…</p>}

      {data && (
        <>
          {data.has_events === false && (
            <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI, lineHeight: 1.5 }}>
              Событий посещений за этот период пока нет — счётчик начинает собирать их с момента
              выкатки. Цифры по черновикам, оплатам и ответам ниже берутся из базы и верны всегда.
            </p>
          )}

          {/* Главные цифры периода */}
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Посетители" value={num(totals.visitors)} sub={`новых: ${num(totals.new_visitors)}`} />
            <Stat label="Сессии" value={num(totals.sessions)} sub={`${num(totals.pageviews)} просмотров страниц`} />
            <Stat label="Оплаты" value={num(totals.paid)} sub={`из ${num(totals.payments_started)} попыток`} />
            <Stat label="Выручка" value={money(totals.revenue)} sub={`конверсия ${percent(totals.paid, totals.visitors)}`} />
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Регистрации" value={num(totals.signups)} />
            <Stat label="Черновики" value={num(totals.drafts)} sub={`опубликовано: ${num(totals.published)}`} />
            <Stat label="Просмотры приглашений" value={num(totals.invite_views)} sub={`уникальных: ${num(totals.invite_viewers)}`} />
            <Stat
              label="Ответы получателей"
              value={num(totals.responses)}
              sub={`«Да»: ${num(totals.responses_yes)} · обращений в поддержку: ${num(totals.support_tickets)}`}
            />
          </div>

          {/* Воронка */}
          <SubTitle>Воронка: от захода до оплаты</SubTitle>
          <div className="mb-8 space-y-1.5">
            {funnel.map((step) => (
              <div key={step.label}>
                <div className="flex items-baseline justify-between text-xs" style={{ fontFamily: t.fontUI, color: t.ink }}>
                  <span>{step.label}</span>
                  <span style={{ opacity: 0.6 }}>
                    {num(step.value)}
                    {step.ofPrev !== null && <> · {(step.ofPrev * 100).toFixed(0)}% от предыдущего</>}
                  </span>
                </div>
                <div style={{ height: 10, background: `${t.ink}0D`, borderRadius: 5, overflow: 'hidden', marginTop: 3 }}>
                  <div
                    style={{
                      width: `${Math.max(step.ofTop * 100, step.value > 0 ? 1.5 : 0)}%`,
                      height: '100%',
                      background: t.berry,
                      borderRadius: 5,
                      transition: 'width .3s ease-out',
                    }}
                  />
                </div>
              </div>
            ))}
            {funnel[0].value === 0 && (
              <p className="pt-1 text-xs" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI }}>
                Верх воронки считается по событиям счётчика — пока их нет, шаги пустые.
              </p>
            )}
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
            <DayBars
              rows={daily}
              metric={metric}
              label={CHART_METRICS.find((m) => m.key === metric)?.label || ''}
              isMoney={metric === 'revenue'}
            />
          </div>

          {/* Источники */}
          <SubTitle>Источники трафика</SubTitle>
          <Table
            className="mb-8"
            head={['Источник', 'Посетители', 'Сессии', 'Открыли конструктор', 'Дошли до оплаты']}
            rows={(data.sources || []).map((s) => [
              s.source === 'direct' ? 'Прямые заходы' : s.source,
              num(s.visitors), num(s.sessions), num(s.builder_started), num(s.payment_started),
            ])}
            empty="Пока нет данных о переходах."
          />

          {(data.campaigns?.length > 0 || data.ref_codes?.length > 0) && (
            <div className="mb-8 grid gap-6 md:grid-cols-2">
              {data.campaigns?.length > 0 && (
                <div>
                  <SubTitle>UTM-кампании</SubTitle>
                  <Table
                    head={['Кампания', 'Канал', 'Посетители']}
                    rows={data.campaigns.map((c) => [c.campaign, c.medium, num(c.visitors)])}
                  />
                </div>
              )}
              {data.ref_codes?.length > 0 && (
                <div>
                  <SubTitle>Реферальные ссылки (?ref=)</SubTitle>
                  <Table
                    head={['Код', 'Посетители']}
                    rows={data.ref_codes.map((r) => [r.code, num(r.visitors)])}
                  />
                </div>
              )}
            </div>
          )}

          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <div>
              <SubTitle>Устройства</SubTitle>
              <Table
                head={['Устройство', 'Посетители']}
                rows={(data.devices || []).map((d) => [d.device, num(d.visitors)])}
                empty="Нет данных."
              />
            </div>
            <div>
              <SubTitle>Языки браузера</SubTitle>
              <Table
                head={['Язык', 'Посетители']}
                rows={(data.langs || []).map((l) => [l.lang, num(l.visitors)])}
                empty="Нет данных."
              />
            </div>
          </div>

          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <div>
              <SubTitle>Страницы</SubTitle>
              <Table
                head={['Страница', 'Просмотры', 'Посетители']}
                rows={(data.pages || []).map((p) => [p.path, num(p.views), num(p.visitors)])}
                empty="Нет данных."
              />
            </div>
            <div>
              <SubTitle>Шаблоны в созданных приглашениях</SubTitle>
              <Table
                head={['Шаблон', 'Приглашений']}
                rows={(data.templates || []).map((x) => [x.template, num(x.count)])}
                empty="За период приглашений не создавали."
              />
            </div>
          </div>

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
          <Table
            className="mb-8"
            head={['Событие', 'Раз', 'Посетителей']}
            rows={(data.events || []).map((e) => [e.event, num(e.count), num(e.visitors)])}
            empty="Событий нет."
          />

          {/* За всё время — чтобы не путать период с общими итогами проекта */}
          <SubTitle>За всё время</SubTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Пользователей" value={num(alltime.users)} />
            <Stat label="Приглашений" value={num(alltime.invitations)} sub={`опубликовано: ${num(alltime.published)}`} />
            <Stat label="Оплат" value={num(alltime.paid)} />
            <Stat label="Выручка" value={money(alltime.revenue)} sub={`ответов: ${num(alltime.responses)} (да: ${num(alltime.responses_yes)})`} />
          </div>
        </>
      )}
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

  const peak = values.indexOf(max);
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
        {/* Подписываем только края и пик — число под каждым столбиком нечитаемо */}
        {Array.from(new Set([0, rows.length - 1])).map((i) => (
          <text
            key={`ax-${i}`} x={i * (barW + GAP) + barW / 2} y={H + 13}
            textAnchor={i === 0 ? 'start' : 'end'} fontSize="10"
            fill={t.ink} opacity="0.5" fontFamily={t.fontUI}
          >
            {formatDay(rows[i].day)}
          </text>
        ))}
        {max > 0 && (
          <text
            x={peak * (barW + GAP) + barW / 2}
            y={Math.max(10, H - (values[peak] / max) * H - 4)}
            textAnchor="middle" fontSize="10" fill={t.ink} opacity="0.7" fontFamily={t.fontUI}
          >
            {isMoney ? num(max) : num(max)}
          </text>
        )}
      </svg>
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
    <h3 className="mb-2 text-sm font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
      {children}
    </h3>
  );
}

function Stat({ label, value, sub }) {
  return (
    <TicketCard tokens={t}>
      <div className="p-4">
        <p className="text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>{label}</p>
        <p className="text-xl" style={{ color: t.ink, fontFamily: t.fontDisplay, fontWeight: 700 }}>{value}</p>
        {sub && <p className="text-[11px]" style={{ color: t.ink, opacity: 0.45, fontFamily: t.fontUI }}>{sub}</p>}
      </div>
    </TicketCard>
  );
}

function Table({ head, rows, empty = 'Нет данных.', className = '' }) {
  if (!rows || rows.length === 0) {
    return <p className={`text-sm opacity-60 ${className}`}>{empty}</p>;
  }
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-xs" style={{ fontFamily: t.fontUI, color: t.ink, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? 'left' : 'right', padding: '6px 8px', opacity: 0.5,
                  fontWeight: 600, borderBottom: `1px solid ${t.ink}15`, whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? 'left' : 'right', padding: '6px 8px',
                    borderBottom: `1px solid ${t.ink}0D`,
                    whiteSpace: ci === 0 ? 'normal' : 'nowrap',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
