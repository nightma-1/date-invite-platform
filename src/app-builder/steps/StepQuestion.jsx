/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useBuilder } from '../builderStore.jsx';
import QuestionScreen, { DEFAULT_NO_PHRASES } from '../../components/screens/QuestionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, Inp, TxtArea, CharCount, GifImagePicker, CardShapePicker } from '../BuilderUI.jsx';

export default function StepQuestion() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [gifsError, setGifsError] = useState(null);

  // Load gifs on mount
  useEffect(() => {
    if (gifs.length > 0 || gifsLoading) return;
    setGifsLoading(true);
    setGifsError(null);
    listActiveGifs()
      .then(setGifs)
      .catch(() => setGifsError('Не получилось загрузить гифки. Попробуй ещё раз.'))
      .finally(() => setGifsLoading(false));
  }, []);

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'question', payload });
  }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      clearPendingMedia('question');
      update({ mediaUrl: null });
      return;
    }
    setPendingMedia('question', file);
    update({ mediaUrl: URL.createObjectURL(file) });
  }

  function selectGif(url) {
    clearPendingMedia('question');
    update({ mediaUrl: url });
  }

  function removeMedia() {
    clearPendingMedia('question');
    update({ mediaUrl: null });
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <SectionCard number="1" title="Картинка на экране">
        <GifImagePicker
          currentUrl={config.mediaUrl}
          gifs={gifs}
          gifsLoading={gifsLoading}
          gifsError={gifsError}
          onSelect={selectGif}
          onRemove={removeMedia}
          onUploadClick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {fileError && (
          <p style={{ color: '#C0392B', fontSize: 12, marginTop: 4, fontFamily: T.font }}>{fileError}</p>
        )}
      </SectionCard>

      <SectionCard number="2" title="Форма карточки">
        <CardShapePicker
          value={state.cardShape}
          onChange={(cardShape) => dispatch({ type: 'SET_CARD_SHAPE', cardShape })}
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.4, fontFamily: T.font }}>
          Форма применится ко всем экранам приглашения — не только к этому.
        </p>
      </SectionCard>

      <SectionCard number="3" title="Текст приглашения">
        <FieldLabel>Имя получателя</FieldLabel>
        <Inp
          type="text"
          value={config.recipientName}
          onChange={(e) => update({ recipientName: e.target.value })}
          placeholder="Имя"
        />

        <FieldLabel style={{ marginTop: 12 }}>Твой вопрос</FieldLabel>
        <TxtArea
          value={config.questionText}
          onChange={(e) => update({ questionText: e.target.value })}
          placeholder="Пойдёшь со мной на свидание?"
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.questionText} max={300} />

        <FieldLabel style={{ marginTop: 12 }}>Кнопка «Да»</FieldLabel>
        <Inp
          type="text"
          value={config.yesText}
          onChange={(e) => update({ yesText: e.target.value })}
          placeholder="Да, конечно ❤️"
        />

        <FieldLabel style={{ marginTop: 12 }}>Кнопка «Нет»</FieldLabel>
        <Inp
          type="text"
          value={config.noText || ''}
          onChange={(e) => update({ noText: e.target.value })}
          placeholder="Нет"
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.4, fontFamily: T.font }}>
          Кнопка «Нет» всегда убегает — это фирменная механика.
        </p>
      </SectionCard>

      {/* Live preview */}
      <div style={{ marginTop: 8, padding: '12px 0' }}>
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font }}>
          Превью
        </p>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <QuestionScreen
            recipientName={config.recipientName || 'Муниса'}
            questionText={config.questionText || 'Пойдёшь со мной на свидание?'}
            mediaUrl={config.mediaUrl}
            yesText={config.yesText || 'Да, конечно ❤️'}
            noPhrases={config.noText ? [config.noText, ...DEFAULT_NO_PHRASES.slice(1)] : undefined}
            tokens={tokens}
            cardShape={state.cardShape}
            onYes={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
