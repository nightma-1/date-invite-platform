/**
 * © 2026 Senti. Все права защищены.
 *
 * Комната на четверых. Серверов своих нет: Supabase Realtime (presence знает,
 * кто в комнате, broadcast разносит движения и чат). В базу ничего не пишется.
 * Каждое сообщение платное по квоте, поэтому координаты уходят редко и только
 * при движении, а плавность достраивает приём.
 */

import { supabase } from '../../lib/supabaseClient.js';

export const MAX_PLAYERS = 4;
const COLORS = ['#f85589', '#f2b84b', '#58b6c0', '#9b7be0'];

function supabaseTransport(topic) {
  const channel = supabase.channel(topic, { config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } } });
  const handlers = {};
  channel.on('presence', { event: 'sync' }, () => {
    const list = Object.values(channel.presenceState()).map((v) => v[0]).filter(Boolean);
    handlers.presence?.(list);
  });
  for (const event of ['pos', 'chat', 'film', 'heart']) {
    channel.on('broadcast', { event }, ({ payload }) => handlers.message?.(event, payload));
  }
  return {
    start(meta, onStatus) {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(meta);
          onStatus('online');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onStatus('offline');
        }
      });
    },
    on(name, fn) { handlers[name] = fn; },
    send(event, payload) { channel.send({ type: 'broadcast', event, payload }); },
    close() { supabase.removeChannel(channel); },
  };
}

/** Только для разработки: две вкладки одного браузера вместо Supabase. */
function localTransport(topic) {
  const bus = new BroadcastChannel(topic);
  const handlers = {};
  const peers = new Map();
  let me = null;
  const emit = () => handlers.presence?.([me, ...peers.values()].filter(Boolean));
  bus.onmessage = ({ data }) => {
    if (data.type === 'hello') {
      peers.set(data.meta.id, { ...data.meta, seen: Date.now() });
      if (data.ask) bus.postMessage({ type: 'hello', meta: me });
      emit();
    } else if (data.type === 'bye') {
      peers.delete(data.id);
      emit();
    } else {
      handlers.message?.(data.type, data.payload);
    }
  };
  return {
    start(meta, onStatus) {
      me = meta;
      bus.postMessage({ type: 'hello', meta, ask: true });
      emit();
      onStatus('online');
    },
    on(name, fn) { handlers[name] = fn; },
    send(event, payload) { bus.postMessage({ type: event, payload }); },
    close() {
      bus.postMessage({ type: 'bye', id: me?.id });
      bus.close();
    },
  };
}

const num = (v) => (Number.isFinite(v) ? v : 0);

export function createRoom({ slug, name, local = false, handlers }) {
  const id = crypto.randomUUID();
  const joinedAt = Date.now();
  const topic = `museum:${slug}`;
  const transport = local && import.meta.env.DEV ? localTransport(topic) : supabaseTransport(topic);
  let admitted = false;
  let closed = false;
  let lastChatAt = 0;

  transport.on('presence', (list) => {
    if (closed) return;
    // Первые четверо по времени входа играют, остальные ждут своей очереди
    const sorted = [...list].sort((a, b) => a.joinedAt - b.joinedAt || String(a.id).localeCompare(String(b.id)));
    const myPlace = sorted.findIndex((p) => p.id === id);
    admitted = myPlace >= 0 && myPlace < MAX_PLAYERS;
    const players = sorted.slice(0, MAX_PLAYERS).map((p, i) => ({ id: p.id, name: String(p.name || '').slice(0, 24), color: COLORS[i % COLORS.length] }));
    handlers.onPlayers({ players, admitted, me: id, queue: admitted ? 0 : myPlace - MAX_PLAYERS + 1 });
  });

  transport.on('message', (event, p) => {
    if (closed || !admitted || !p || typeof p.id !== 'string') return;
    if (event === 'pos') handlers.onPos(p.id, { x: num(p.x), z: num(p.z), yaw: num(p.yaw), sit: Boolean(p.sit) });
    if (event === 'chat' && typeof p.text === 'string') handlers.onChat(p.id, p.text.slice(0, 200));
    if (event === 'film') handlers.onFilm({ playing: Boolean(p.playing), t: num(p.t) });
    if (event === 'heart') handlers.onHeart(Math.trunc(num(p.photo)), Math.trunc(num(p.count)));
  });

  transport.start({ id, name, joinedAt }, (status) => handlers.onStatus(status));

  return {
    id,
    sendPos(x, z, yaw, sit) {
      if (admitted) transport.send('pos', { id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2), sit });
    },
    sendChat(text) {
      const now = Date.now();
      const clean = String(text).trim().slice(0, 200);
      if (!admitted || !clean || now - lastChatAt < 400) return false;
      lastChatAt = now;
      transport.send('chat', { id, text: clean });
      return true;
    },
    sendHeart(photo, count) {
      if (admitted) transport.send('heart', { id, photo, count });
    },
    sendFilm(playing, t) {
      if (admitted) transport.send('film', { id, playing, t });
    },
    leave() {
      closed = true;
      transport.close();
    },
  };
}
