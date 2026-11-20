/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Стартовые тексты приглашения на трёх языках. Язык приглашения = язык,
 * выбранный в конструкторе (переключатель в шапке): при смене языка все поля,
 * которые автор ещё не переписал сам, переводятся на новый язык, а сам язык
 * сохраняется в приглашении (question.configuration_json.lang), чтобы у
 * получателя кнопки и подписи были на том же языке, а не на языке его браузера.
 *
 * Поле считается "не тронутым", если его текущее значение совпадает с любым
 * из известных дефолтов (любой язык, любой род). Свой текст автора не трогаем.
 */

export const INVITE_LANGS = ['ru', 'uz', 'en'];

export function normalizeLang(lang) {
  const short = String(lang || '').slice(0, 2).toLowerCase();
  return INVITE_LANGS.includes(short) ? short : 'ru';
}

// n — без рода (по умолчанию: пол получателя больше не спрашиваем).
// m/f — только для старых приглашений, где пол был выбран: род получателя ('recipient') или отправителя ('sender', см. GENDER_DIRECTION)
const TEXTS = {
  ru: {
    question: { questionText: 'Пойдёшь со мной на свидание?', yesText: 'Да, конечно ❤️', noText: 'Нет' },
    reaction: {
      title: { n: 'Подожди, это правда «да»?', m: 'Подожди, ты действительно сказал да?', f: 'Подожди, ты действительно сказала да?' },
      text: { n: 'Честно, это лучший ответ, на который можно было надеяться ахах', m: 'Я был готов что скажешь «нет» ахах', f: 'Я была готова что скажешь «нет» ахах' },
      confirmText: 'Да Да ДА!',
    },
    date: {
      title: { n: 'Итак... когда тебе удобно?', m: 'И так... Когда ты свободен?', f: 'И так... Когда ты свободна?' },
      buttonText: 'Выбери дату и время 💌',
    },
    choice_place: {
      title: 'Куда пойдём?',
      options: { opt_place_1: 'Кино', opt_place_2: 'Ресторан', opt_place_3: 'Прогулка', opt_place_4: 'Боулинг', opt_place_5: 'Кафе', opt_place_6: 'Своё' },
    },
    choice_food: {
      title: 'Что будем есть?',
      options: { opt_food_1: 'Пицца', opt_food_2: 'Суши', opt_food_3: 'Бургеры', opt_food_4: 'Паста', opt_food_5: 'Салаты', opt_food_6: 'Десерт' },
    },
    final: { title: 'Ну всё, теперь пути назад нет 😄❤️', description: 'Наше свидание официально запланировано!' },
  },
  uz: {
    question: { questionText: 'Men bilan uchrashuvga borasanmi?', yesText: 'Ha, albatta ❤️', noText: "Yo'q" },
    reaction: {
      title: 'Kutib tur, sen rostdan ham ha deding-a?',
      text: "«Yo'q» deysan deb tayyor edim hahaha",
      confirmText: 'Ha Ha HA!',
    },
    date: {
      title: "Xo'sh... qachon bo'sh bo'lasan?",
      buttonText: 'Sana va vaqtni tanla 💌',
    },
    choice_place: {
      title: 'Qayerga boramiz?',
      options: { opt_place_1: 'Kino', opt_place_2: 'Restoran', opt_place_3: 'Sayr', opt_place_4: 'Bouling', opt_place_5: 'Kafe', opt_place_6: 'Boshqa' },
    },
    choice_food: {
      title: 'Nima yeymiz?',
      options: { opt_food_1: 'Pitsa', opt_food_2: 'Sushi', opt_food_3: 'Burgerlar', opt_food_4: 'Pasta', opt_food_5: 'Salatlar', opt_food_6: 'Desert' },
    },
    final: { title: "Xo'sh, endi orqaga yo'l yo'q 😄❤️", description: 'Uchrashuvimiz rasman rejalashtirildi!' },
  },
  en: {
    question: { questionText: 'Will you go on a date with me?', yesText: 'Yes, of course ❤️', noText: 'No' },
    reaction: {
      title: 'Wait, did you really just say yes?',
      text: 'I was ready for you to say "no" haha',
      confirmText: 'Yes Yes YES!',
    },
    date: {
      title: 'So... when are you free?',
      buttonText: 'Pick a date and time 💌',
    },
    choice_place: {
      title: 'Where shall we go?',
      options: { opt_place_1: 'Cinema', opt_place_2: 'Restaurant', opt_place_3: 'A walk', opt_place_4: 'Bowling', opt_place_5: 'Café', opt_place_6: 'Something else' },
    },
    choice_food: {
      title: 'What shall we eat?',
      options: { opt_food_1: 'Pizza', opt_food_2: 'Sushi', opt_food_3: 'Burgers', opt_food_4: 'Pasta', opt_food_5: 'Salads', opt_food_6: 'Dessert' },
    },
    final: { title: "That's it, no turning back now 😄❤️", description: 'Our date is officially planned!' },
  },
};

