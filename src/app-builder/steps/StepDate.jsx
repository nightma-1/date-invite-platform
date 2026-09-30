/**
 * © 2026 Senti. Все права защищены.
 *
 * Дата и время настраиваются на одной странице — получатель тоже видит
 * их на одном экране (см. DateTimeScreen.jsx + InvitationRuntime.jsx).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, Inp, TxtArea, CharCount, GifImagePicker } from '../BuilderUI.jsx';
import { registerBlobMediaType } from '../../components/ui/SmartMedia.jsx';

export default function StepDate() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === 'date').configuration_json;
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
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'date', payload });
  }

  function handleFileChange(e) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      e.target.value = '';
      clearPendingMedia('date');
      update({ mediaUrl: null });
      return;
    }
    setPendingMedia('date', file);
    const previewUrl = URL.createObjectURL(file);
    registerBlobMediaType(previewUrl, file.type);
    update({ mediaUrl: previewUrl });
  }

  function removeMedia() {
    clearPendingMedia('date');
    update({ mediaUrl: null });
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <SectionCard number="1" title={t('steps.date.imageTitle')}>
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

      <SectionCard number="2" title={t('steps.date.sectionTitle')}>
        <FieldLabel>{t('steps.date.whoPicks')}</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { value: 'recipient_picks', label: t('steps.date.recipientPicks') },
            { value: 'creator_sets', label: t('steps.date.creatorSets') },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ mode: opt.value })}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                border: `1.5px solid ${config.mode === opt.value ? T.pink : '#e0e0e0'}`,
                background: config.mode === opt.value ? T.pinkLight : 'white',
                color: T.dark,
                fontFamily: T.font,
                fontSize: 14,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {config.mode === 'creator_sets' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>{t('steps.date.date')}</FieldLabel>
              <Inp
                type="date"
                value={config.fixedDate || ''}
                onChange={(e) => update({ fixedDate: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>{t('steps.date.time')}</FieldLabel>
              <Inp
                type="time"
                value={config.fixedTime || ''}
                onChange={(e) => update({ fixedTime: e.target.value })}
              />
            </div>
          </div>
        )}

        <FieldLabel>{t('steps.date.title')}</FieldLabel>
        <TxtArea
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('steps.date.titlePlaceholder')}
          rows={2}
          maxLength={300}
        />
        <CharCount value={config.title} max={300} />

        <FieldLabel style={{ marginTop: 12 }}>{t('steps.date.buttonText')}</FieldLabel>
        <Inp
          value={config.buttonText || ''}
          onChange={(e) => update({ buttonText: e.target.value })}
          placeholder={t('steps.date.buttonPlaceholder')}
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 4, fontFamily: T.font }}>
          {t('steps.date.buttonHint')}
        </p>
      </SectionCard>
    </div>
  );
}
