/**
 * © 2026 Senti.
 * "I love you" на разных языках — для фонового облака фраз в сцене галактики.
 * Список намеренно не привязан к i18n проекта: это декоративный контент
 * одной конкретной сцены, а не UI-строки интерфейса.
 */
export const LOVE_WORDS = [
  { lang: 'ru', text: 'Я люблю тебя' },
  { lang: 'uz', text: 'Men seni sevaman' },
  { lang: 'en', text: 'I love you' },
  { lang: 'fr', text: 'Je t’aime' },
  { lang: 'es', text: 'Te amo' },
  { lang: 'it', text: 'Ti amo' },
  { lang: 'de', text: 'Ich liebe dich' },
  { lang: 'pt', text: 'Eu te amo' },
  { lang: 'tr', text: 'Seni seviyorum' },
  { lang: 'ar', text: 'أحبك' },
  { lang: 'fa', text: 'دوستت دارم' },
  { lang: 'ja', text: '愛しています' },
  { lang: 'ko', text: '사랑해' },
  { lang: 'zh', text: '我爱你' },
  { lang: 'hi', text: 'मैं तुमसे प्यार करता हूं' },
  { lang: 'kk', text: 'Мен сені жаксы көремін' },
  { lang: 'tg', text: 'Ман туро дуст дорам' },
  { lang: 'az', text: 'Mən səni sevirəm' },
  { lang: 'ka', text: 'მე შენ მიწვარულიხარ' },
  { lang: 'hy', text: 'Ես քեզ սերում եմ' },
  { lang: 'uk', text: 'Я тебе кохаю' },
  { lang: 'pl', text: 'Kocham cię' },
  { lang: 'nl', text: 'Ik hou van jou' },
  { lang: 'sv', text: 'Jag älskar dig' },
  { lang: 'fi', text: 'Minä rakastan sinua' },
  { lang: 'el', text: 'Σ αγαπώ' },
  { lang: 'he', text: 'אני אוהב אותך' },
  { lang: 'vi', text: 'Anh yêu em' },
  { lang: 'th', text: 'ฉันรักเธอ' },
  { lang: 'id', text: 'Aku cinta kamu' },
  { lang: 'sw', text: 'Nakupenda' },
  { lang: 'cs', text: 'Miluji tě' },
  { lang: 'ro', text: 'Te iubesc' },
  { lang: 'hu', text: 'Szeretlek' },
  { lang: 'bn', text: 'আমি তোমায় ভালোবাসি' },
  { lang: 'mn', text: 'Би чамайг хайртай' },
  { lang: 'ky', text: 'Мен сени сүйөмөн' },
];

export function pickLoveWords(count) {
  const pool = [...LOVE_WORDS];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(i, 1)[0]);
  }
  return result;
}
