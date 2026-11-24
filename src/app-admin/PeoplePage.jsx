/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * «Люди»: каждый посетитель за период — откуда пришёл, докуда дошёл, —
 * и по клику вся его история по порядку: заходы, шаги конструктора,
 * вход, черновик, оплата, напоминания, действия админа. Аккаунт
 * склеивает устройства: если человек вошёл с телефона и с компьютера,
 * история общая. Свои браузеры (где был вход админом) не показываем.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import {
  A, Card, PageHeader, SectionTitle, StatGrid, Stat, DataTable, Segmented, Badge, Button, Drawer, inputStyle, money, num, formatDateTime,
} from './adminUi.jsx';
import { InvitationDrawer } from './InvitationDrawer.jsx';

export const STAGE = {
  visit: ['Посмотрел сайт', 'neutral', 0],
  recipient: ['Получатель приглашения', 'accent', 1],
  builder: ['Открыл конструктор', 'accent', 2],
  publish_click: ['Нажал «Оплатить»', 'warn', 3],
  draft: ['Сохранил черновик', 'warn', 4],
  payment: ['Ушёл на оплату', 'warn', 5],
  paid: ['Оплатил', 'good', 6],
};

const SOURCE = { ig: 'Instagram', fb: 'Facebook', direct: 'Напрямую', partner: 'Партнёр', senti: 'Приглашение' };

// Человеческие названия событий для истории
const EVENT = {
  page_view: 'Открыл страницу',
  landing_cta_click: 'Нажал «Создать» на главной',
  landing_dashboard_click: 'Нажал «Кабинет»',
  landing_demo_start: 'Начал демо на главной',
  landing_demo_finish: 'Досмотрел демо',
  builder_start: 'Открыл конструктор',
  builder_gender: 'Выбрал пол (старый шаг)',
  builder_step: 'Шаг конструктора',
  builder_blocked_no_name: 'Не ввёл имя — конструктор не пустил дальше',
  publish_blocked_no_name: 'Нажал «Оплатить» без имени',
  builder_publish_click: 'Нажал «Оплатить»',
  payment_method_choose: 'Выбрал способ оплаты',
  promo_applied: 'Применил промокод',
  promo_invalid: 'Ввёл неверный промокод',
  auth_view: 'Увидел экран входа',
  auth_start: 'Начал вход',
  auth_success: 'Вошёл',
  auth_error: 'Ошибка входа',
  auth_resume: 'Вернулся после входа',
  draft_created: 'Черновик сохранён',
  payment_redirect: 'Ушёл на страницу Click',
  payment_success: 'Оплата прошла',
  publish_error: 'Ошибка при оплате',
  invitation_published_free: 'Опубликовал бесплатно',
  invitation_edited: 'Отредактировал приглашение',
  invite_view: 'Открыл приглашение (получатель)',
  invite_step: 'Шаг приглашения (получатель)',
  invite_submit: 'Ответил на приглашение',
  recipient_cta_click: 'Получатель нажал «Сделать своё»',
  recipient_story_click: 'Получатель: «В сторис»',
  recipient_story_shared: 'Получатель поделился в сторис',
  support_open: 'Открыл поддержку',
  guest_session_unavailable: 'Гостевой вход недоступен',
};

const STEP_NAME = { question: 'приглашение', reaction: 'подтверждение', date: 'дата', choice_place: 'места и еда', final: 'финал', style: 'оформление' };