// «Ответить приглашением»: получательница после своего «да» собирает
// ответное. Меняем только вопрос и заголовок финала — остальное как у
// обычного приглашения. Эти тексты тоже считаются «не тронутыми» и при
// смене языка переводятся в ответный же вариант, а не в обычный.
const REPLY_TEXTS = {
  ru: {
    question: { questionText: 'Теперь моя очередь. Пойдёшь со мной на свидание?' },
    final: { title: 'В этот раз позвал(а) я 😄❤️' },
  },
  uz: {
    question: { questionText: 'Endi navbat menda. Men bilan uchrashuvga borasanmi?' },
    final: { title: 'Bu safar men taklif qildim 😄❤️' },
  },
  en: {
    question: { questionText: 'My turn now. Will you go on a date with me?' },
    final: { title: 'This time I asked 😄❤️' },
  },
};

function isReplyDefault(stepType, field, current) {
  if (current == null) return false;
  return INVITE_LANGS.some((l) => REPLY_TEXTS[l]?.[stepType]?.[field] === current);
}

/** Шаги-заготовка ответного приглашения: обычные + свои вопрос и финал */
export function applyReplyTexts(steps, lang) {
  const l = normalizeLang(lang);
  return steps.map((s) => {
    const reply = REPLY_TEXTS[l][s.step_type];
    return reply ? { ...s, configuration_json: { ...s.configuration_json, ...reply } } : s;
  });
}

// Фраза обращена к получателю ('recipient') или написана от лица отправителя
// ('sender' — предполагаем пару, где род отправителя обратный полу получателя).
const GENDER_DIRECTION = { 'reaction.text': 'sender' };

const PLAIN_FIELDS = {
  question: ['questionText', 'yesText', 'noText'],
  reaction: ['title', 'text', 'confirmText'],
  date: ['title', 'buttonText'],
  choice_place: ['title'],
  choice_food: ['title'],
  final: ['title', 'description'],
};

function genderKey(stepType, field, recipientGender) {
  const direction = GENDER_DIRECTION[`${stepType}.${field}`] || 'recipient';
  // Пол не выбран (теперь так у всех новых приглашений) — нейтральные тексты
  if (recipientGender !== 'male' && recipientGender !== 'female') return 'n';
  const g = recipientGender === 'female' ? 'f' : 'm';
  return direction === 'sender' ? (g === 'f' ? 'm' : 'f') : g;
}

function pick(value, gk) {
  return value && typeof value === 'object' ? (value[gk] ?? value.m) : value;
}

function allVariants(value) {
  return value && typeof value === 'object' ? Object.values(value) : [value];
}

/** Дефолт поля на нужном языке с учётом рода */
function defaultFor(lang, stepType, field, recipientGender) {
  return pick(TEXTS[lang]?.[stepType]?.[field], genderKey(stepType, field, recipientGender));
}

