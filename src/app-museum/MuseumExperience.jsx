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

export default function MuseumExperience({ data, mode = 'live', slug, onExit, localRoom = false }) {
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
    };
    // Сцена создаётся один раз, при входе
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) worldRef.current?.stop();
      else worldRef.current?.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function sendChat(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !roomRef.current?.sendChat(text)) return;
    setMessages((m) => [...m.slice(-60), { id: crypto.randomUUID(), who: name.trim(), color: C.rose, text }]);
    setDraft('');
  }

  if (!webgl) return <FallbackGallery data={data} text={t('museum.world.noWebgl')} />;

  const others = room.players.filter((p) => p.id !== room.me);
  const notes = { preview: t('museum.world.previewNote'), demo: t('museum.world.demoNote') };

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.night, overflow: 'hidden', fontFamily: C.ui, userSelect: 'none', WebkitUserSelect: 'none' }}>
      <canvas ref={canvasRef} data-testid="museum-canvas" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {!entered && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: `radial-gradient(120% 90% at 50% 20%, #7c2c4a 0%, ${C.night} 70%)`, color: C.cream, userSelect: 'text' }}>
          <form
            style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}
            onSubmit={(e) => { e.preventDefault(); setEntered(true); }}
          >
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
              {onExit && <button type="button" style={pill} onClick={onExit}>{t('museum.world.exit')}</button>}
              {isLive && room.players.map((p) => (
                <span key={p.id} style={{ ...pill, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 0, padding: '8px 12px', fontSize: 13 }}>
                  <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.color }} />{p.name}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
              <button type="button" style={pill} aria-label={t('museum.world.about')} onClick={() => setAbout(true)}>i</button>
              {isLive && (
                <button type="button" style={pill} data-testid="chat-toggle" onClick={() => { setChatOpen((o) => !o); setUnread(0); }}>
                  {t('museum.world.chat')}{unread > 0 && !chatOpen ? ` · ${unread}` : ''}
                </button>
              )}
            </div>
          </div>

          {isLive && room.status === 'offline' && (
            <p style={{ ...pill, position: 'absolute', top: 72, left: 12, right: 12, margin: 0, borderRadius: 14, minHeight: 0, cursor: 'default', textAlign: 'center', fontWeight: 500, fontSize: 13 }}>{t('museum.world.roomOffline')}</p>
          )}
          {isLive && room.status === 'online' && room.admitted && others.length === 0 && !hint && (
            <p style={{ ...pill, position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', width: 'min(340px, calc(100% - 24px))', margin: 0, boxSizing: 'border-box', borderRadius: 14, minHeight: 0, cursor: 'default', textAlign: 'center', fontWeight: 500, fontSize: 13 }}>{t('museum.world.solo')}</p>
          )}

          <Joystick onMove={(x, y) => worldRef.current?.setMove(x, y)} />

          <div style={{ position: 'absolute', right: 16, bottom: 'calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
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
        <button
          type="button"
          aria-label={t('museum.common.close')}
          onClick={() => setViewer(null)}
          style={{ position: 'absolute', inset: 0, border: 'none', padding: 16, background: 'rgba(15,5,10,.92)', cursor: 'zoom-out', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img src={data.photos[viewer].full} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
        </button>
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
