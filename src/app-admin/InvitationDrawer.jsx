/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Всё об одном приглашении и действия с ним: открыть, опубликовать
 * бесплатно (блогеру, в тест, в извинение за сбой), продлить, снять с
 * публикации / вернуть, отметить возврат денег, написать автору в бот.
 * Каждое действие пишется в журнал admin_actions и видно здесь же и в
 * истории человека на странице «Люди».
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { A, Card, SectionTitle, Badge, Button, Drawer, inputStyle, money, formatDateTime } from './adminUi.jsx';

const STATUS = {
  draft: ['Черновик', 'warn'], published: ['Опубликовано', 'good'], expired: ['Истекло', 'neutral'], archived: ['В архиве', 'neutral'],
};
const PAY = { paid: ['оплачен', 'good'], pending: ['не завершён', 'warn'], failed: ['отменён', 'bad'], refunded: ['возвращён', 'neutral'] };
const STEP = { question: 'Приглашение', reaction: 'Подтверждение', date: 'Дата и время', choice_place: 'Куда пойдём', choice_food: 'Что поесть', final: 'Финал' };
const ACTION = {
  publish_free: 'Опубликовано бесплатно', extend: 'Продлено', unpublish: 'Снято с публикации',
  restore: 'Публикация возвращена', refund: 'Отмечен возврат', message: 'Сообщение автору',
};

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: A.muted }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{children}</span>
    </div>
  );
}

function stepSummary(s) {
  const c = s.config || {};
  if (s.type === 'question') return [c.questionText, c.yesText && `Да: «${c.yesText}»`, c.noText && `Нет: «${c.noText}»`].filter(Boolean).join(' · ');
  if (s.type === 'reaction') return [c.title, c.text].filter(Boolean).join(' — ');
  if (s.type === 'date') return c.mode === 'fixed' ? `Фиксированно: ${c.fixedDate || ''} ${c.fixedTime || ''}` : (c.title || 'Получатель выбирает');
  if (s.type === 'choice_place' || s.type === 'choice_food') return [c.title, (c.options || []).map((o) => o.label || o.text || o.title).filter(Boolean).join(', ')].filter(Boolean).join(': ');
  if (s.type === 'final') return [c.title, c.description].filter(Boolean).join(' — ');
  return '';
}

