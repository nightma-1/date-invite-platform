/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useRef, useState } from 'react';
import { useBuilder } from '../builderStore.jsx';
import QuestionScreen from '../../components/screens/QuestionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';

// Подборка встроенных GIF по теме "романтика / приглашение"
const BUILT_IN_GIFS = [
  { url: 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif', label: '💕 Романтик' },
  { url: 'https://media.giphy.com/media/xT9IgDeNrJB2yUUEeQ/giphy.gif', label: '🌹 Цветы' },
  { url: 'https://media.giphy.com/media/l41YtZOb9EUABnuqA/giphy.gif', label: '🥰 Сердечки' },
  { url: 'https://media.giphy.com/media/3o6Zt8A3kNKnCnWp9m/giphy.gif', label: '🎉 Праздник' },
  { url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', label: '✨ Магия' },
  { url: 'https://media.giphy.com/media/3oEjHB1EKuujDjYoRi/giphy.gif', label: '🌙 Ночь' },
];

export default function StepQuestion() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [gifMode, setGifMode] = useState(false);

  function update(payload) { dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'question', payload }); }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) { setFileError(error); e.target.value = ''; clearPendingMedia(); update({ mediaUrl: null }); return; }
    setPendingMedia(file);
    update({ mediaUrl: URL.createObjectURL(file) });
  }

  function selectGif(url) {
    clearPendingMedia();
    update({ mediaUrl: url });
    setGifMode(false);
  }

  function removeMedia() {
    clearPendingMedia();
    update({ mediaUrl: null });
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const inp = {
    display: 'block', width: '100%',
    padding: '11px 14px', borderRadius: 6,
    border: `1.5px solid ${tokens.ink}20`,
    fontFamily: tokens.fontUI, fontSize: 14, color: tokens.ink,
    background: tokens.card, boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }} className="md:grid-cols-2">
        {/* Форма */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
              Имя получателя
            </label>
            <input type="text" value={config.recipientName} onChange={(e) => update({ recipientName: e.target.value })}
                   placeholder="Муниса" style={inp} />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
              Твой вопрос
            </label>
            <textarea
              value={config.questionText}
              onChange={(e) => update({ questionText: e.target.value })}
              placeholder="Пойдёшь со мной на свидание?"
              rows={3}
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
              Текст кнопки «Да»
            </label>
            <input type="text" value={config.yesText} onChange={(e) => update({ yesText: e.target.value })}
                   placeholder="Да, конечно ❤️" style={inp} />
            <p style={{ fontSize: 12, color: tokens.inkMuted || tokens.ink, opacity: 0.6, marginTop: 4 }}>
              Кнопка «Нет» всегда убегает — это фирменная механика.
            </p>
          </div>

          {/* GIF/Фото */}
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
              Фото или GIF
            </label>

            {/* Текущее изображение */}
            {config.mediaUrl && (
              <div style={{ marginBottom: 10, position: 'relative', display: 'inline-block' }}>
                <img src={config.mediaUrl} alt="превью"
                     style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                <button type="button" onClick={removeMedia}
                        style={{ position: 'absolute', top: -6, right: -6, background: '#C0392B', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ✕
                </button>
              </div>
            )}

            {/* Кнопки выбора */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 14px', borderRadius: 6, border: `1.5px solid ${tokens.ink}25`, background: 'transparent', cursor: 'pointer', fontSize: 13, color: tokens.ink, fontFamily: tokens.fontUI }}>
                📁 Загрузить файл
              </button>
              <button type="button" onClick={() => setGifMode(!gifMode)}
                      style={{ padding: '8px 14px', borderRadius: 6, border: `1.5px solid ${gifMode ? tokens.berry : tokens.ink + '25'}`, background: gifMode ? tokens.berry : 'transparent', cursor: 'pointer', fontSize: 13, color: gifMode ? '#fff' : tokens.ink, fontFamily: tokens.fontUI }}>
                🎬 Готовые GIF
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                   onChange={handleFileChange} style={{ display: 'none' }} />

            {fileError && <p style={{ color: '#C0392B', fontSize: 12, marginTop: 4 }}>{fileError}</p>}

            {/* GIF-галерея */}
            {gifMode && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
                {BUILT_IN_GIFS.map((gif) => (
                  <button key={gif.url} type="button" onClick={() => selectGif(gif.url)}
                          style={{ padding: 0, border: `2px solid ${config.mediaUrl === gif.url ? tokens.berry : 'transparent'}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'none' }}>
                    <img src={gif.url} alt={gif.label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Живое превью */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: tokens.inkMuted || tokens.ink, opacity: 0.6, marginBottom: 10 }}>
            Живое превью
          </p>
          <div style={{ maxWidth: 300, margin: '0 auto' }}>
            <QuestionScreen
              recipientName={config.recipientName || 'Муниса'}
              questionText={config.questionText || 'Пойдёшь со мной на свидание?'}
              mediaUrl={config.mediaUrl}
              yesText={config.yesText || 'Да, конечно ❤️'}
              tokens={tokens}
              onYes={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
