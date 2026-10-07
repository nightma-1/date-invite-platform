/**
 * © 2026 Senti.
 * Скрытая тестовая страница фичи galaxy-letter. Не в навигации, не в
 * builder/registry — доступна только тем, кто знает прямой адрес
 * /lab/galaxy-letter. Позволяет прогнать сцену целиком со своими данными
 * перед тем, как решать, подключать ли её к реальному конструктору.
 */
import { useState } from 'react';
import GalaxyLetterScene from './GalaxyLetterScene.jsx';

const DEFAULT_PARAGRAPHS = [
  'Я много раз пытался сказать тебе это красиво. Писал, стирал, снова писал.',
  'А потом понял, что мне не хватает одного языка. Моего «люблю» для тебя больше, чем помещается в одно сообщение.',
  'Поэтому я собрал его на всех языках мира. И каждое слово там про тебя.',
];

export default function GalaxyLetterLabPage() {
  const [recipientName, setRecipientName] = useState('Амира');
  const [letterHeading, setLetterHeading] = useState('Амира, это тебе');
  const [paragraphText, setParagraphText] = useState(DEFAULT_PARAGRAPHS.join('\n'));
  const [senderName, setSenderName] = useState('Данияр');
  const [finalCaption, setFinalCaption] = useState('Амира');
  const [finalSubcaption, setFinalSubcaption] = useState('я люблю тебя очень очень сильно');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [runKey, setRunKey] = useState(0);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
  }

  const paragraphs = paragraphText.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', background: '#0b0818', display: 'flex', flexWrap: 'wrap', gap: 24, padding: 24, fontFamily: '"Manrope", sans-serif' }}>
      <div style={{ width: 320, flexShrink: 0, color: '#e6e2ff' }}>
        <h1 style={{ fontSize: 16, marginBottom: 4 }}>🧪 Galaxy Letter — лаборатория</h1>
        <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 20 }}>
          Не публичный маршрут. Настрой данные слева, смотри справа, жми «сначала», чтобы перезапустить.
        </p>

        <Field label="Имя получателя">
          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Заголовок письма">
          <input value={letterHeading} onChange={(e) => setLetterHeading(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Текст письма (строка = абзац)">
          <textarea value={paragraphText} onChange={(e) => setParagraphText(e.target.value)} rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <Field label="Подпись отправителя">
          <input value={senderName} onChange={(e) => setSenderName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Фото для портрета-из-частиц">
          <input type="file" accept="image/*" onChange={handleFile} style={{ fontSize: 12, color: '#cfc9ff' }} />
        </Field>
        <Field label="...или URL фото (для быстрого теста)">
          <input
            placeholder="https://..."
            onBlur={(e) => {
              if (e.target.value.trim()) setPhotoUrl(e.target.value.trim());
            }}
            style={inputStyle}
          />
        </Field>
        <Field label="Подпись на портрете">
          <input value={finalCaption} onChange={(e) => setFinalCaption(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Подпись мельче">
          <input value={finalSubcaption} onChange={(e) => setFinalSubcaption(e.target.value)} style={inputStyle} />
        </Field>

        <button
          type="button"
          onClick={() => setRunKey((k) => k + 1)}
          style={{
            marginTop: 8, width: '100%', border: 'none', borderRadius: 10, padding: '10px 14px',
            background: '#5a3fc0', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}
        >
          ▶ Перезапустить сцену
        </button>

        {!photoUrl && (
          <p style={{ fontSize: 11, color: '#f5c768', marginTop: 12, lineHeight: 1.5 }}>
            Без фото финальная сцена не соберёт частицы — загрузи любую фотографию (локально, никуда не отправляется).
          </p>
        )}
      </div>

      <div style={{
        width: 375, height: 760, borderRadius: 36, overflow: 'hidden',
        boxShadow: '0 0 0 10px #1a1430, 0 30px 80px -20px rgba(0,0,0,0.7)',
        position: 'relative', flexShrink: 0,
      }}>
        <GalaxyLetterScene
          key={runKey}
          recipientName={recipientName}
          letterHeading={letterHeading}
          letterParagraphs={paragraphs}
          senderName={senderName}
          photoUrl={photoUrl}
          finalCaption={finalCaption}
          finalSubcaption={finalSubcaption}
          onRestartRequest={() => setRunKey((k) => k + 1)}
        />
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%', background: '#17122b', border: '1px solid #2e2550', borderRadius: 8,
  padding: '8px 10px', color: '#e6e2ff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};