/** Совпадает ли текст с каким-либо дефолтом этого поля (на любом языке, в любом роде) */
function isKnownDefault(stepType, field, current) {
  if (current == null) return false;
  return INVITE_LANGS.some((l) => allVariants(TEXTS[l]?.[stepType]?.[field]).includes(current));
}

function isKnownOptionDefault(stepType, optionId, current) {
  return INVITE_LANGS.some((l) => TEXTS[l]?.[stepType]?.options?.[optionId] === current);
}

/** Шаги-заготовка для нового черновика сразу на нужном языке */
export function buildDefaultConfigs(lang, recipientGender = null) {
  const l = normalizeLang(lang);
  const d = (step, field) => defaultFor(l, step, field, recipientGender);
  const opts = (step, icons) => Object.entries(TEXTS[l][step].options).map(([id, label], i) => ({ id, icon: icons[i], label }));
  return {
    question: { recipientName: '', questionText: d('question', 'questionText'), yesText: d('question', 'yesText'), noText: d('question', 'noText'), mediaUrl: null, lang: l },
    reaction: { title: d('reaction', 'title'), text: d('reaction', 'text'), confirmText: d('reaction', 'confirmText'), mediaUrl: null },
    date: { mode: 'recipient_picks', title: d('date', 'title'), buttonText: d('date', 'buttonText') },
    choice_place: { title: d('choice_place', 'title'), allowMultiple: false, options: opts('choice_place', ['🎬', '🍽️', '🚶', '🎳', '☕', '✨']) },
    choice_food: { title: d('choice_food', 'title'), allowMultiple: false, options: opts('choice_food', ['🍕', '🍣', '🍔', '🍝', '🥗', '🍦']) },
    final: { title: d('final', 'title'), description: d('final', 'description'), mediaUrl: null },
  };
}

/**
 * Перевести (и подправить род) все ещё не тронутые автором поля на язык lang.
 * Свои тексты автора остаются как есть.
 */
export function localizeSteps(steps, lang, recipientGender) {
  const l = normalizeLang(lang);
  return steps.map((s) => {
    const fields = PLAIN_FIELDS[s.step_type];
    if (!fields) return s;
    const cfg = s.configuration_json || {};
    const next = { ...cfg };
    let changed = false;

    for (const field of fields) {
      if (isReplyDefault(s.step_type, field, cfg[field])) {
        const target = REPLY_TEXTS[l][s.step_type][field];
        if (target !== cfg[field]) { next[field] = target; changed = true; }
        continue;
      }
      if (!isKnownDefault(s.step_type, field, cfg[field])) continue;
      const target = defaultFor(l, s.step_type, field, recipientGender);
      if (target != null && target !== cfg[field]) { next[field] = target; changed = true; }
    }

    if (Array.isArray(cfg.options)) {
      const translated = cfg.options.map((o) => {
        if (!isKnownOptionDefault(s.step_type, o.id, o.label)) return o;
        const target = TEXTS[l][s.step_type]?.options?.[o.id];
        return target && target !== o.label ? { ...o, label: target } : o;
      });
      if (translated.some((o, i) => o !== cfg.options[i])) { next.options = translated; changed = true; }
    }

    if (s.step_type === 'question' && cfg.lang !== l) { next.lang = l; changed = true; }

    return changed ? { ...s, configuration_json: next } : s;
  });
}

/** Язык уже сохранённого приглашения (или null у старых — до появления поля) */
export function invitationLang(steps) {
  const lang = (steps || []).find((s) => s.step_type === 'question')?.configuration_json?.lang;
  return lang && INVITE_LANGS.includes(lang) ? lang : null;
}

const FALLBACK_RECIPIENT = { ru: 'Тебя', uz: 'Seni', en: 'You' };

/** Обращение вместо имени, если имя не заполнено — на языке приглашения */
export function fallbackRecipientName(lang) {
  return FALLBACK_RECIPIENT[normalizeLang(lang)];
}
