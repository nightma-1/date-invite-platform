/**
 * © 2026 Senti. Все права защищены.
 *
 * Конструктор музея: новый музей (/lab/museum) и правка оплаченного
 * (/lab/museum/edit/:id). Пока скрыт: на сайте нет ссылок сюда.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './museumI18n.js';
import { supabase } from '../lib/supabaseClient.js';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';
import AuthGate from '../app-builder/AuthGate.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { MUSEUM_BASE_PRICE, MUSEUM_LIMITS as L, MUSEUM_TERMS, museumPublishPrice } from '../lib/museumPlans.js';
import { checkVideo, clearDraft, loadDraft, preparePhoto, removeFiles, saveDraft, uploadMedia } from './museumMedia.js';

const MuseumExperience = lazy(() => import('./MuseumExperience.jsx'));
const TONES = ['fit', 'romantic', 'sweet', 'funny', 'poetic'];
const EMPTY = { recipient: '', author: '', dedication: '', signature: '', termDays: 30 };

const ui = {
  section: { background: '#fff', border: `1px solid ${T.pinkBorder}`, borderRadius: 20, padding: 20, marginBottom: 14 },
  h2: { margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: T.darkPurple },
  label: { display: 'block', marginBottom: 14, fontSize: 13, fontWeight: 600, color: T.darkPurple },
  input: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${T.pinkBorder}`, fontFamily: T.font, fontSize: 16, color: T.dark, background: '#fff', outline: 'none' },
  hint: { margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: T.muted },
  ghost: { minHeight: 40, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${T.pink}`, background: '#fff', color: T.pink, fontFamily: T.font, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  primary: { width: '100%', minHeight: 52, padding: '12px 18px', borderRadius: 999, border: 'none', background: T.pink, color: '#fff', fontFamily: T.font, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  tiny: { minHeight: 32, padding: '4px 8px', borderRadius: 8, border: `1px solid ${T.pinkBorder}`, background: '#fff', color: T.darkPurple, fontFamily: T.font, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
};

function money(n, lng) {
  return n.toLocaleString(lng === 'en' ? 'en-US' : 'ru-RU');
}

function PhotoCard({ photo, index, count, onMove, onMain, onRemove, t }) {
  const url = useMemo(() => photo.thumb || URL.createObjectURL(photo.thumbBlob), [photo]);
  return (
    <div data-testid="photo-card" style={{ border: `1.5px solid ${index === 0 ? T.pink : T.pinkBorder}`, borderRadius: 12, overflow: 'hidden', background: T.pinkLight }}>
      <div style={{ position: 'relative', aspectRatio: '1' }}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {index === 0 && <span style={{ position: 'absolute', left: 6, top: 6, padding: '3px 8px', borderRadius: 999, background: T.pink, color: '#fff', fontSize: 10, fontWeight: 700 }}>{t('museum.builder.main')}</span>}
        <button type="button" aria-label={t('museum.builder.remove')} onClick={onRemove} style={{ position: 'absolute', right: 4, top: 4, width: 32, height: 32, border: 'none', borderRadius: '50%', background: 'rgba(32,12,22,.72)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: 4 }}>
        <button type="button" aria-label={t('museum.builder.moveEarlier')} disabled={index === 0} onClick={() => onMove(-1)} style={{ ...ui.tiny, flex: 1, opacity: index === 0 ? 0.35 : 1 }}>←</button>
        {index > 0 && <button type="button" aria-label={t('museum.builder.makeMain')} title={t('museum.builder.makeMain')} onClick={onMain} style={{ ...ui.tiny, flex: 1 }}>★</button>}
        <button type="button" aria-label={t('museum.builder.moveLater')} disabled={index === count - 1} onClick={() => onMove(1)} style={{ ...ui.tiny, flex: 1, opacity: index === count - 1 ? 0.35 : 1 }}>→</button>
      </div>
    </div>
  );
}

export default function MuseumBuilder() {
  const { t, i18n } = useTranslation();
  const { invitationId: editId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null); // { url } с сервера или { blob } с устройства
  const [savedId, setSavedId] = useState(null);
  const [folder] = useState(() => crypto.randomUUID());
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [session, setSession] = useState(undefined);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [askLogin, setAskLogin] = useState(false);
  const [ai, setAi] = useState(null); // null или { about, tone, busy }
  const originalMedia = useRef([]);
  const fileInput = useRef(null);
  const videoInput = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isEdit) {
        const { data } = await supabase
          .from('invitations')
          .select('id, recipient_name, status, expires_at, museum_content(*)')
          .eq('id', editId)
          .maybeSingle();
        if (cancelled) return;
        const c = data?.museum_content;
        if (!c || data.status === 'expired' || c.purged_at) {
          setLocked(true);
        } else {
          setForm({ recipient: data.recipient_name, author: c.author_name, dedication: c.dedication, signature: c.signature, termDays: c.term_days });
          setPhotos(c.photos.map((p) => ({ ...p, id: p.full })));
          setVideo(c.video_url ? { url: c.video_url } : null);
          setSavedId(data.id);
          originalMedia.current = [...c.photos.flatMap((p) => [p.full, p.thumb]), c.video_url].filter(Boolean);
        }
      } else {
        const draft = await loadDraft();
        if (cancelled) return;
        if (draft) {
          setForm(draft.form);
          setPhotos(draft.photos || []);
          setVideo(draft.video || null);
          setSavedId(draft.savedId || null);
        }
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [editId, isEdit]);

  useEffect(() => {
    if (!loaded || isEdit) return undefined;
    const id = setTimeout(() => saveDraft({ form, photos, video, savedId }), 500);
    return () => clearTimeout(id);
  }, [form, photos, video, savedId, loaded, isEdit]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const photosShort = Math.max(0, L.minPhotos - photos.length);
  const textReady = form.recipient.trim() && form.author.trim() && form.dedication.trim();
  const ready = textReady && photosShort === 0;
  const price = museumPublishPrice(form.termDays);

  async function addPhotos(files) {
    setError('');
    setBusy({ kind: 'prepare' });
    const room = L.maxPhotos - photos.length;
    const added = [];
    for (const file of [...files].slice(0, room)) {
      try {
        added.push(await preparePhoto(file));
      } catch {
        setError(t('museum.builder.badPhoto', { name: file.name }));
      }
    }
    setPhotos((p) => [...p, ...added]);
    setBusy(null);
  }

  function movePhoto(i, dir) {
    setPhotos((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + dir, 0, item);
      return next;
    });
  }

  function makeMain(i) {
    setPhotos((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      return [item, ...next];
    });
  }

  async function pickVideo(file) {
    if (!file) return;
    setError('');
    const code = await checkVideo(file);
    if (code) {
      setError(t(`museum.builder.${code}`, { seconds: L.maxVideoSeconds, mb: L.maxVideoBytes / 1048576 }));
      return;
    }
    setVideo({ blob: file });
  }

  function openPreview() {
    const blobs = [];
    const url = (blob) => {
      const u = URL.createObjectURL(blob);
      blobs.push(u);
      return u;
    };
    const videoUrl = video?.url || (video?.blob ? url(video.blob) : null);
    setPreview({
      blobs,
      data: {
        recipientName: form.recipient.trim() || '…',
        authorName: form.author.trim(),
        dedication: form.dedication.trim() || '…',
        signature: form.signature.trim() || form.author.trim(),
        videoUrl,
        photos: photos.map((p) => ({ full: p.full || url(p.fullBlob), thumb: p.thumb || url(p.thumbBlob), w: p.w, h: p.h })),
      },
    });
  }

  function closePreview() {
    preview?.blobs.forEach((u) => URL.revokeObjectURL(u));
    setPreview(null);
  }

  async function persist() {
    const userId = session.user.id;
    const items = photos.map((p) => ({ ...p }));
    const film = video ? { ...video } : null;
    await uploadMedia({ userId, folder, photos: items, video: film, onProgress: (done, total) => setBusy({ kind: 'upload', done, total }) });
    setPhotos(items.map(({ fullBlob, thumbBlob, ...rest }) => rest));
    setVideo(film?.url ? { url: film.url } : null);

    const content = {
      author_name: form.author.trim(),
      dedication: form.dedication.trim(),
      signature: form.signature.trim() || form.author.trim(),
      photos: items.map((p) => ({ full: p.full, thumb: p.thumb, w: p.w, h: p.h })),
      video_url: film?.url || null,
      term_days: Number(form.termDays),
      updated_at: new Date().toISOString(),
    };

    let id = savedId;
    if (id) {
      const { error: invErr } = await supabase.from('invitations').update({ recipient_name: form.recipient.trim() }).eq('id', id);
      if (invErr) throw invErr;
      const { error: cErr } = await supabase.from('museum_content').update(content).eq('invitation_id', id);
      if (cErr) throw cErr;
    } else {
      const slug = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');
      const { data, error: invErr } = await supabase
        .from('invitations')
        .insert({ user_id: userId, slug, kind: 'museum', recipient_name: form.recipient.trim(), status: 'draft' })
        .select('id')
        .single();
      if (invErr) throw invErr;
      id = data.id;
      const { error: cErr } = await supabase.from('museum_content').insert({ invitation_id: id, ...content });
      if (cErr) throw cErr;
      setSavedId(id);
    }

    if (originalMedia.current.length) {
      const keep = new Set([...content.photos.flatMap((p) => [p.full, p.thumb]), content.video_url]);
      await removeFiles(originalMedia.current.filter((u) => !keep.has(u))).catch(() => {});
      originalMedia.current = [...keep].filter(Boolean);
    }
    return id;
  }

  async function saveChanges() {
    setError('');
    setNotice('');
    try {
      await persist();
      setNotice(t('museum.builder.saved'));
    } catch (e) {
      console.error('museum save failed', e);
      setError(t('museum.builder.saveFailed'));
    }
    setBusy(null);
  }

  async function pay(method) {
    setError('');
    if (!session) {
      setAskLogin(true);
      return;
    }
    let id;
    try {
      id = await persist();
    } catch (e) {
      console.error('museum save failed', e);
      setError(t('museum.builder.saveFailed'));
      setBusy(null);
      return;
    }
    try {
      setBusy({ kind: 'pay' });
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ invitationId: id, method }),
      });
      const body = await res.json();
      if (!res.ok || !body.paymentUrl) throw new Error(body.error || 'payment failed');
      await clearDraft();
      window.location.href = body.paymentUrl;
    } catch (e) {
      console.error('museum pay failed', e);
      setError(t('museum.builder.payFailed'));
      setBusy(null);
    }
  }

  async function writeWithAi() {
    if (!session) {
      setAskLogin(true);
      return;
    }
    setAi((a) => ({ ...a, busy: true }));
    setError('');
    try {
      const res = await fetch('/api/museum?action=write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ recipient: form.recipient, author: form.author, about: ai.about, tone: ai.tone, current: form.dedication, lang: i18n.language }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setForm((f) => ({ ...f, dedication: body.dedication, signature: body.signature || f.signature }));
      setAi(null);
    } catch {
      setError(t('museum.builder.aiFailed'));
      setAi((a) => a && { ...a, busy: false });
    }
  }

  async function startOver() {
    if (!window.confirm(t('museum.builder.startOverConfirm'))) return;
    await clearDraft();
    setForm(EMPTY);
    setPhotos([]);
    setVideo(null);
    setSavedId(null);
  }

  if (preview) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#2b1320' }} />}>
        <MuseumExperience data={preview.data} mode="preview" onExit={closePreview} />
      </Suspense>
    );
  }

  const busyText = busy?.kind === 'upload' ? t('museum.builder.saving', { done: busy.done, total: busy.total }) : busy ? '…' : '';

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', fontFamily: T.font, background: `linear-gradient(180deg, #fff 0%, ${T.pinkLight} 60%, #ffeef5 100%)` }}>
      <DecorativeBlobs />
      <main style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <Link to={isEdit ? '/dashboard' : '/'} style={{ fontSize: 13, color: T.muted }}>{t('museum.common.back')}</Link>
          <LanguageSwitcher />
        </div>

        <header style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: T.pink }}>{t('museum.builder.kicker')}</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 30, lineHeight: 1.15, color: T.darkPurple }}>{t(isEdit ? 'museum.builder.editTitle' : 'museum.builder.title')}</h1>
          <p style={{ ...ui.hint, fontSize: 15, marginBottom: 12 }}>{t(isEdit ? 'museum.builder.editLead' : 'museum.builder.lead')}</p>
          {!isEdit && <Link to="/lab/museum/demo" style={{ ...ui.ghost, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{t('museum.builder.demo')}</Link>}
        </header>

        {locked ? <p style={ui.section}>{t('museum.builder.locked')}</p> : (
          <>
            <section style={ui.section}>
              <h2 style={ui.h2}>{t('museum.builder.names')}</h2>
              <label style={ui.label}>{t('museum.builder.recipient')}<input data-testid="recipient" style={ui.input} maxLength={L.name} value={form.recipient} onChange={set('recipient')} /></label>
              <label style={{ ...ui.label, marginBottom: 0 }}>{t('museum.builder.author')}<input data-testid="author" style={ui.input} maxLength={L.name} value={form.author} onChange={set('author')} /></label>
            </section>

            <section style={ui.section}>
              <h2 style={ui.h2}>{t('museum.builder.words')}</h2>
              <label style={ui.label}>
                {t('museum.builder.dedication')}
                <textarea data-testid="dedication" rows={5} style={{ ...ui.input, resize: 'vertical' }} maxLength={L.dedication} value={form.dedication} onChange={set('dedication')} />
              </label>
              <label style={ui.label}>{t('museum.builder.signature')}<input data-testid="signature" style={ui.input} maxLength={L.signature} value={form.signature} onChange={set('signature')} /></label>
              {ai ? (
                <div style={{ padding: 14, borderRadius: 14, background: T.pinkLight }}>
                  <label style={ui.label}>{t('museum.builder.aiAbout')}<textarea rows={3} maxLength={600} style={{ ...ui.input, resize: 'vertical' }} value={ai.about} onChange={(e) => setAi({ ...ai, about: e.target.value })} /></label>
                  <p style={{ ...ui.label, marginBottom: 6 }}>{t('museum.builder.aiTone')}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {TONES.map((tone) => (
                      <button key={tone} type="button" onClick={() => setAi({ ...ai, tone })} style={{ ...ui.ghost, background: ai.tone === tone ? T.pink : '#fff', color: ai.tone === tone ? '#fff' : T.pink }}>{t(`museum.builder.aiTones.${tone}`)}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={ai.busy} onClick={writeWithAi} style={{ ...ui.primary, minHeight: 44, flex: 1 }}>{ai.busy ? t('museum.builder.aiBusy') : t('museum.builder.aiGo')}</button>
                    <button type="button" onClick={() => setAi(null)} style={ui.ghost}>{t('museum.common.close')}</button>
                  </div>
                  <p style={{ ...ui.hint, margin: '10px 0 0' }}>{t('museum.builder.aiNote')}</p>
                </div>
              ) : (
                <button type="button" onClick={() => setAi({ about: '', tone: 'fit', busy: false })} style={ui.ghost}>
                  {form.dedication.trim() ? t('museum.builder.aiImprove') : t('museum.builder.aiWrite')}
                </button>
              )}
            </section>

            <section style={ui.section}>
              <h2 style={ui.h2}>{t('museum.builder.collection')}</h2>
              <p style={ui.hint}>{t('museum.builder.photosHint', { min: L.minPhotos, max: L.maxPhotos })}</p>
              {photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, marginBottom: 12 }}>
                  {photos.map((p, i) => (
                    <PhotoCard
                      key={p.id} photo={p} index={i} count={photos.length} t={t}
                      onMove={(dir) => movePhoto(i, dir)}
                      onMain={() => makeMain(i)}
                      onRemove={() => setPhotos((list) => list.filter((x) => x !== p))}
                    />
                  ))}
                </div>
              )}
              <input ref={fileInput} data-testid="photo-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" disabled={photos.length >= L.maxPhotos || Boolean(busy)} onClick={() => fileInput.current.click()} style={ui.ghost}>{t('museum.builder.addPhotos')}</button>
                <span style={{ fontSize: 13, color: T.muted }}>
                  {t('museum.builder.photosCount', { count: photos.length, max: L.maxPhotos })}
                  {photosShort > 0 && ` · ${t('museum.builder.needMore', { count: photosShort })}`}
                </span>
              </div>

              <h2 style={{ ...ui.h2, marginTop: 24, marginBottom: 6 }}>{t('museum.builder.film')}</h2>
              <p style={ui.hint}>{t('museum.builder.filmHint', { seconds: L.maxVideoSeconds, mb: L.maxVideoBytes / 1048576 })}</p>
              <input ref={videoInput} data-testid="video-input" type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pickVideo(e.target.files[0]); e.target.value = ''; }} />
              {video
                ? <button type="button" onClick={() => setVideo(null)} style={ui.ghost}>{t('museum.builder.removeFilm')}</button>
                : <button type="button" onClick={() => videoInput.current.click()} style={ui.ghost}>{t('museum.builder.chooseFilm')}</button>}
            </section>

            {!isEdit && (
              <section style={ui.section}>
                <h2 style={ui.h2}>{t('museum.builder.term')}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {MUSEUM_TERMS.map((term) => {
                    const on = Number(form.termDays) === term.days;
                    return (
                      <button key={term.days} type="button" aria-pressed={on} onClick={() => setForm((f) => ({ ...f, termDays: term.days }))} style={{ padding: '12px 6px', borderRadius: 14, border: `2px solid ${on ? T.pink : T.pinkBorder}`, background: on ? T.pinkLight : '#fff', fontFamily: T.font, color: T.darkPurple, cursor: 'pointer' }}>
                        <b style={{ display: 'block', fontSize: 14 }}>{t(`museum.builder.terms.${term.key}`)}</b>
                        <span style={{ fontSize: 12, color: T.muted }}>{term.addon ? `+${money(term.addon, i18n.language)}` : t('museum.builder.included')}</span>
                      </button>
                    );
                  })}
                </div>
                <p style={{ ...ui.hint, margin: '12px 0 0' }}>{t('museum.builder.delivery')}</p>
              </section>
            )}

            {error && <p role="alert" style={{ margin: '0 0 12px', padding: 12, borderRadius: 12, background: '#fdecea', color: '#a12a22', fontSize: 14 }}>{error}</p>}
            {notice && <p role="status" style={{ margin: '0 0 12px', padding: 12, borderRadius: 12, background: '#e9f7ee', color: '#1f6b3a', fontSize: 14 }}>{notice}</p>}
            {busy && <p role="status" style={{ margin: '0 0 12px', fontSize: 14, color: T.muted, textAlign: 'center' }}>{busyText}</p>}
            {!ready && photos.length + form.recipient.length > 0 && !textReady && <p style={{ ...ui.hint, textAlign: 'center' }}>{t('museum.builder.required')}</p>}

            <div style={{ display: 'grid', gap: 8 }}>
              <button type="button" data-testid="preview" disabled={photosShort > 0} onClick={openPreview} style={{ ...ui.ghost, minHeight: 48, opacity: photosShort > 0 ? 0.45 : 1 }}>{t('museum.builder.preview')}</button>
              {isEdit ? (
                <button type="button" disabled={!ready || Boolean(busy)} onClick={saveChanges} style={{ ...ui.primary, opacity: ready ? 1 : 0.45 }}>{t('museum.builder.save')}</button>
              ) : (
                <>
                  <p style={{ margin: '8px 0 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: T.darkPurple }}>
                    <span>{t('museum.builder.total')}</span>
                    <span data-testid="total">{money(price, i18n.language)} сум</span>
                  </p>
                  <button type="button" data-testid="pay" disabled={!ready || Boolean(busy)} onClick={() => pay('invoice')} style={{ ...ui.primary, opacity: ready ? 1 : 0.45 }}>{t('museum.builder.payClick')}</button>
                  <button type="button" disabled={!ready || Boolean(busy)} onClick={() => pay('card')} style={{ ...ui.primary, background: '#fff', color: T.pink, border: `1.5px solid ${T.pink}`, opacity: ready ? 1 : 0.45 }}>{t('museum.builder.payCard')}</button>
                  <p style={{ ...ui.hint, textAlign: 'center', margin: '6px 0 0' }}>
                    {t('museum.builder.draftNote')}{' '}
                    <button type="button" onClick={startOver} style={{ border: 'none', background: 'none', padding: 0, color: T.pink, fontFamily: T.font, fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>{t('museum.builder.startOver')}</button>
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>

      {askLogin && !session && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20, overflowY: 'auto', padding: 16, background: 'rgba(32,12,22,.6)' }}>
          <div style={{ maxWidth: 440, margin: '40px auto', padding: 16, borderRadius: 20, background: '#fff' }}>
            <h2 style={{ ...ui.h2, marginBottom: 4 }}>{t('museum.builder.login')}</h2>
            <p style={ui.hint}>{t('museum.builder.loginLead')}</p>
            <AuthGate onAuthenticated={() => setAskLogin(false)} />
            <button type="button" onClick={() => setAskLogin(false)} style={{ ...ui.ghost, marginTop: 10, width: '100%' }}>{t('museum.common.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
