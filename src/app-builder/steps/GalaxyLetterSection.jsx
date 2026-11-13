/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Настройка космического письма — необязательного продолжения финального
 * экрана: конверт, письмо от руки, галактика из слов «люблю» и портрет
 * получателя, собранный из этих же слов.
 *
 * Живёт внутри configuration_json финального шага, поэтому отдельная
 * таблица и миграция не нужны. Показывается только при включённом флаге
 * (см. src/lib/featureFlags.js).
 *
 * Фото здесь — чужое лицо. Поэтому в конструкторе прямо написано, что
 * загружается и когда удаляется: человек должен это понимать до отправки,
 * а не узнавать потом.
 */
import { useRef, useState } from 'react';
import { validateMediaFile } from '../../lib/uploadMedia.js';
import { setPendingMedia, clearPendingMedia } from '../pendingMedia.js';
import {
  T, SectionCard, FieldLabel, TxtArea, CharCount,
} from '../BuilderUI.jsx';
import { SKY_CITIES } from '../../features/galaxy-letter/skyCities.js';

const DEFAULTS = {
  enabled: false,
  heading: '',
  paragraphs: '',
  signature: '',
  caption: '',
  subcaption: '',
  photoUrl: null,
  cropZoom: 1,
  cropX: 0.5,
  cropY: 0.42,
};



