/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useBuilder } from '../builderStore.jsx';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, Inp, GifImagePicker } from '../BuilderUI.jsx';

export default function StepTime() {
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === 'time').configuration_json;
  const dateConfig = state.steps.find((s) => s.step_type === 'date').configuration_json;
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [gifsError, setGifsError] = useState(null);

  // Time inherits mode from the Date step
  const mode = dateConfig.mode || 'recipient_picks';

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
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'time', payload });
  }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      clearPendingMedia();
      update({ mediaUrl: null });
      return;
    }
    setPendingMedia(file);
    update({ mediaUrl: URL.createObjectURL(file) });
  }

  function removeMedia() {
    clearPendingMedia();
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
          onSelect={(url) => update({ mediaUrl: url })}
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

      <SectionCard number="2" title="Заголовок экрана">
        {mode === 'creator_sets' && (
          <>
            <FieldLabel>Время</FieldLabel>
            <Inp
              type="time"
              value={config.fixedTime || ''}
              onChange={(e) => update({ fixedTime: e.target.value })}
              style={{ marginBottom: 12 }}
            />
          </>
        )}
        {mode === 'recipient_picks' && (
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 12, fontFamily: T.font }}>
            Режим наследуется от шага «Дата»: получатель выберет время сам.
          </p>
        )}
        <FieldLabel>Заголовок</FieldLabel>
        <Inp
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Во сколько? 🕒"
        />
      </SectionCard>
    </div>
  );
}
