/**
 * © 2026 Senti. Все права защищены.
 *
 * Бесплатное демо: примеры рисуются прямо в браузере, поэтому в демо нет
 * чужих фотографий. В разработке ?room=имя включает комнату на двух вкладках.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MuseumExperience from './MuseumExperience.jsx';

const SCENES = [
  ['#f9c5a6', '#e2587a', '#5b2a55'], ['#bfe3f2', '#5a9fc2', '#254a68'], ['#ffe2a8', '#ee9a4d', '#7a3b2a'],
  ['#d8c6f2', '#8f6cc9', '#3f2c6b'], ['#c9eccf', '#57a67c', '#245244'], ['#ffd1dc', '#e77fa4', '#823a5c'],
  ['#fbe9c6', '#cf9f6b', '#6b4a33'], ['#b9d7ea', '#769fcd', '#3a4a7a'], ['#ffc9a9', '#d96a5a', '#5a2740'],
  ['#e4f1c9', '#9abf6b', '#4a6b3a'], ['#f3d4f0', '#c47ac0', '#5f3470'], ['#cfe8e5', '#6db3ab', '#2f5f60'],
];

const CAPTIONS = [
  { caption: 'Здесь могла быть ваша история', date: '14 февраля 2025' },
  { caption: 'Первая общая поездка', date: 'Самарканд, май' },
  null,
  { caption: 'Тот самый вечер, когда всё началось' },
  null,
];

function paint(canvas, [sky, mid, land], i, label) {
  const w = canvas.width;
  const h = canvas.height;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, sky);
  grad.addColorStop(1, mid);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.beginPath();
  g.arc(w * (0.2 + (i % 5) * 0.14), h * 0.3, h * 0.11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = land;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 12) g.lineTo(x, h * (0.68 + 0.12 * Math.sin(x / w * 7 + i * 1.7)));
  g.lineTo(w, h);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = `600 ${Math.round(h * 0.06)}px "Cormorant Garamond", serif`;
  g.textAlign = 'center';
  g.fillText(label, w / 2, h * 0.92);
}

function samplePhotos(count) {
  return Array.from({ length: count }, (_, i) => {
    const portrait = i % 3 === 1;
    const canvas = document.createElement('canvas');
    canvas.width = portrait ? 800 : 1200;
    canvas.height = portrait ? 1100 : 800;
    paint(canvas, SCENES[i % SCENES.length], i, `№ ${i + 1}`);
    const url = canvas.toDataURL('image/jpeg', 0.82);
    return { full: url, thumb: url, w: canvas.width, h: canvas.height, ...(CAPTIONS[i % 5] || {}) };
  });
}

export default function MuseumDemo() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const room = import.meta.env.DEV ? params.get('room') : null;

  useEffect(() => {
    document.fonts?.load('600 40px "Cormorant Garamond"', '№').catch(() => {}).finally(() => {
      setData({
        recipientName: 'Malika',
        authorName: 'Senti',
        dedication: 'Здесь будут ваши слова. Тёплое посвящение, которое встречает у самого входа, прежде чем вы вместе пойдёте смотреть на свои лучшие дни.',
        signature: 'С любовью, Senti',
        videoUrl: '/museum/demo-film.mp4',
        theme: params.get('theme') || 'classic',
        ambient: 'warm',
        finaleQuestion: 'Пойдём делать новые фото?',
        hearts: { 1: 3 },
        guestbook: [{ author: 'Дилноза', message: 'Какие же вы красивые! Плачу у экрана.' }],
        photos: samplePhotos(Math.min(45, Math.max(6, Number(params.get('photos')) || 16))),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <div style={{ minHeight: '100dvh', background: '#2b1320' }} />;
  return room
    ? <MuseumExperience data={data} mode="live" slug={room} localRoom onExit={() => navigate('/lab/museum')} />
    : <MuseumExperience data={data} mode="demo" onExit={() => navigate('/lab/museum')} />;
}
