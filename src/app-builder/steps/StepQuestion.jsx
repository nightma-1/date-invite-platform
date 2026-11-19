/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import QuestionScreen from '../../components/screens/QuestionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import { listActiveGifs } from '../../lib/mediaLibrary.js';
import { isPlaceholderName, normalizeName } from '../../lib/shareLink.js';
import { T, SectionCard, FieldLabel, Inp, TxtArea, CharCount, GifImagePicker } from '../BuilderUI.jsx';
import { registerBlobMediaType } from '../../components/ui/SmartMedia.jsx';

export default function StepQuestion() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  // Подсвечиваем поле имени, только пока оно пустое после попытки оплатить.
  // Пустое имя и заглушки вроде «Имя» считаем одинаково — как и проверка в BuilderShell.
  const currentName = state.steps.find((s) => s.step_type === 'question')?.configuration_json?.recipientName;
  const nameMissing = Boolean(state.nameMissing) && (!normalizeName(currentName) || isPlaceholderName(currentName));
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState(null);
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [gifsError, setGifsError] = useState(null);
  // Тексты кнопок «Да/Нет» почти никто не меняет — прячем, чтобы первый
  // экран был короче (на нём уходило больше всего людей).
  const [showButtons, setShowButtons] = useState(false);

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
    const previewUrl = URL.createObjectURL(file);
    registerBlobMediaType(previewUrl, file.type);
    update({ mediaUrl: previewUrl });
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
      <SectionCard number="1" title={t('steps.question.textTitle')}>
        <FieldLabel>{t('steps.question.recipientName')}</FieldLabel>
        <Inp
          id="builder-recipient-name"
          type="text"
          autoComplete="off"
          value={config.recipientName}
          onChange={(e) => update({ recipientName: e.target.value })}
          placeholder={t('steps.question.recipientNamePlaceholder')}
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? 'builder-recipient-name-error' : undefined}
          style={nameMissing ? { borderColor: '#C0392B', boxShadow: '0 0 0 3px rgba(192,57,43,0.15)' } : undefined}
        />
        {nameMissing && (
          <p id="builder-recipient-name-error" role="alert" style={{ color: '#C0392B', fontSize: 13, fontFamily: T.font, margin: '6px 0 0' }}>
            {t('builder.nameRequired')}
          </p>
        )}

        <FieldLabel style={{ marginTop: 12 }}>{t('steps.question.yourQuestion')}</FieldLabel>
        <TxtArea
          value={config.questionText}
          onChange={(e) => update({ questionText: e.target.value })}
          placeholder={t('steps.question.questionPlaceholder')}
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.questionText} max={300} />

        <details style={{ marginTop: 14 }} open={showButtons} onToggle={(e) => setShowButtons(e.currentTarget.open)}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.pink, fontFamily: T.font, listStyle: 'none' }}>
            {showButtons ? '−' : '+'} {t('steps.question.editButtons')}
          </summary>
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
        </details>
      </SectionCard>

      <SectionCard number="2" title={t('steps.question.imageTitle')}>
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
          accept="image/jpeg,image/png,image/webp,image/gif,video/webm,video/mp4"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {fileError && (
          <p style={{ color: '#C0392B', fontSize: 12, marginTop: 4, fontFamily: T.font }}>{fileError}</p>
        )}
      </SectionCard>

      {/* Live preview — на широких экранах превью уже показано сбоку (см. BuilderShell) */}
      <div className="xl:hidden" style={{ marginTop: 8, padding: '12px 0' }}>
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font }}>
          {t('builderUI.preview')}
        </p>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <QuestionScreen
            recipientName={config.recipientName || t('steps.question.previewDefaultRecipient')}
            questionText={config.questionText || t('steps.question.previewDefaultQuestion')}
            mediaUrl={config.mediaUrl}
            yesText={config.yesText || t('steps.question.previewDefaultYes')}
            noPhrases={config.noText ? [config.noText, ...t('questionScreen.noPhrases', { returnObjects: true }).slice(1)] : undefined}
            tokens={tokens}
            cardShape={state.cardShape}
            onYes={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