function describe(e) {
  const p = e.props || {};
  if (e.event === 'page_view') return `${EVENT.page_view} ${e.path || ''}`;
  if (e.event === 'builder_step') return `Шаг ${Number(p.index ?? 0) + 1}: ${STEP_NAME[p.step] || p.step || ''}`;
  if (e.event === 'payment_method_choose') return `${EVENT.payment_method_choose}: ${p.method === 'card' ? 'картой' : p.method === 'payme' ? 'Payme' : 'CLICK'}`;
  if (e.event === 'publish_error') return `${EVENT.publish_error}: ${p.message || ''}`;
  if (e.event === 'auth_start' || e.event === 'auth_success' || e.event === 'auth_error') {
    return `${EVENT[e.event]}${p.provider ? ` (${String(p.provider).replace('custom:', '')})` : ''}${p.message ? `: ${p.message}` : ''}`;
  }
  if (e.event === 'promo_applied' || e.event === 'promo_invalid') return `${EVENT[e.event]}: ${p.code || ''}`;
  if (e.event === 'invite_step') return `${EVENT.invite_step}: ${STEP_NAME[p.step] || p.step || ''}`;
  return EVENT[e.event] || e.event;
}

function eventTone(event) {
  if (['payment_success', 'invitation_published_free', 'invite_submit', 'auth_success'].includes(event)) return A.good;
  if (['publish_error', 'auth_error', 'builder_blocked_no_name', 'publish_blocked_no_name', 'promo_invalid'].includes(event)) return A.bad;
  if (['builder_publish_click', 'payment_redirect', 'draft_created', 'payment_method_choose'].includes(event)) return A.warn;
  return A.muted;
}

function gap(a, b) {
  const m = (new Date(b) - new Date(a)) / 60000;
  if (m < 30) return null;
  if (m < 120) return `через ${Math.round(m)} мин`;
  if (m < 48 * 60) return `через ${Math.round(m / 60)} ч`;
  return `через ${Math.round(m / 1440)} дн`;
}

/** Склеиваем подряд идущие одинаковые события (5 просмотров одной страницы) */
function compact(events) {
  const out = [];
  for (const e of events) {
    const last = out[out.length - 1];
    const label = describe(e);
    if (last && last.label === label && new Date(e.at) - new Date(last.lastAt) < 10 * 60000) {
      last.count += 1; last.lastAt = e.at;
    } else {
      out.push({ ...e, label, count: 1, lastAt: e.at });
    }
  }
  return out;
}

