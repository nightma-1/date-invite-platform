/**
 * © 2026 Senti.
 * Звук сцены. Ничего не скачиваем: и фон, и отзвуки синтезируются Web Audio
 * прямо в браузере — это десяток строк вместо мегабайтов mp3, которые бы
 * грузились на мобильном интернете перед самым важным моментом письма.
 *
 * Браузеры не дают запускать звук без жеста, поэтому start() зовётся из
 * обработчика касания (открытие конверта).
 */
import { useRef, useState, useCallback, useEffect } from 'react';

export default function useAmbientSound() {
  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const nodesRef = useRef([]);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);

  const start = useCallback(() => {
    if (ctxRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    ctxRef.current = ac;

    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    masterRef.current = master;

    // мягкая подушка: три расстроенные пилы через фильтр + медленное
    // «дыхание» громкости, чтобы фон не был статичным гудением
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.6;
    filter.connect(master);

    [110, 164.81, 220].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * (1 + (i - 1) * 0.0015);
      const g = ac.createGain();
      g.gain.value = i === 2 ? 0.035 : 0.06;
      o.connect(g); g.connect(filter);
      o.start();
      nodesRef.current.push(o, g);
    });

    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    lfo.start();
    nodesRef.current.push(lfo, lfoGain);

    master.gain.linearRampToValueAtTime(0.16, ac.currentTime + 3.5);
    setStarted(true);
  }, []);

  /** Мягкий колокольчик — зовём в момент сборки портрета. */
  const chime = useCallback(() => {
    const ac = ctxRef.current;
    if (!ac || muted) return;
    const t0 = ac.currentTime;
    [1, 2.01, 3.02, 4.5].forEach((mult, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = 523.25 * mult;
      const g = ac.createGain();
      const peak = 0.17 / (i + 1.4);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6 + i * 0.35);
      o.connect(g); g.connect(masterRef.current);
      o.start(t0); o.stop(t0 + 3.4);
    });
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const ac = ctxRef.current;
      if (ac && masterRef.current) {
        masterRef.current.gain.cancelScheduledValues(ac.currentTime);
        masterRef.current.gain.linearRampToValueAtTime(next ? 0 : 0.16, ac.currentTime + 0.4);
      }
      return next;
    });
  }, []);

  useEffect(() => () => {
    nodesRef.current.forEach((n) => { try { n.stop?.(); n.disconnect?.(); } catch { /* уже остановлен */ } });
    try { ctxRef.current?.close(); } catch { /* контекст уже закрыт */ }
  }, []);

  return { start, chime, toggleMute, muted, started };
}