export default function GalaxyLetterSection({ number, value, onChange }) {
  const cfg = { ...DEFAULTS, ...(value || {}) };
  const fileRef = useRef(null);
  const [fileError, setFileError] = useState(null);

  const set = (patch) => onChange({ ...cfg, ...patch });

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateMediaFile(file);
    if (error) {
      setFileError(error);
      set({ photoUrl: null });
      return;
    }
    setFileError(null);
    setPendingMedia('galaxy', file);
    set({ photoUrl: URL.createObjectURL(file) });
  }

  function removePhoto() {
    clearPendingMedia('galaxy');
    set({ photoUrl: null });
    setFileError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <SectionCard number={number} title="Космическое письмо (необязательно)">
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: cfg.enabled ? 16 : 0 }}>
        <input
          type="checkbox"
          checked={!!cfg.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: '#F85589' }}
        />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: T.font }}>
          Показать после ответа «да»
        </span>
      </label>

      {!cfg.enabled && (
        <p style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.5, fontFamily: T.font }}>
          Конверт с печатью, письмо от руки, галактика из слова «люблю» на языках мира
          и портрет, собранный из этих же слов.
        </p>
      )}

      {cfg.enabled && (
        <>
          <FieldLabel>Заголовок письма</FieldLabel>
          <TxtArea
            value={cfg.heading}
            onChange={(e) => set({ heading: e.target.value })}
            placeholder="Амира, это тебе"
            rows={1}
            maxLength={80}
          />

          <FieldLabel style={{ marginTop: 14 }}>Текст письма (каждая строка — абзац)</FieldLabel>
          <TxtArea
            value={cfg.paragraphs}
            onChange={(e) => set({ paragraphs: e.target.value })}
            placeholder={'Я много раз пытался сказать тебе это красиво.\nПоэтому я собрал это на всех языках мира.'}
            rows={5}
            maxLength={700}
          />
          <CharCount value={cfg.paragraphs} max={700} />

          <FieldLabel style={{ marginTop: 14 }}>Подпись отправителя</FieldLabel>
          <TxtArea
            value={cfg.signature}
            onChange={(e) => set({ signature: e.target.value })}
            placeholder="Данияр"
            rows={1}
            maxLength={40}
          />

          <FieldLabel style={{ marginTop: 18 }}>Фото для портрета из слов</FieldLabel>
          {cfg.photoUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <img
                src={cfg.photoUrl}
                alt=""
                style={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 8 }}
              />
              <button
                type="button"
                onClick={removePhoto}
                style={{
                  border: '1px solid rgba(42,31,43,0.18)', borderRadius: 999,
                  padding: '7px 14px', background: '#fff', color: T.ink,
                  fontSize: 13, fontFamily: T.font, cursor: 'pointer',
                }}
              >
                Убрать фото
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                marginTop: 6, border: '1px dashed rgba(42,31,43,0.28)', borderRadius: 12,
                padding: '14px 18px', background: '#fff', color: T.ink,
                fontSize: 13, fontFamily: T.font, cursor: 'pointer', width: '100%',
              }}
            >
              Выбрать фото
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          {fileError && (
            <p style={{ color: '#C0392B', fontSize: 12, marginTop: 4, fontFamily: T.font }}>{fileError}</p>
          )}

          {cfg.photoUrl && (
            <>
              <FieldLabel style={{ marginTop: 16 }}>
                {`Кадр: приближение ${Number(cfg.cropZoom).toFixed(2)}×`}
              </FieldLabel>
              <input
                type="range" min="1" max="3" step="0.05" value={cfg.cropZoom}
                onChange={(e) => set({ cropZoom: +e.target.value })}
                style={{ width: '100%', accentColor: '#F85589' }}
              />
              <FieldLabel style={{ marginTop: 10 }}>По горизонтали</FieldLabel>
              <input
                type="range" min="0" max="1" step="0.01" value={cfg.cropX}
                onChange={(e) => set({ cropX: +e.target.value })}
                style={{ width: '100%', accentColor: '#F85589' }}
              />
              <FieldLabel style={{ marginTop: 10 }}>По вертикали</FieldLabel>
              <input
                type="range" min="0" max="1" step="0.01" value={cfg.cropY}
                onChange={(e) => set({ cropY: +e.target.value })}
                style={{ width: '100%', accentColor: '#F85589' }}
              />
              <p style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.5, fontFamily: T.font }}>
                Наведите кадр на лицо — чем крупнее лицо, тем лучше оно читается в портрете.
              </p>
            </>
          )}

          <FieldLabel style={{ marginTop: 18 }}>Подпись на портрете</FieldLabel>
          <TxtArea
            value={cfg.caption}
            onChange={(e) => set({ caption: e.target.value })}
            placeholder="Амира"
            rows={1}
            maxLength={40}
          />
          <FieldLabel style={{ marginTop: 10 }}>Подпись мельче</FieldLabel>
          <TxtArea
            value={cfg.subcaption}
            onChange={(e) => set({ subcaption: e.target.value })}
            placeholder="я люблю тебя очень очень сильно"
            rows={1}
            maxLength={80}
          />


          <FieldLabel style={{ marginTop: 18 }}>Звёздная карта для сторис (по желанию)</FieldLabel>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 0, marginBottom: 8, lineHeight: 1.5, fontFamily: T.font }}>
            Небо, каким оно было в вашу ночь — например, в день знакомства. Получатель сможет выложить его
            в сторис вместо портрета.
          </p>
          <input
            type="datetime-local"
            value={cfg.skyDate || ''}
            onChange={(e) => set({ skyDate: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(42,31,43,0.14)', fontFamily: T.font, fontSize: 14, boxSizing: 'border-box' }}
          />
          <select
            value={cfg.skyCity || ''}
            onChange={(e) => set({ skyCity: e.target.value })}
            style={{ width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(42,31,43,0.14)', fontFamily: T.font, fontSize: 14, background: '#fff', boxSizing: 'border-box' }}
          >
            <option value="">Город</option>
            {SKY_CITIES.map(([name]) => <option key={name} value={name}>{name}</option>)}
          </select>

          <p style={{
            fontSize: 12, color: T.muted, marginTop: 16, lineHeight: 1.6,
            fontFamily: T.font, borderTop: '1px solid rgba(42,31,43,0.08)', paddingTop: 12,
          }}>
            Фото загрузится на наш сервер и будет храниться вместе с приглашением.
            Когда приглашение удалят, удалится и фото. Это лицо другого человека —
            стоит спросить, не против ли он.
          </p>
        </>
      )}
    </SectionCard>
  );
}
