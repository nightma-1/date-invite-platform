/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import QuestionScreen, { DEFAULT_NO_PHRASES } from '../../components/screens/QuestionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { T, SectionCard, FieldLabel, Inp, TxtArea, CharCount, GifImagePicker, CardShapePicker } from '../BuilderUI.jsx';

export default function StepQuestion() {
  const { t } = useTranslation();
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
      .catch(() => setGifsError(t('builderUI.gifsLoadError')))
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
      <SectionCard number="1" title={t('steps.question.imageTitle')}>
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

      <SectionCard number="2" title={t('steps.question.cardShapeTitle')}>
        <CardShapePicker
          value={state.cardShape}
          onChange={(cardShape) => dispatch({ type: 'SET_CARD_SHAPE', cardShape })}
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.4, fontFamily: T.font }}>
          {t('steps.question.cardShapeHint')}
        </p>
      </SectionCard>

      <SectionCard number="3" title={t('steps.question.textTitle')}>
        <FieldLabel>{t('steps.question.recipientName')}</FieldLabel>
        <Inp
          type="text"
          value={config.recipientName}
          onChange={(e) => update({ recipientName: e.target.value })}
          placeholder={t('steps.question.recipientNamePlaceholder')}
        />

        <FieldLabel style={{ marginTop: 12 }}>{t('steps.question.yourQuestion')}</FieldLabel>
        <TxtArea
          value={config.questionText}
          onChange={(e) => update({ questionText: e.target.value })}
          placeholder={t('steps.question.questionPlaceholder')}
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.questionText} max={300} />

        <FieldLabel style={{ marginTop: 12 }}>{t('steps.question.yesButton')}</FieldLabel>
        <Inp
          type="text"
          value={config.yesText}
          onChange={(e) => update({ yesText: e.target.value })}
          placeholder={t('steps.question.yesPlaceholder')}
        />

        <FieldLabel style={{ marginTop: 12 }}>{t('steps.question.noButton')}</FieldLabel>
        <Inp
          type="text"
          value={config.noText || ''}
          onChange={(e) => update({ noText: e.target.value })}
          placeholder={t('steps.question.noPlaceholder')}
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.4, fontFamily: T.font }}>
          {t('steps.question.noButtonHint')}
        </p>
      </SectionCard>

      {/* Live preview */}
      <div style={{ marginTop: 8, padding: '12px 0' }}>
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font }}>
          {t('builderUI.preview')}
        </p>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <QuestionScreen
            recipientName={config.recipientName || t('steps.question.previewDefaultRecipient')}
            questionText={config.questionText || t('steps.question.previewDefaultQuestion')}
            mediaUrl={config.mediaUrl}
            yesText={config.yesText || t('steps.question.previewDefaultYes')}
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
