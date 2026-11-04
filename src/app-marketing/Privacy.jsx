/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Политика конфиденциальности. Тексты живут здесь, а не в i18n: это
 * самостоятельный документ, его удобнее читать и править целиком.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { T } from '../app-builder/BuilderUI.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { SUPPORT_BOT_URL } from '../lib/support.js';

const CONTENT = {
  ru: {
    title: 'Политика конфиденциальности',
    updated: 'Обновлено 4 ноября 2026 года',
    back: 'На главную',
    support: 'Написать в поддержку',
    sections: [
      ['Кто мы', 'Senti (senti.uz) — сервис для создания онлайн-приглашений. Сервисом управляет индивидуальный предприниматель в Узбекистане.'],
      ['Какие данные мы получаем', 'Адрес электронной почты и данные для входа; содержимое приглашений, которое ты создаёшь, включая загруженные фото и GIF; ответы получателей на приглашения; статус платежа; обезличенную статистику посещений сайта. Данные банковской карты вводятся на стороне Click, и мы их не получаем.'],
      ['Зачем они нужны', 'Чтобы создавать и показывать приглашения, принимать оплату, сообщать тебе об ответах, отвечать в поддержке и улучшать сервис.'],
      ['Реклама и Meta Pixel', 'На сайте работает Meta Pixel. Он передаёт компании Meta сведения о просмотрах страниц, начале оплаты и покупке, а также технические данные браузера. Это помогает измерять рекламу в Facebook и Instagram и показывать её подходящим людям. На страницах самих приглашений Meta Pixel не работает. Мы не передаём Meta почту, имена и тексты приглашений. Рекламными предпочтениями можно управлять в настройках аккаунта Meta.'],
      ['Кому передаются данные', 'Поставщикам, которые обеспечивают работу сервиса: Supabase (база данных и вход), Vercel (хостинг), Click (оплата), Telegram (уведомления и поддержка) и Meta (измерение рекламы). Мы не продаём персональные данные.'],
      ['Срок хранения', 'Опубликованное приглашение доступно по ссылке 7 дней. Данные аккаунта хранятся, пока он нужен для работы сервиса или пока этого требует закон.'],
      ['Твои права', 'Ты можешь попросить показать, исправить или удалить свои данные, написав в поддержку.'],
    ],
  },
  uz: {
    title: 'Maxfiylik siyosati',
    updated: '2026-yil 4-noyabrda yangilangan',
    back: 'Bosh sahifa',
    support: "Qo'llab-quvvatlashga yozish",
    sections: [
      ['Biz kimmiz', "Senti (senti.uz) — onlayn taklifnomalar yaratish xizmati. Xizmatni O'zbekistondagi yakka tartibdagi tadbirkor boshqaradi."],
      ['Qanday maʼlumotlarni olamiz', "Elektron pochta manzili va kirish maʼlumotlari; siz yaratgan taklifnoma mazmuni, jumladan yuklangan foto va GIF; qabul qiluvchilarning javoblari; to'lov holati; saytga tashriflarning anonim statistikasi. Bank kartasi maʼlumotlari Click tomonida kiritiladi va biz ularni olmaymiz."],
      ['Nima uchun kerak', "Taklifnomalarni yaratish va ko'rsatish, to'lovni qabul qilish, javoblar haqida xabar berish, yordam ko'rsatish va xizmatni yaxshilash uchun."],
      ['Reklama va Meta Pixel', "Saytda Meta Pixel ishlaydi. U Meta kompaniyasiga sahifalarni ko'rish, to'lovni boshlash va xarid haqidagi maʼlumotlarni hamda brauzerning texnik maʼlumotlarini yuboradi. Bu Facebook va Instagramdagi reklamani o'lchash va uni mos odamlarga ko'rsatishga yordam beradi. Taklifnoma sahifalarida Meta Pixel ishlamaydi. Biz Metaga pochta, ism va taklifnoma matnlarini bermaymiz. Reklama sozlamalarini Meta hisobingizda boshqarishingiz mumkin."],
      ['Maʼlumotlar kimga beriladi', "Xizmat ishlashini taʼminlaydigan yetkazib beruvchilarga: Supabase (maʼlumotlar bazasi va kirish), Vercel (xosting), Click (to'lov), Telegram (bildirishnomalar va yordam) va Meta (reklamani o'lchash). Biz shaxsiy maʼlumotlarni sotmaymiz."],
      ['Saqlash muddati', "Eʼlon qilingan taklifnoma havola orqali 7 kun ochiq bo'ladi. Hisob maʼlumotlari xizmat uchun kerak bo'lguncha yoki qonun talab qilguncha saqlanadi."],
      ['Sizning huquqlaringiz', "Qo'llab-quvvatlashga yozib, maʼlumotlaringizni ko'rsatish, tuzatish yoki o'chirishni so'rashingiz mumkin."],
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Updated November 4, 2026',
    back: 'Home',
    support: 'Contact support',
    sections: [
      ['Who we are', 'Senti (senti.uz) is a service for creating online invitations, run by an individual entrepreneur in Uzbekistan.'],
      ['What we collect', 'Your email address and sign-in data; the invitation content you create, including uploaded photos and GIFs; recipients’ answers; payment status; and anonymous site statistics. Card details are entered with Click, and we do not receive them.'],
      ['Why we use it', 'To create and show invitations, take payment, tell you about answers, provide support and improve the service.'],
      ['Ads and Meta Pixel', 'This site uses Meta Pixel. It sends Meta information about page views, checkout starts and purchases, along with technical browser data. This helps us measure Facebook and Instagram ads and show them to relevant people. Meta Pixel does not run on invitation pages. We do not send Meta emails, names or invitation text. You can manage ad preferences in your Meta account settings.'],
      ['Who receives data', 'Providers that run the service: Supabase (database and sign-in), Vercel (hosting), Click (payments), Telegram (notifications and support) and Meta (ad measurement). We do not sell personal data.'],
      ['How long we keep it', 'A published invitation stays available by link for 7 days. Account data is kept while needed for the service or required by law.'],
      ['Your rights', 'You can ask us to show, correct or delete your data by contacting support.'],
    ],
  },
};

export default function Privacy() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ru').slice(0, 2);
  const c = CONTENT[lang] || CONTENT.ru;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 56px', color: T.darkPurple, lineHeight: 1.6 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <Link to="/" style={{ color: T.pink, fontWeight: 600, textDecoration: 'none' }}>← {c.back}</Link>
        <LanguageSwitcher />
      </div>
      <h1 style={{ fontFamily: T.font, fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{c.title}</h1>
      <p style={{ color: T.muted, fontSize: 14, margin: '8px 0 24px' }}>{c.updated}</p>
      {c.sections.map(([heading, text]) => (
        <section key={heading} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{heading}</h2>
          <p style={{ color: T.muted }}>{text}</p>
        </section>
      ))}
      <a href={SUPPORT_BOT_URL} target="_blank" rel="noreferrer" style={{ color: T.pink, fontWeight: 600 }}>{c.support}</a>
    </main>
  );
}
