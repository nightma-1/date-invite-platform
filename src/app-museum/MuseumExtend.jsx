/**
 * © 2026 Senti. Все права защищены.
 *
 * Продление срока из кабинета. Цену считает сервер, отсюда уходит только срок.
 * В этом файле нет three.js, поэтому кабинет не тяжелеет.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './museumI18n.js';
import { supabase } from '../lib/supabaseClient.js';
import { MUSEUM_TERMS } from '../lib/museumPlans.js';

export default function MuseumExtend({ invitationId }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pay(termDays) {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ invitationId, purpose: 'extend', termDays }),
      });
      const body = await res.json();
      if (res.ok && body.extended) {
        window.location.reload(); // владелец продлевает без оплаты
        return;
      }
      if (res.ok && body.paymentUrl) {
        window.location.href = body.paymentUrl;
        return;
      }
      alert(body.error || t('museum.extend.failed'));
    } catch {
      alert(t('museum.extend.failed'));
    }
    setBusy(false);
  }

  const chip = { borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', background: 'white', color: '#b23a62', border: '1.5px solid #b23a62' };
  if (!open) return <button type="button" style={chip} onClick={() => setOpen(true)}>{t('museum.extend.action')}</button>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {MUSEUM_TERMS.map((term) => (
        <button key={term.days} type="button" disabled={busy} style={chip} onClick={() => pay(term.days)}>
          {t(`museum.builder.terms.${term.key}`)} · {term.extend.toLocaleString(i18n.language)}
        </button>
      ))}
    </span>
  );
}
