/**
 * © 2026 Senti. Все права защищены.
 *
 * Всё вокруг 3D-сцены: обложка, вход, управление, чат, скамейки и фильм.
 * Один компонент на три режима: настоящий музей, предпросмотр автора и демо.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './museumI18n.js';
import { MuseumWorld } from './engine/MuseumWorld.js';
import { buildLayout } from './engine/layout.js';
import { createRoom } from './engine/room.js';
import { createAmbient } from './engine/ambient.js';
import { makeStoryCard, shareBlob } from './storyCard.js';
import { supabase } from '../lib/supabaseClient.js';
import RunawayButton from '../components/ui/RunawayButton.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { track } from '../lib/analytics.js';
import { preparePhoto } from './museumMedia.js';

const MAKE_YOURS_URL = '/museum?utm_source=museum&utm_medium=recipient';
const NO_LIMIT = 6;

const C = {
  night: '#2b1320', ink: '#2b1320', cream: '#fff8f0', rose: '#f85589', berry: '#b23a62', gold: '#d9b26f',
  glass: 'rgba(32,12,22,.72)',
  display: '"Cormorant Garamond", "PT Serif", serif',
  ui: 'Manrope, sans-serif',
};

const pill = {
  border: 'none', borderRadius: 999, padding: '11px 16px', minHeight: 44, cursor: 'pointer',
  background: C.glass, color: '#fff', fontFamily: C.ui, fontSize: 14, fontWeight: 600,
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
};

function hasWebGL() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function Joystick({ onMove }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const base = useRef(null);
  const active = useRef(null);
  const R = 46;
  const update = (e) => {
    const r = base.current.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy });
    onMove(dx / R, -dy / R);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      data-testid="joystick"
      onPointerDown={(e) => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (active.current === e.pointerId) update(e); }}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: 'absolute', left: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))', width: 124, height: 124,
        borderRadius: '50%', background: 'rgba(255,255,255,.14)', border: '1.5px solid rgba(255,255,255,.35)', touchAction: 'none',
      }}
    >
      <div style={{
        position: 'absolute', left: 37, top: 37, width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,.82)',
        transform: `translate(${knob.x}px, ${knob.y}px)`, pointerEvents: 'none',
      }} />
    </div>
  );
}

function Finale({ question, author, live, slug, onClose, onAnswered, t }) {
  const box = useRef(null);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);
  const yes = async () => {
    setDone(true);
    onAnswered();
    track('museum_finale_yes', { tries });
    if (live) await supabase.rpc('submit_response', { p_slug: slug, p_no_attempts: tries });
  };
  const btn = { ...pill, minWidth: 96, background: '#fff', color: C.ink };
  return (
    <div ref={box} data-testid="finale" style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(166px + env(safe-area-inset-bottom))', maxWidth: 420, height: 230, margin: '0 auto', boxSizing: 'border-box', padding: 20, borderRadius: 20, background: 'rgba(32,12,22,.9)', color: '#fff', textAlign: 'center' }}>
      {done ? (
        <>
          <p style={{ margin: '4px 0 6px', fontSize: 34 }}>🤍</p>
          <p style={{ margin: 0, fontFamily: C.display, fontSize: 28 }}>{t('museum.world.finaleYes', { name: author || '' })}</p>
          <button type="button" onClick={onClose} style={{ ...pill, background: C.berry, marginTop: 20 }}>{t('museum.common.close')}</button>
        </>
      ) : (
        <>
          <p style={{ margin: '8px 0 22px', fontFamily: C.display, fontSize: 28, lineHeight: 1.15 }}>{question}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button type="button" data-testid="finale-yes" onClick={yes} style={{ ...pill, minWidth: 96, background: C.rose }}>{t('museum.world.yes')}</button>
            {tries >= NO_LIMIT
              ? <button type="button" data-testid="finale-later" onClick={onClose} style={btn}>{t('museum.world.later')}</button>
              : <RunawayButton containerRef={box} phrases={t('museum.world.noPhrases', { returnObjects: true })} onDodge={() => setTries((n) => n + 1)} style={btn} />}
          </div>
        </>
      )}
    </div>
  );
}

function FallbackGallery({ data, text }) {
  return (
    <div style={{ minHeight: '100dvh', background: C.night, color: C.cream, padding: 20, fontFamily: C.ui }}>
      <p style={{ maxWidth: 560, margin: '12px auto 20px', lineHeight: 1.5 }}>{text}</p>
      <div style={{ display: 'grid', gap: 12, maxWidth: 560, margin: '0 auto' }}>
        {data.photos.map((p, i) => <img key={p.full} src={p.full} alt={`${i + 1}`} loading="lazy" style={{ width: '100%', borderRadius: 8 }} />)}
      </div>
    </div>
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function MuseumExperience({ data, mode = 'live', slug, onExit, localRoom = false, isOwner = false }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const roomRef = useRef(null);
  const [name, setName] = useState('');
  const [entered, setEntered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState({});
  const [lost, setLost] = useState(false);
  const [hint, setHint] = useState(true);
  const [viewer, setViewer] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [room, setRoom] = useState({ players: [], admitted: true, queue: 0, status: 'idle' });
  const [about, setAbout] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [hearts, setHearts] = useState(data.hearts || {});
  const [ended, setEnded] = useState(false);
  const [finale, setFinale] = useState('waiting'); // waiting | open | closed | answered
  const [book, setBook] = useState(data.guestbook || []);
  const [bookText, setBookText] = useState('');
  const [bookSent, setBookSent] = useState(false);
  const [guestView, setGuestView] = useState(null);
  const [guestState, setGuestState] = useState('idle'); // idle | sending | done | failed
  const [liked, setLiked] = useState(() => new Set());
  const seenHalls = useRef(new Set());
  const guestInput = useRef(null);
  const musicRef = useRef(null);
  const answeredRef = useRef(false);
  const voiceRef = useRef(null);
  const webgl = useMemo(hasWebGL, []);
  const touch = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches, []);
  const isLive = mode === 'live';
  const namesRef = useRef(new Map());

  useEffect(() => {
    if (!entered || !webgl) return undefined;
    let cancelled = false;
    const photos = data.photos.map((p) => ({ aspect: p.w && p.h ? p.w / p.h : 4 / 3 }));
    const layout = buildLayout(photos, Boolean(data.videoUrl));

    (async () => {
      await Promise.all([
        document.fonts?.load('700 80px "Cormorant Garamond"', 'Яя'),
        document.fonts?.load('italic 600 50px "Cormorant Garamond"', 'Яя'),
        document.fonts?.load('600 40px Manrope', 'Яя'),
      ]).catch(() => {});
      if (cancelled) return;

      const world = new MuseumWorld(canvasRef.current, {
        data,
        layout,
        labels: {
          filmPoster: t('museum.world.filmPoster'),
          dedicationArt: {
            recipientName: data.recipientName,
            dedication: data.dedication,
            signature: data.signature,
            labelFor: t('museum.world.dedicationFor'),
          },
        },
        onPhotoTap: (i) => setViewer(i),
        onGuestTap: (i) => setGuestView(i),
        onHud: setHud,
        onProgress: setProgress,
        onContextLost: () => setLost(true),
        onFilmChange: (playing, time) => roomRef.current?.sendFilm(playing, time),
      });
      worldRef.current = world;
      if (import.meta.env.DEV) window.__museum = world;
      world.start();
      await world.loadThumbnails();
      if (cancelled) return;
      Object.entries(data.hearts || {}).forEach(([i, n]) => world.setHeartCount(Number(i), n));
      setReady(true);

      if (!isLive) return;
      const r = createRoom({
        slug,
        name: name.trim() || '🙂',
        local: localRoom,
        handlers: {
          onStatus: (status) => setRoom((s) => ({ ...s, status })),
          onPlayers: ({ players, admitted, me, queue }) => {
            setRoom((s) => ({ ...s, players, admitted, queue, me }));
            const ids = new Set(players.map((p) => p.id));
            namesRef.current = new Map(players.map((p) => [p.id, p]));
            for (const p of players) if (p.id !== me) world.addPeer(p.id, p.name, p.color);
            for (const id of [...world.peers.keys()]) if (!ids.has(id)) world.removePeer(id);
            // Новичок сразу видит остальных и то, идёт ли фильм
            world.lastSent.t = 0;
            world.lastSent.x = Infinity;
            if (world.video && !world.video.paused) r.sendFilm(true, world.video.currentTime);
          },
          onPos: (id, s) => world.updatePeer(id, s),
          onChat: (id, text) => {
            world.peerSay(id, text);
            setMessages((m) => [...m.slice(-60), { id: crypto.randomUUID(), who: namesRef.current.get(id)?.name || '…', color: namesRef.current.get(id)?.color, text }]);
            setUnread((n) => n + 1);
          },
          onFilm: ({ playing, t: time }) => world.setFilmPlaying(playing, false, time),
          onHeart: (photo, count) => {
            world.heartBurst(photo);
            world.setHeartCount(photo, count);
            setHearts((h) => ({ ...h, [photo]: count }));
          },
        },
      });
      roomRef.current = r;
      world.onMotion = (x, z, yaw, sit) => r.sendPos(x, z, yaw, sit);
    })();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
      roomRef.current = null;
      worldRef.current?.dispose();
      worldRef.current = null;
      musicRef.current?.stop();
      musicRef.current = null;
      voiceRef.current?.pause();
    };
    // Сцена создаётся один раз, при входе
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  // Музыка становится тише, когда звучат голос или фильм
  useEffect(() => {
    const music = musicRef.current;
    if (music) music.setLevel(muted ? 0 : voiceOn || hud.filmPlaying ? 0.03 : 0.16);
    if (voiceRef.current) voiceRef.current.muted = muted;
    if (worldRef.current) worldRef.current.filmDuck = muted ? 0 : voiceOn ? 0.25 : 1;
  }, [muted, voiceOn, hud.filmPlaying]);

  useEffect(() => {
    if (hud.nearHero && data.finaleQuestion && finale === 'waiting') {
      setFinale('open');
      track('museum_finale_seen');
    }
  }, [hud.nearHero, data.finaleQuestion, finale]);

  useEffect(() => {
    if (!hud.hall || seenHalls.current.has(hud.hall)) return;
    seenHalls.current.add(hud.hall);
    track('museum_hall', { hall: hud.hall });
  }, [hud.hall]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        worldRef.current?.stop();
        musicRef.current?.pause();
      } else {
        worldRef.current?.start();
        musicRef.current?.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Браузер разрешает звук только после нажатия, поэтому запускаем его на входе
  function enter(e) {
    e.preventDefault();
    if (data.songUrl) {
      const song = new Audio(data.songUrl);
      song.loop = true;
      song.volume = 0.45;
      song.play().catch(() => {});
      musicRef.current = {
        setLevel: (v) => { song.volume = Math.min(1, v * 2.8); },
        pause: () => song.pause(),
        resume: () => song.play().catch(() => {}),
        stop: () => song.pause(),
      };
    } else if (data.ambient && data.ambient !== 'off') {
      musicRef.current = createAmbient(data.ambient);
      musicRef.current?.start();
    }
    if (data.voiceUrl) {
      const voice = new Audio(data.voiceUrl);
      voice.onended = () => setVoiceOn(false);
      voiceRef.current = voice;
    }
    setEntered(true);
    track(`museum_enter_${mode}`, {}, slug ? { slug } : {});
    if (isLive && !isOwner) supabase.rpc('museum_mark_entered', { p_slug: slug }).then(() => {});
  }

  function toggleVoice() {
    const voice = voiceRef.current;
    if (!voice) return;
    if (voice.paused) {
      voice.currentTime = 0;
      voice.play().catch(() => {});
      setVoiceOn(true);
    } else {
      voice.pause();
      setVoiceOn(false);
    }
  }

  async function giveHeart(photo) {
    if (liked.has(photo)) return; // одно сердечко с устройства на фото
    setLiked((set) => new Set(set).add(photo));
    const world = worldRef.current;
    let count = (hearts[photo] || 0) + 1;
    if (isLive) {
      const { data: server } = await supabase.rpc('museum_heart', { p_slug: slug, p_photo: photo });
      if (server) count = server;
      roomRef.current?.sendHeart(photo, count);
    }
    setHearts((h) => ({ ...h, [photo]: count }));
    world?.heartBurst(photo);
    world?.setHeartCount(photo, count);
  }

  async function signBook(e) {
    e.preventDefault();
    const message = bookText.trim();
    if (!message) return;
    const author = name.trim() || t('museum.world.guest');
    if (isLive) await supabase.rpc('museum_sign', { p_slug: slug, p_author: author, p_message: message });
    track('museum_book_sign');
    setBook((b) => [{ author, message }, ...b]);
    setBookText('');
    setBookSent(true);
  }

  async function shareStory() {
    track('museum_story');
    const hero = data.photos[0];
    const blob = await makeStoryCard({ photoUrl: hero?.full, title: t('museum.world.storyTitle'), footer: 'senti.uz' });
    if (blob) await shareBlob(blob, 'senti-museum.png');
  }

  async function addGuestPhoto(file) {
    if (!file) return;
    setGuestState('sending');
    try {
      const prepared = await preparePhoto(file);
      if (isLive) {
        const res = await fetch('/api/museum?action=guest-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, author: name.trim() || t('museum.world.guest'), image: await blobToBase64(prepared.fullBlob), w: prepared.w, h: prepared.h }),
        });
        if (!res.ok) throw new Error('guest photo failed');
      }
      track('museum_guest_photo');
      setGuestState('done');
    } catch {
      setGuestState('failed');
    }
  }

  function leave() {
    if (mode === 'preview') onExit?.();
    else setEnded(true);
  }

  function sendChat(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !roomRef.current?.sendChat(text)) return;
    setMessages((m) => [...m.slice(-60), { id: crypto.randomUUID(), who: name.trim(), color: C.rose, text }]);
    setDraft('');
  }

  if (!webgl) return <FallbackGallery data={data} text={t('museum.world.noWebgl')} />;

  const others = room.players.filter((p) => p.id !== room.me);
  const hallTotal = worldRef.current?.layout.hallCount || 1;
  const notes = { preview: t('museum.world.previewNote'), demo: t('museum.world.demoNote') };

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.night, overflow: 'hidden', fontFamily: C.ui, userSelect: 'none', WebkitUserSelect: 'none' }}>
      <canvas ref={canvasRef} data-testid="museum-canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {!entered && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: `radial-gradient(120% 90% at 50% 20%, #7c2c4a 0%, ${C.night} 70%)`, color: C.cream, userSelect: 'text' }}>
          <form
            style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}
            onSubmit={enter}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><LanguageSwitcher /></div>
            <p style={{ margin: 0, color: C.gold, fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t('museum.world.coverKicker')}</p>
            <h1 style={{ margin: '14px 0 8px', fontFamily: C.display, fontSize: 'clamp(38px, 9vw, 54px)', lineHeight: 1.05, fontWeight: 700 }}>
              {t('museum.world.coverTitle', { name: data.recipientName })}
            </h1>
            {data.authorName && <p style={{ margin: 0, fontSize: 15, opacity: 0.75 }}>{t('museum.world.coverBy', { name: data.authorName })}</p>}
            {isLive && (
              <label style={{ display: 'block', margin: '28px 0 0', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>
                {t('museum.world.yourName')}
                <input
                  value={name}
                  required
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('museum.world.namePlaceholder')}
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 16, fontFamily: C.ui, outline: 'none' }}
                />
              </label>
            )}
            <button type="submit" style={{ width: '100%', minHeight: 54, marginTop: 20, border: 'none', borderRadius: 999, background: C.rose, color: '#fff', fontFamily: C.ui, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              {t('museum.world.enter')}
            </button>
            {notes[mode] && <p style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.5, opacity: 0.72 }}>{notes[mode]}</p>}
            {onExit && (
              <button type="button" onClick={onExit} style={{ ...pill, background: 'transparent', marginTop: 8 }}>{t('museum.common.back')}</button>
            )}
          </form>
        </div>
      )}

      {entered && !ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.night, color: C.cream, gap: 14 }}>
          <p style={{ margin: 0, fontFamily: C.display, fontSize: 28 }}>{t('museum.world.loading')}</p>
          <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,.18)', borderRadius: 2 }}>
            <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: C.gold, borderRadius: 2, transition: 'width .2s' }} />
          </div>
        </div>
      )}

      {entered && ready && (
        <>
          <div style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top))', left: 12, right: 12, display: 'flex', justifyContent: 'space-between', gap: 8, pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
              <button type="button" data-testid="exit" style={pill} onClick={leave}>{t('museum.world.exit')}</button>
              {isLive && room.players.map((p) => (
                <button key={p.id} type="button" disabled={p.id === room.me} title={p.id === room.me ? undefined : t('museum.world.followHint')} onClick={() => worldRef.current?.follow(p.id)} style={{ ...pill, cursor: p.id === room.me ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 0, padding: '8px 12px', fontSize: 13 }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.color }} />{p.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
              {(data.songUrl || (data.ambient && data.ambient !== 'off') || data.voiceUrl) && (
                <button type="button" data-testid="mute" style={pill} aria-label={t(muted ? 'museum.world.soundOn' : 'museum.world.soundOff')} onClick={() => setMuted((m) => !m)}>{muted ? '🔇' : '🔊'}</button>
              )}
              <button type="button" style={pill} aria-label={t('museum.world.about')} onClick={() => setAbout(true)}>i</button>
              {isLive && (
                <button type="button" style={pill} data-testid="chat-toggle" onClick={() => { setChatOpen((o) => !o); setUnread(0); }}>
                  {t('museum.world.chat')}{unread > 0 && !chatOpen ? ` · ${unread}` : ''}
                </button>
              )}
            </div>
          </div>

          {hud.hall > 0 && (
            <span data-testid="hall" style={{ position: 'absolute', left: '50%', top: 'calc(66px + env(safe-area-inset-top))', transform: 'translateX(-50%)', padding: '5px 12px', borderRadius: 999, background: C.glass, color: '#fff', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
              {t('museum.world.hallOf', { hall: hud.hall, total: hallTotal })}
            </span>
          )}
          {hud.following && (
            <button type="button" onClick={() => worldRef.current?.follow(null)} style={{ ...pill, position: 'absolute', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', background: C.berry, whiteSpace: 'nowrap' }}>
              {t('museum.world.following', { name: room.players.find((p) => p.id === hud.following)?.name || '' })}
            </button>
          )}

          {isLive && room.status === 'offline' && (
            <p style={{ ...pill, position: 'absolute', top: 72, left: 12, right: 12, margin: 0, borderRadius: 14, minHeight: 0, cursor: 'default', textAlign: 'center', fontWeight: 500, fontSize: 13 }}>{t('museum.world.roomOffline')}</p>
          )}
          {isLive && room.status === 'online' && room.admitted && others.length === 0 && !hint && (
            <p style={{ ...pill, position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', width: 'min(340px, calc(100% - 24px))', margin: 0, boxSizing: 'border-box', borderRadius: 14, minHeight: 0, cursor: 'default', textAlign: 'center', fontWeight: 500, fontSize: 13 }}>{t('museum.world.solo')}</p>
          )}

          <Joystick onMove={(x, y) => worldRef.current?.setMove(x, y)} />

          <div style={{ position: 'absolute', right: 16, bottom: 'calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {hud.nearEntrance && data.voiceUrl && (
              <button type="button" data-testid="voice" style={{ ...pill, background: C.berry }} onClick={toggleVoice}>
                {voiceOn ? t('museum.world.voiceStop') : t('museum.world.voicePlay')}
              </button>
            )}
            {hud.nearHero && data.finaleQuestion && finale === 'closed' && (
              <button type="button" style={{ ...pill, background: C.berry }} onClick={() => setFinale('open')}>{t('museum.world.finaleAgain')}</button>
            )}
            {hud.nearFilm && (
              <button type="button" data-testid="film" style={{ ...pill, background: C.berry }} onClick={() => worldRef.current?.toggleFilm()}>
                {hud.filmPlaying ? t('museum.world.pauseFilm') : t('museum.world.playFilm')}
              </button>
            )}
            {(hud.canSit || hud.sitting) && (
              <button type="button" data-testid="sit" style={pill} onClick={() => (hud.sitting ? worldRef.current?.stand() : worldRef.current?.sit())}>
                {hud.sitting ? t('museum.world.stand') : t('museum.world.sit')}
              </button>
            )}
          </div>

          {hint && (
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(330px, calc(100% - 40px))', boxSizing: 'border-box', padding: 20, borderRadius: 18, background: 'rgba(32,12,22,.86)', color: '#fff', textAlign: 'center' }}>
              <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.5 }}>{touch ? t('museum.world.hintTouch') : t('museum.world.hintMouse')}</p>
              <button type="button" data-testid="hint-ok" onClick={() => setHint(false)} style={{ ...pill, background: C.rose, width: '100%' }}>{t('museum.world.gotIt')}</button>
            </div>
          )}

          {finale === 'open' && !hint && (
            <Finale
              question={data.finaleQuestion}
              author={data.authorName}
              live={isLive}
              slug={slug}
              t={t}
              onClose={() => setFinale(answeredRef.current ? 'answered' : 'closed')}
              onAnswered={() => { answeredRef.current = true; }}
            />
          )}

          {chatOpen && (
            <form onSubmit={sendChat} style={{ position: 'absolute', right: 12, top: 'calc(66px + env(safe-area-inset-top))', width: 'min(300px, calc(100% - 24px))', display: 'flex', flexDirection: 'column', maxHeight: '44dvh', borderRadius: 16, background: 'rgba(32,12,22,.88)', color: '#fff', userSelect: 'text' }}>
              <div style={{ overflowY: 'auto', padding: 12, flex: 1, minHeight: 60, fontSize: 14, lineHeight: 1.4 }}>
                {messages.length === 0 && <p style={{ margin: 0, opacity: 0.6 }}>{t('museum.world.noMessages')}</p>}
                {messages.map((m) => (
                  <p key={m.id} style={{ margin: '0 0 6px', wordBreak: 'break-word' }}><b style={{ color: m.color }}>{m.who}: </b>{m.text}</p>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, padding: 8 }}>
                <input data-testid="chat-input" value={draft} maxLength={200} onChange={(e) => setDraft(e.target.value)} placeholder={t('museum.world.chatPlaceholder')} style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: 'none', fontSize: 16, fontFamily: C.ui, color: C.ink }} />
                <button type="submit" style={{ ...pill, background: C.rose, minHeight: 0 }}>{t('museum.world.send')}</button>
              </div>
            </form>
          )}
        </>
      )}

      {viewer !== null && (
        <div
          role="dialog"
          data-testid="viewer"
          onClick={() => setViewer(null)}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, boxSizing: 'border-box', background: 'rgba(15,5,10,.92)', cursor: 'zoom-out' }}
        >
          <img src={data.photos[viewer].full} alt="" style={{ maxWidth: '100%', minHeight: 0, flex: '0 1 auto', objectFit: 'contain', borderRadius: 4 }} />
          {(data.photos[viewer].caption || data.photos[viewer].date) && (
            <p style={{ margin: 0, maxWidth: 520, textAlign: 'center', color: C.cream, fontFamily: C.display, fontStyle: 'italic', fontSize: 22, lineHeight: 1.25 }}>
              {data.photos[viewer].caption}
              {data.photos[viewer].date && <span style={{ display: 'block', marginTop: 4, fontFamily: C.ui, fontStyle: 'normal', fontSize: 13, color: C.gold }}>{data.photos[viewer].date}</span>}
            </p>
          )}
          <button type="button" data-testid="heart" onClick={(e) => { e.stopPropagation(); giveHeart(viewer); }} style={{ ...pill, flexShrink: 0, background: C.rose }}>
            ♥ {hearts[viewer] || t('museum.world.heart')}{liked.has(viewer) ? ' ✓' : ''}
          </button>
        </div>
      )}

      {guestView !== null && (
        <button type="button" aria-label={t('museum.common.close')} onClick={() => setGuestView(null)} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, border: 'none', background: 'rgba(15,5,10,.92)', color: C.cream, fontFamily: C.ui, fontSize: 14, cursor: 'zoom-out' }}>
          <img src={data.guestPhotos[guestView].url} alt="" style={{ maxWidth: '100%', minHeight: 0, objectFit: 'contain', borderRadius: 4 }} />
          {t('museum.world.guestFrom', { name: data.guestPhotos[guestView].author })}
        </button>
      )}

      {ended && (
        <div data-testid="end" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '32px 20px', boxSizing: 'border-box', background: `radial-gradient(120% 90% at 50% 10%, #7c2c4a 0%, ${C.night} 70%)`, color: C.cream, userSelect: 'text' }}>
          <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: C.display, fontSize: 38, lineHeight: 1.1 }}>{t('museum.world.endTitle')}</h2>
            <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.5, opacity: 0.8 }}>{t('museum.world.endText')}</p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 26 }}>
              <button type="button" data-testid="story" onClick={shareStory} style={{ ...pill, background: C.rose }}>{t('museum.world.story')}</button>
              <a href={MAKE_YOURS_URL} data-testid="make-yours" onClick={() => track('museum_make_yours')} style={{ ...pill, background: 'rgba(255,255,255,.14)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{t('museum.world.makeYours')}</a>
              <input ref={guestInput} data-testid="guest-input" type="file" accept="image/*" hidden onChange={(e) => { addGuestPhoto(e.target.files[0]); e.target.value = ''; }} />
              {guestState === 'done'
                ? <p style={{ margin: 0, color: C.gold, fontSize: 14 }}>{t('museum.world.guestDone')}</p>
                : <button type="button" data-testid="guest-add" disabled={guestState === 'sending'} onClick={() => guestInput.current.click()} style={{ ...pill, background: 'rgba(255,255,255,.14)' }}>{guestState === 'sending' ? '…' : t('museum.world.guestAdd')}</button>}
              {guestState === 'failed' && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#ffc4c4' }}>{t('museum.world.guestFailed')}</p>}
              <button type="button" onClick={() => setEnded(false)} style={{ ...pill, background: 'transparent' }}>{t('museum.world.backInside')}</button>
            </div>

            <div style={{ textAlign: 'left' }}>
              <h3 style={{ margin: '0 0 10px', fontFamily: C.display, fontSize: 26 }}>{t('museum.world.book')}</h3>
              {!bookSent ? (
                <form onSubmit={signBook} style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                  <textarea data-testid="book-input" rows={3} maxLength={300} value={bookText} onChange={(e) => setBookText(e.target.value)} placeholder={t('museum.world.bookPlaceholder')} style={{ padding: 12, borderRadius: 12, border: 'none', fontFamily: C.ui, fontSize: 16, color: C.ink, resize: 'vertical' }} />
                  <button type="submit" data-testid="book-send" style={{ ...pill, background: C.berry }}>{t('museum.world.bookSend')}</button>
                </form>
              ) : <p style={{ margin: '0 0 14px', color: C.gold, fontSize: 14 }}>{t('museum.world.bookThanks')}</p>}
              {book.map((entry, i) => (
                <p key={`${entry.author}-${i}`} style={{ margin: '0 0 10px', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.09)', fontSize: 14, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  <b style={{ color: C.gold }}>{entry.author}: </b>{entry.message}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {about && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15,5,10,.7)' }}>
          <div style={{ width: 'min(380px, 100%)', boxSizing: 'border-box', maxHeight: '80dvh', overflowY: 'auto', padding: 24, borderRadius: 18, background: C.cream, color: C.ink, userSelect: 'text' }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: C.display, fontSize: 30 }}>{t('museum.world.aboutText', { name: data.recipientName })}</h2>
            <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{data.dedication}</p>
            <p style={{ margin: '0 0 18px', fontFamily: C.display, fontStyle: 'italic', fontSize: 20, color: C.berry }}>{data.signature}</p>
            <button type="button" onClick={() => setAbout(false)} style={{ ...pill, background: C.berry, width: '100%' }}>{t('museum.common.close')}</button>
          </div>
        </div>
      )}

      {entered && isLive && !room.admitted && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(32,12,22,.94)', color: C.cream, textAlign: 'center' }}>
          <div style={{ maxWidth: 340 }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: C.display, fontSize: 34 }}>{t('museum.world.full')}</h2>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{t('museum.world.fullText', { place: room.queue })}</p>
          </div>
        </div>
      )}

      {lost && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.night, color: C.cream, textAlign: 'center' }}>
          <div style={{ maxWidth: 320 }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: C.display, fontSize: 32 }}>{t('museum.world.lostTitle')}</h2>
            <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{t('museum.world.lostText')}</p>
            <button type="button" onClick={() => window.location.reload()} style={{ ...pill, background: C.rose }}>{t('museum.world.reload')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