export function InvitationDrawer({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const { data: d, error: e } = await supabase.rpc('admin_invitation_detail', { p_id: id });
    if (e) setError(e.message); else setData(d);
  }, [id]);

  useEffect(() => { setData(null); setNotice(null); setMessage(''); load(); }, [load]);

  async function act(action, extra = {}, confirmText = null) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setNotice(null);
    const { error: e } = await supabase.rpc('admin_invitation_action', { p_id: id, p_action: action, p_days: extra.days ?? null, p_note: null });
    setBusy(false);
    if (e) { setNotice({ bad: true, text: e.message }); return; }
    setNotice({ text: 'Готово.' });
    await load(); onChanged?.();
  }

  async function refund(p) {
    if (!window.confirm(`Отметить возврат ${money(p.amount)}?\n\nЭто только отметка в Senti: сами деньги вернуть нужно в кабинете Click. Комиссия партнёра, если была, отменится.`)) return;
    const unpublish = window.confirm('Снять приглашение с публикации?\n\nOK — снять (ссылка перестанет открываться)\nОтмена — оставить опубликованным');
    const paymentId = p.id;
    setBusy(true); setNotice(null);
    const { error: e } = await supabase.rpc('admin_refund_payment', { p_payment: paymentId, p_unpublish: unpublish, p_note: null });
    setBusy(false);
    if (e) { setNotice({ bad: true, text: e.message }); return; }
    setNotice({ text: 'Возврат отмечен.' });
    await load(); onChanged?.();
  }

  async function send() {
    if (!message.trim()) return;
    setBusy(true); setNotice(null);
    const { data: ok, error: e } = await supabase.rpc('admin_message_user', { p_user: data.owner.id, p_text: message.trim(), p_invitation: id });
    setBusy(false);
    if (e) { setNotice({ bad: true, text: e.message }); return; }
    if (!ok) { setNotice({ bad: true, text: 'У автора не подключён бот — написать некуда.' }); return; }
    setMessage('');
    setNotice({ text: 'Отправлено в Telegram.' });
    await load();
  }

  const inv = data?.invitation;
  const [statusLabel, statusTone] = STATUS[inv?.status] || [inv?.status, 'neutral'];
  const response = data?.responses?.[data.responses.length - 1];

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      title={inv ? `Для ${inv.recipient_name || 'без имени'}` : 'Приглашение'}
      subtitle={inv ? `${data.owner?.email || data.owner?.name || '—'} · создано ${formatDateTime(inv.created_at)}` : ''}
    >
      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}
      {!data && !error && <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>}
      {inv && (
        <>
          <Card pad={12} style={{ marginBottom: 12 }}>
            <Row label="Статус"><Badge tone={statusTone}>{statusLabel}</Badge></Row>
            <Row label="Ссылка">{inv.status === 'draft' ? <span style={{ color: A.muted }}>появится после оплаты</span> : <a href={`/i/${inv.slug}`} target="_blank" rel="noreferrer" style={{ color: A.berry, fontWeight: 700 }}>senti.uz/i/{inv.slug} ↗</a>}</Row>
            {inv.published_at && <Row label="Опубликовано">{formatDateTime(inv.published_at)}</Row>}
            {inv.expires_at && <Row label="Действует до">{formatDateTime(inv.expires_at)}</Row>}
            <Row label="Просмотры получателем">{inv.view_count || 0}{inv.first_viewed_at ? ` · впервые ${formatDateTime(inv.first_viewed_at)}` : ''}</Row>
            <Row label="Ответ">{response ? (response.answered_yes ? <Badge tone="good">Да</Badge> : <Badge tone="warn">Нет</Badge>) : '—'}{response?.selected_date ? ` · ${response.selected_date} ${response.selected_time || ''}` : ''}</Row>
            <Row label="Оформление">{inv.template_key || '—'} · {inv.card_shape || 'classic'}</Row>
            <Row label="Бот у автора">{data.owner?.has_bot ? <Badge tone="good">есть</Badge> : <Badge>нет</Badge>}</Row>
          </Card>

          <SectionTitle style={{ marginTop: 0 }}>Действия</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {inv.status === 'draft' && (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => act('publish_free', {}, `Опубликовать приглашение для «${inv.recipient_name || 'без имени'}» бесплатно?`)}>
                Опубликовать бесплатно
              </Button>
            )}
            {['published', 'expired'].includes(inv.status) && (
              <>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ ...inputStyle, padding: '6px 8px', fontSize: 12.5 }} aria-label="На сколько продлить">
                  {[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} дн</option>)}
                </select>
                <Button size="sm" disabled={busy} onClick={() => act('extend', { days }, `Продлить на ${days} дн?`)}>Продлить</Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => act('unpublish', {}, 'Снять с публикации? Ссылка перестанет открываться.')}>Снять с публикации</Button>
              </>
            )}
            {inv.status === 'archived' && (
              <Button size="sm" disabled={busy} onClick={() => act('restore', {}, 'Вернуть публикацию?')}>Вернуть публикацию</Button>
            )}
          </div>
          {notice && <p style={{ fontSize: 12.5, color: notice.bad ? A.bad : A.good, margin: '0 0 8px' }}>{notice.text}</p>}

          <SectionTitle>Написать автору в @sentiuz_bot</SectionTitle>
          {data.owner?.has_bot ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={3500}
                placeholder="Например: «Видим, что оплата не прошла — вот промокод на скидку 20%: SORRY20»"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: A.fontUI }}
              />
              <div><Button size="sm" variant="primary" disabled={busy || !message.trim()} onClick={send}>Отправить</Button></div>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: A.muted, margin: 0 }}>Автор не подключил бота — написать можно только на почту{data.owner?.email ? `: ${data.owner.email}` : ''}.</p>
          )}

          <SectionTitle>Платежи</SectionTitle>
          {(data.payments || []).length === 0 ? <p style={{ fontSize: 12.5, color: A.muted, margin: 0 }}>Попыток оплаты не было.</p> : (
            <div style={{ display: 'grid', gap: 6 }}>
              {data.payments.map((p) => {
                const [l, tone] = PAY[p.status] || [p.status, 'neutral'];
                return (
                  <Card key={p.id} pad={10}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <span>{money(p.amount)} · {p.method === 'card' ? 'карта' : 'CLICK'}{p.promo_code ? ` · ${p.promo_code}` : ''} <span style={{ color: A.muted }}>· {formatDateTime(p.created_at)}</span></span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Badge tone={tone}>{l}</Badge>
                        {p.status === 'paid' && Number(p.amount) > 0 && <Button size="sm" disabled={busy} variant="danger" onClick={() => refund(p)}>Возврат</Button>}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <SectionTitle>Что внутри</SectionTitle>
          <div style={{ display: 'grid', gap: 6 }}>
            {(data.steps || []).map((s) => (
              <div key={`${s.type}-${s.order}`} style={{ fontSize: 12.5, opacity: s.enabled === false ? 0.5 : 1 }}>
                <b>{STEP[s.type] || s.type}</b>{s.enabled === false ? ' (выключен)' : ''}: <span style={{ color: A.ink }}>{stepSummary(s) || '—'}</span>
              </div>
            ))}
          </div>

          {(data.actions || []).length > 0 && (
            <>
              <SectionTitle>Журнал действий админа</SectionTitle>
              <div style={{ display: 'grid', gap: 4 }}>
                {data.actions.map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5 }}>
                    <span style={{ color: A.muted }}>{formatDateTime(a.at)}</span> · {ACTION[a.action] || a.action}
                    {a.details?.days ? ` на ${a.details.days} дн` : ''}{a.details?.text ? `: «${a.details.text}»` : ''}{a.details?.amount ? ` ${money(a.details.amount)}` : ''}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
