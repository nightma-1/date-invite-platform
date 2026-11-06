/**
 * © 2026 Senti. Все права защищены.
 *
 * Страница продукта. Цены берутся из museumPlans.js, поэтому менять их
 * нужно только там.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './museumI18n.js';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { track } from '../lib/analytics.js';
import { MUSEUM_TIERS } from '../lib/museumPlans.js';

const C = { night: '#2b1320', plum: '#7c2c4a', cream: '#fff8f0', gold: '#d9b26f', rose: '#f85589', ink: '#2b1320', muted: '#6b4d5a' };
const display = '"Cormorant Garamond", "PT Serif", serif';
const ui = 'Manrope, sans-serif';

const button = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: '12px 26px', borderRadius: 999, fontFamily: ui, fontSize: 15, fontWeight: 700, textDecoration: 'none' };

export default function MuseumAbout() {
  const { t, i18n } = useTranslation();
  useEffect(() => { track('museum_about_view'); }, []);
  const steps = t('museum.about.steps', { returnObjects: true });
  const features = t('museum.about.features', { returnObjects: true });
  const money = (n) => n.toLocaleString(i18n.language === 'en' ? 'en-US' : 'ru-RU');

  return (
    <div style={{ background: C.cream, color: C.ink, fontFamily: ui, minHeight: '100dvh' }}>
      <section style={{ background: `radial-gradient(120% 100% at 50% 0%, ${C.plum} 0%, ${C.night} 75%)`, color: C.cream, padding: '18px 20px 72px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 56 }}>
            <Link to="/" style={{ color: C.cream, fontWeight: 700, textDecoration: 'none', fontSize: 18 }}>Senti</Link>
            <LanguageSwitcher />
          </div>
          <p style={{ margin: 0, color: C.gold, fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t('museum.about.kicker')}</p>
          <h1 style={{ maxWidth: 700, margin: '14px 0', fontFamily: display, fontSize: 'clamp(42px, 8vw, 72px)', lineHeight: 1.03 }}>{t('museum.about.title')}</h1>
          <p style={{ maxWidth: 560, margin: '0 0 28px', fontSize: 18, lineHeight: 1.55, opacity: 0.88 }}>{t('museum.about.lead')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link to="/museum/create" data-testid="about-create" style={{ ...button, background: C.rose, color: '#fff' }}>{t('museum.about.create')}</Link>
            <Link to="/museum/demo" style={{ ...button, border: '1.5px solid rgba(255,255,255,.45)', color: C.cream }}>{t('museum.about.demo')}</Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '56px 20px 16px' }}>
        <h2 style={{ margin: '0 0 22px', fontFamily: display, fontSize: 36 }}>{t('museum.about.howTitle')}</h2>
        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 22, margin: 0, padding: 0, listStyle: 'none' }}>
          {steps.map((step, i) => (
            <li key={step.title}>
              <span style={{ fontFamily: display, fontSize: 40, color: C.plum }}>{i + 1}</span>
              <h3 style={{ margin: '2px 0 6px', fontSize: 17 }}>{step.title}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: C.muted }}>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 16px' }}>
        <h2 style={{ margin: '0 0 18px', fontFamily: display, fontSize: 36 }}>{t('museum.about.insideTitle')}</h2>
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px 26px', margin: 0, padding: 0, listStyle: 'none' }}>
          {features.map((item) => <li key={item} style={{ padding: '10px 0', borderBottom: '1px solid #ecdccf', fontSize: 15, lineHeight: 1.45 }}>{item}</li>)}
        </ul>
      </section>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 72px' }}>
        <h2 style={{ margin: '0 0 18px', fontFamily: display, fontSize: 36 }}>{t('museum.about.priceTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {MUSEUM_TIERS.map((tier) => (
            <div key={tier.key} style={{ padding: 22, borderRadius: 20, background: '#fff', border: '1px solid #ecdccf' }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t(`museum.builder.tiers.${tier.key}`)}</h3>
              <p style={{ margin: '4px 0 12px', fontSize: 14, color: C.muted }}>{t(tier.key === 'lite' ? 'museum.builder.tierLite' : 'museum.builder.tierFull')}</p>
              <b style={{ fontSize: 24 }}>{money(tier.price)} сум</b>
            </div>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 14, color: C.muted }}>{t('museum.about.priceNote')}</p>
      </section>
    </div>
  );
}
