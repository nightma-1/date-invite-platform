/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Личный кабинет партнёра-инфлюенсера: ссылка, воронка и заработок.
 *
 * Все цифры приходят из RPC partner_stats() и таблицы partner_commissions,
 * закрытых RLS: партнёр физически не может увидеть чужие данные, даже если
 * подменит запрос в консоли. Поэтому здесь нет ни одной проверки прав —
 * если человек не партнёр, RPC просто вернёт пустой результат.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { getTemplateTokens } from '../templates/registry.js';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';
import {
  loadPartnerStats,
  loadPartnerCommissions,
  referralLink,
  formatSum,
} from '../lib/referral.js';

const t = getTemplateTokens('romantic');

const PAGE_BG_STYLE = {
  background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
  backgroundAttachment: 'fixed',
  backgroundSize: '100% 100vh',
  backgroundRepeat: 'no-repeat',
};

export default function PartnerPanel() {
  const { t: tr, i18n } = useTranslation();
  const [session, setSession] = useState(undefined);
  const [stats, setStats] = useState(undefined); // undefined = грузим, null = не партнёр
  const [commissions, setCommissions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      try {
        const s = await loadPartnerStats();
        if (cancelled) return;
        setStats(s);
        if (!s) return;
        const rows = await loadPartnerCommissions();
        if (!cancelled) setCommissions(rows);
      } catch (err) {
        if (!cancelled) {
          console.error('partner panel load failed', err);
          setError(tr('partner.loadError'));
          setStats(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [session, tr]);

  const link = stats ? referralLink(stats.code) : '';

  function copyLink() {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const wrap = (children) => (
    <div style={{ ...PAGE_BG_STYLE, minHeight: '100vh', position: 'relative' }}>
      <DecorativeBlobs />
      <div className="mx-auto max-w-2xl px-5 py-14" style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );

  if (session === undefined) {
    return wrap(<p className="text-sm opacity-60">{tr('partner.loading')}</p>);
  }

  if (!session) {
    return wrap(<AuthGate onAuthenticated={() => {}} />);
  }

  if (stats === undefined) {
    return wrap(<p className="text-sm opacity-60">{tr('partner.loading')}</p>);
  }

  // Не партнёр — это нормальная ситуация, а не ошибка: страницу может открыть
  // любой залогиненный человек. Объясняем по-человечески, без 404.
  if (!stats) {
    return wrap(
      <>
        <Header tr={tr} />
        <TicketCard tokens={t}>
          <div className="p-6">
            <p className="mb-2 text-base" style={{ color: t.ink, fontFamily: t.fontDisplay, fontWeight: 700 }}>
              {error ? tr('partner.errorTitle') : tr('partner.notPartnerTitle')}
            </p>
            <p className="text-sm" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
              {error || tr('partner.notPartnerText')}
            </p>
          </div>
        </TicketCard>
      </>
    );
  }

  const conversion = stats.clicks > 0
    ? ((Number(stats.paid_orders) / Number(stats.clicks)) * 100).toFixed(1)
    : '0.0';

  return wrap(
    <>
      <Header tr={tr} />

      <h1 className="mb-1 text-2xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>
        {tr('partner.title')}
      </h1>
      <p className="mb-8 text-sm" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        {tr('partner.subtitle', { percent: Number(stats.commission_percent) })}
      </p>

      {/* Ссылка — главное, зачем партнёр сюда заходит, поэтому она первым блоком */}
      <TicketCard tokens={t}>
        <div className="p-5">
          <p className="mb-2 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
            {tr('partner.yourLink')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 text-sm"
              style={{ background: T.pinkLight, color: t.berry, fontFamily: 'monospace', minWidth: 0 }}
            >
              {link}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg px-4 py-2 text-sm"
              style={{
                background: copied ? '#E7F6EC' : t.berry,
                color: copied ? '#1B7F43' : '#fff',
                fontFamily: t.fontUI, fontWeight: 700,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied ? tr('partner.copied') : tr('partner.copy')}
            </button>
          </div>
          <p className="mt-2 text-xs" style={{ color: t.ink, opacity: 0.45, fontFamily: t.fontUI }}>
            {tr('partner.linkHint')}
          </p>
        </div>
      </TicketCard>

      {/* Воронка */}
      <h2 className="mb-3 mt-10 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
        {tr('partner.funnelTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={tr('partner.clicks')} value={stats.clicks} sub={tr('partner.uniqueSub', { count: Number(stats.unique_visitors) })} />
        <StatCard label={tr('partner.signups')} value={stats.signups} />
        <StatCard label={tr('partner.paidOrders')} value={stats.paid_orders} />
        <StatCard label={tr('partner.conversion')} value={`${conversion}%`} sub={tr('partner.conversionSub')} />
      </div>

      {/* Деньги */}
      <h2 className="mb-3 mt-10 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
        {tr('partner.earningsTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={tr('partner.earnedTotal')} value={formatSum(stats.earned_total)} />
        <StatCard label={tr('partner.available')} value={formatSum(stats.available)} highlight />
        <StatCard label={tr('partner.onHold')} value={formatSum(stats.on_hold)} sub={tr('partner.onHoldSub')} />
        <StatCard label={tr('partner.paidOut')} value={formatSum(stats.paid_out)} />
      </div>

      <p className="mt-4 text-xs leading-relaxed" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI }}>
        {tr('partner.payoutNote')}
      </p>

      {/* История начислений */}
      <h2 className="mb-3 mt-10 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
        {tr('partner.historyTitle')}
      </h2>

      {commissions.length === 0 && (
        <p className="text-sm" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
          {tr('partner.historyEmpty')}
        </p>
      )}

      <div className="space-y-2">
        {commissions.map((c) => (
          <CommissionRow key={c.id} row={c} tr={tr} locale={i18n.language} />
        ))}
      </div>
    </>
  );
}

function Header({ tr }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs no-underline"
        style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}
      >
        {tr('partner.backHome')}
      </Link>
      <LanguageSwitcher />
    </div>
  );
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <TicketCard tokens={t}>
      <div className="p-4">
        <p className="text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>{label}</p>
        <p
          className="text-xl"
          style={{
            color: highlight ? t.berry : t.ink,
            fontFamily: t.fontDisplay,
            fontWeight: 700,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </p>
        {sub && <p className="text-xs" style={{ color: t.ink, opacity: 0.4, fontFamily: t.fontUI }}>{sub}</p>}
      </div>
    </TicketCard>
  );
}

const STATUS_STYLE = {
  pending: { bg: '#FFF4E5', fg: '#A96A00' },
  available: { bg: '#E7F6EC', fg: '#1B7F43' },
  paid: { bg: '#EAF0FB', fg: '#2B5FA8' },
  cancelled: { bg: '#F3F0F1', fg: '#8A7F84' },
};

function CommissionRow({ row, tr, locale }) {
  // В базе статус pending покрывает два разных для партнёра состояния:
  // «ещё на холде» и «уже можно выплачивать». Разделяем их здесь, чтобы
  // не плодить лишний cron-джоб только ради смены ярлыка.
  const onHold = row.status === 'pending' && new Date(row.available_at) > new Date();
  const key = row.status === 'pending' ? (onHold ? 'pending' : 'available') : row.status;
  const palette = STATUS_STYLE[key] || STATUS_STYLE.cancelled;
  const dateFmt = new Intl.DateTimeFormat(locale || 'ru', { day: 'numeric', month: 'short' });

  return (
    <div
      className="flex items-center justify-between gap-3 border-b py-2.5 text-sm"
      style={{ fontFamily: t.fontUI, borderColor: `${t.ink}14` }}
    >
      <div className="min-w-0">
        <p style={{ color: t.ink, fontWeight: 600 }}>
          {formatSum(row.commission_amount)}
        </p>
        <p className="text-xs" style={{ color: t.ink, opacity: 0.45 }}>
          {dateFmt.format(new Date(row.created_at))} · {tr('partner.fromOrder', {
            amount: Number(row.order_amount).toLocaleString('ru-RU'),
            percent: Number(row.commission_percent),
          })}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-1 text-xs"
        style={{ background: palette.bg, color: palette.fg, fontWeight: 700 }}
      >
        {tr(`partner.status.${key}`)}
        {onHold && ` · ${dateFmt.format(new Date(row.available_at))}`}
      </span>
    </div>
  );
}
