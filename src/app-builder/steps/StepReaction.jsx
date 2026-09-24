/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useBuilder } from '../builderStore.jsx';
import ReactionScreen from '../../components/screens/ReactionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, Inp, TxtArea, CharCount, GifImagePicker } from '../BuilderUI.jsx';

export default function StepReaction() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'reaction').configuration_json;
  const questionConfig = state.steps.find((s) => s.step_type === 'question').configuration_json;
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
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'reaction', payload });
  }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      clearPendingMedia('reaction');
      update({ mediaUrl: null });
      return;
    }
    setPendingMedia('reaction', file);
    update({ mediaUrl: URL.createObjectURL(file) });
  }

  function removeMedia() {
    clearPendingMedia('reaction');
    update({ mediaUrl: null });
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const currentMediaUrl = config.mediaUrl || questionConfig.mediaUrl;

  return (
    <div>
      <SectionCard number="1" title="Картинка на экране">
        <GifImagePicker
          currentUrl={currentMediaUrl}
          gifs={gifs}
          gifsLoading={gifsLoading}
          gifsError={gifsError}
          onSelect={(url) => { clearPendingMedia('reaction'); update({ mediaUrl: url }); }}
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

      <SectionCard number="2" title="Заголовок и кнопки">
        <FieldLabel>Заголовок</FieldLabel>
        <TxtArea
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Подожди, ты действительно сказал да?"
          rows={2}
          maxLength={300}
        />
        <CharCount value={config.title} max={300} />

        <FieldLabel style={{ marginTop: 12 }}>Подзаголовок</FieldLabel>
        <TxtArea
          value={config.text || ''}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="Я была готова что скажешь 'нет' ахах"
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.text} max={300} />

        <FieldLabel style={{ marginTop: 12 }}>Кнопка подтверждения</FieldLabel>
        <Inp
          value={config.confirmText || ''}
          onChange={(e) => update({ confirmText: e.target.value })}
          placeholder="Да Да ДА!"
        />
      </SectionCard>

      {/* Live preview */}
      <div style={{ marginTop: 8, padding: '12px 0' }}>
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font }}>
          Превью
        </p>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <ReactionScreen
            title={config.title}
            text={config.text}
            mediaUrl={currentMediaUrl}
            tokens={tokens}
            onContinue={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
