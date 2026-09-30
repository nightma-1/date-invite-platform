/**
 * © 2026 Senti. Все права защищены.
 *
 * Настройка i18next. Три языка интерфейса: русский, узбекский, английский.
 * Выбор языка сохраняется в localStorage и переживает перезагрузку страницы.
 * Контент самого приглашения (вопрос, варианты и т.д.) сюда не входит —
 * это данные, которые автор приглашения пишет сам на любом языке.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ru from './locales/ru.js';
import uz from './locales/uz.js';
import en from './locales/en.js';

export const SUPPORTED_LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      uz: { translation: uz },
      en: { translation: en },
    },
    fallbackLng: 'ru',
    supportedLngs: ['ru', 'uz', 'en'],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'senti-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
