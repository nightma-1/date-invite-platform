/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, TxtArea, CharCount, GifImagePicker } from '../BuilderUI.jsx';

export default function StepFinal() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === 'final').configuration_json;
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [gifsError, setGifsError] = useState(null);

  useEffect(() => {
    if (gifs.length > 0 || gifsLoading) return;
    setGifsLoading(true);
    setGifsError(null);
    listActiveGifs()
      .then(setGifs)
      .catch(() => setGifsError(t('builderUI.gifsLoadError')))
      .finally(() => setGifsLoading(false));
  }, []);

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'final', payload });
  }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      clearPendingMedia('final');
      update({ mediaUrl: null });
      return;
    }
    setPendingMedia('final', file);
    update({ mediaUrl: URL.createObjectURL(file) });
  }

  function removeMedia() {
    clearPendingMedia('final');
    update({ mediaUrl: null });
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <SectionCard number="1" title={t('steps.final.imageTitle')}>
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
          accept="image/jpeg,image/png,image/webp,image/gif,video/webm,video/mp4"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {fileError && (
          <p style={{ color: '#C0392B', fontSize: 12, marginTop: 4, fontFamily: T.font }}>{fileError}</p>
        )}
      </SectionCard>

      <SectionCard number="2" title={t('steps.final.titleSection')}>
        <TxtArea
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('steps.final.titlePlaceholder')}
          rows={2}
          maxLength={300}
        />
        <CharCount value={config.title} max={300} />
      </SectionCard>

      <SectionCard number="3" title={t('steps.final.descriptionSection')}>
        <TxtArea
          value={config.description || ''}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={t('steps.final.descriptionPlaceholder')}
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.description} max={300} />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.5, fontFamily: T.font }}>
          {t('steps.final.descriptionHint')}
        </p>
      </SectionCard>
    </div>
  );
}