export function JourneyDrawer({ visitorId, userId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openInvitation, setOpenInvitation] = useState(null);

  useEffect(() => {
    if (!visitorId && !userId) return;
    setData(null); setError(null);
    supabase.rpc('admin_visitor_journey', { p_visitor: visitorId || null, p_user: userId || null }).then(({ data: d, error: e }) => {
      if (e) setError(e.message); else setData(d);
    });
  }, [visitorId, userId]);

  const timeline = useMemo(() => {
    if (!data) return [];
    const items = [
      ...compact(data.events || []).map((e) => ({ kind: 'event', at: e.at, ...e })),
      ...(data.payments || []).map((p) => ({ kind: 'payment', at: p.created_at, ...p })),
      ...(data.reminders || []).map((r) => ({ kind: 'reminder', at: r.sent_at, ...r })),
      ...(data.actions || []).map((a) => ({ kind: 'action', ...a })),
    ];
    return items.sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [data]);

  const user = data?.users?.[0];
  const firstEvent = data?.events?.[0];

  return (
    <Drawer
      open={Boolean(visitorId || userId)}
      onClose={onClose}
      title={user ? (user.email || user.name || 'Пользователь') : 'Посетитель без аккаунта'}
      subtitle={firstEvent ? `Впервые: ${formatDateTime(firstEvent.at)} · ${SOURCE[firstEvent.source] || firstEvent.source || 'напрямую'}${firstEvent.campaign ? ` · кампания ${firstEvent.campaign}` : ''} · ${firstEvent.device || ''}` : ''}
    >
      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}
      {!data && !error && <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>}
      {data && (
        <>
          {user && (
            <Card pad={12} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
                <div>Вход: <b>{String(user.provider || '').replace('custom:', '') || '—'}</b> · аккаунт с {formatDateTime(user.created_at)}</div>
                <div>Бот @sentiuz_bot: {user.has_bot ? <Badge tone="good">подключён</Badge> : <Badge>нет</Badge>}{user.telegram ? ` · @${user.telegram}` : ''}</div>
                {data.devices > 1 && <div>Устройств: <b>{data.devices}</b> — история общая</div>}
              </div>
            </Card>
          )}

          {(data.invitations || []).length > 0 && (
            <>
              <SectionTitle style={{ marginTop: 0 }}>Приглашения</SectionTitle>
              <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                {data.invitations.map((i) => (
                  <Card key={i.id} pad={10} style={{ cursor: 'pointer' }}>
                    <div onClick={() => setOpenInvitation(i.id)} role="button" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                      <span><b>{i.recipient_name || 'без имени'}</b> <span style={{ color: A.muted }}>· {formatDateTime(i.created_at)}</span></span>
                      <span>
                        <Badge tone={i.status === 'published' ? 'good' : i.status === 'draft' ? 'warn' : 'neutral'}>{{ draft: 'черновик', published: 'опубликовано', expired: 'истекло', archived: 'в архиве' }[i.status] || i.status}</Badge>
                        {Number(i.view_count) > 0 && <span style={{ color: A.muted, marginLeft: 6 }}>👁 {i.view_count}</span>}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          <SectionTitle style={{ marginTop: 0 }} hint="Подряд идущие одинаковые действия склеены (×N)">История</SectionTitle>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {timeline.map((item, idx) => {
              const prev = timeline[idx - 1];
              const pause = prev ? gap(prev.at, item.at) : null;
              let text; let color = A.muted; let icon = '•';
              if (item.kind === 'event') { text = item.label; color = eventTone(item.event); }
              if (item.kind === 'payment') {
                icon = '₸';
                color = item.status === 'paid' ? A.good : item.status === 'pending' ? A.warn : A.bad;
                text = `Платёж ${money(item.amount)} — ${{ paid: 'оплачен', pending: 'не завершён', failed: 'отменён', refunded: 'возвращён' }[item.status] || item.status}${item.promo_code ? ` · промокод ${item.promo_code}` : ''}`;
              }
              if (item.kind === 'reminder') {
                icon = '⏰'; color = A.berry;
                text = `Напоминание об оплате ${item.delivered === false ? '— не доставлено' : 'отправлено'}`;
              }
              if (item.kind === 'action') {
                icon = '🛠'; color = A.ink;
                text = `Админ: ${{ publish_free: 'опубликовал бесплатно', extend: `продлил на ${item.details?.days} дн`, unpublish: 'снял с публикации', restore: 'вернул публикацию', refund: 'отметил возврат', message: `написал: «${item.details?.text || ''}»` }[item.action] || item.action}`;
              }
              return (
                <li key={`${item.kind}-${idx}`}>
                  {pause && <div style={{ fontSize: 11.5, color: A.muted, margin: '6px 0 6px 22px' }}>⋯ {pause}</div>}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0', fontSize: 13 }}>
                    <span style={{ width: 12, color, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                    <span style={{ color: A.muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontSize: 12 }}>
                      {new Date(item.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}
                    </span>
                    <span style={{ color: item.kind === 'event' && color === A.muted ? A.ink : color, wordBreak: 'break-word' }}>
                      {text}{item.count > 1 && <span style={{ color: A.muted }}> ×{item.count}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {(data.events || []).length >= 600 && <p style={{ fontSize: 12, color: A.muted }}>Показаны последние 600 событий.</p>}
        </>
      )}
      <InvitationDrawer id={openInvitation} onClose={() => setOpenInvitation(null)} />
    </Drawer>
  );
}

export default function PeoplePage() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('builder_plus');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);

  async function load(d = days) {
    setError(null); setRows(null);
    const { data, error: err } = await supabase.rpc('admin_visitors', { p_days: d });
    if (err) { setError(err.message); setRows([]); return; }
    setRows(data || []);
  }
  useEffect(() => { load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of rows || []) c[r.stage] = (c[r.stage] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (stage === 'builder_plus' && STAGE[r.stage]?.[2] < 2) return false;
      if (stage === 'stuck' && !['publish_click', 'draft', 'payment'].includes(r.stage)) return false;
      if (!['all', 'builder_plus', 'stuck'].includes(stage) && r.stage !== stage) return false;
      if (!q) return true;
      return [r.owner, r.campaign, r.source, r.visitor_id].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, stage, query]);

  const builderPlus = (rows || []).filter((r) => STAGE[r.stage]?.[2] >= 2).length;
  const stuck = (counts.publish_click || 0) + (counts.draft || 0) + (counts.payment || 0);

  return (
    <div>
      <PageHeader
        title="Люди"
        subtitle="Каждый посетитель и его путь по сайту. Нажми на строку — откроется вся история по порядку."
        actions={<Button size="sm" onClick={() => load()}>↻ Обновить</Button>}
      />
      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}

      <div style={{ marginBottom: 12 }}>
        <Segmented value={days} onChange={setDays} options={[
          { value: 1, label: 'Сутки' }, { value: 7, label: '7 дней' }, { value: 30, label: '30 дней' },
        ]} />
      </div>

      <StatGrid style={{ marginBottom: 16 }}>
        <Stat label="Посетители" value={num((rows || []).length)} sub={(rows || []).length >= 1000 ? 'показаны последние 1000' : undefined} />
        <Stat label="Открыли конструктор" value={num(builderPlus)} />
        <Stat label="Застряли на оплате" value={num(stuck)} sub="нажали «Оплатить», но не заплатили" alert={stuck > 0} />
        <Stat label="Оплатили" value={num(counts.paid || 0)} />
      </StatGrid>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: почта, кампания, источник" style={{ ...inputStyle, flex: '1 1 220px' }} />
        <Segmented value={stage} onChange={setStage} options={[
          { value: 'builder_plus', label: 'Дошли до конструктора', count: builderPlus },
          { value: 'stuck', label: 'Застряли на оплате', count: stuck },
          { value: 'paid', label: 'Оплатили', count: counts.paid || 0 },
          { value: 'recipient', label: 'Получатели', count: counts.recipient || 0 },
          { value: 'all', label: 'Все', count: (rows || []).length },
        ]} />
      </div>

      {rows === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 1, dir: 'desc' }}
          head={['Кто', 'Последний раз', { label: 'Дошёл до', align: 'left' }, 'Шаг', 'Источник', 'Кампания', 'Устройство', 'Визиты', 'Событий']}
          rows={filtered.map((r) => {
            const [label, tone, order] = STAGE[r.stage] || [r.stage, 'neutral', 0];
            return {
              key: r.visitor_id,
              onClick: () => setOpen({ visitorId: r.visitor_id }),
              cells: [
                { d: r.owner || <span style={{ color: A.muted }}>аноним · {String(r.visitor_id).slice(0, 6)}</span>, v: r.owner || null },
                { d: formatDateTime(r.last_seen), v: r.last_seen },
                { d: <span><Badge tone={tone}>{label}</Badge>{r.had_error && <span title="Была ошибка" style={{ marginLeft: 6 }}>⚠️</span>}</span>, v: order },
                { d: r.max_step ? `${r.max_step}` : '—', v: r.max_step || null },
                SOURCE[r.source] || r.source,
                { d: r.campaign ? <span title={r.campaign}>…{String(r.campaign).slice(-6)}</span> : '—', v: r.campaign || null },
                r.device || '—',
                { d: num(r.sessions), v: Number(r.sessions) },
                { d: num(r.events), v: Number(r.events) },
              ],
            };
          })}
          empty="Под фильтр никто не попал."
        />
      )}

      <JourneyDrawer visitorId={open?.visitorId} userId={open?.userId} onClose={() => setOpen(null)} />
    </div>
  );
}
