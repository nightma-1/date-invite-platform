/**
 * © 2026 Senti.
 * "I love you" на разных языках — для фонового облака фраз в сцене галактики.
 * Список намеренно не привязан к i18n проекта: это декоративный контент
 * одной конкретной сцены, а не UI-строки интерфейса.
 */
/**
 * Узбекский, русский и английский — родные для наших получателей, их должно
 * быть видно в первую очередь: именно они попадают в крупные читаемые слова
 * и чаще других встречаются в тексте портрета. Остальные языки создают
 * ощущение «весь мир говорит это тебе».
 */
export const PRIMARY_LANGS = ['uz', 'ru', 'en'];

export const LOVE_WORDS = [
  { lang: 'uz', text: 'Men seni sevaman' },
  { lang: 'uz', text: 'Seni yaxshi ko‘raman' },
  { lang: 'uz', text: 'Sevaman seni' },
  { lang: 'ru', text: 'Я люблю тебя' },
  { lang: 'ru', text: 'Люблю тебя' },
  { lang: 'ru', text: 'Ты моё всё' },
  { lang: 'en', text: 'I love you' },
  { lang: 'en', text: 'I’m in love with you' },
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
  { lang: 'ka', text: 'მე შენ მიყვარხარ' },
  { lang: 'hy', text: 'Ես քեզ սիրում եմ' },
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

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

export const PRIMARY_WORDS = LOVE_WORDS.filter((w) => PRIMARY_LANGS.includes(w.lang));

/** Родные языки идут первыми, дальше — остальной мир в случайном порядке. */
export function pickLoveWords(count) {
  const primary = shuffle(PRIMARY_WORDS);
  const rest = shuffle(LOVE_WORDS.filter((w) => !PRIMARY_LANGS.includes(w.lang)));
  return [...primary, ...rest].slice(0, count);
}

/** Индексы родных языков внутри результата pickLoveWords. */
export function primaryIndices(words) {
  const out = [];
  words.forEach((w, i) => { if (PRIMARY_LANGS.includes(w.lang)) out.push(i); });
  return out.length ? out : words.map((_, i) => i);
}
