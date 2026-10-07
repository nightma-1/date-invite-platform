/**
 * © 2026 Senti.
 * Параллакс: космос откликается на наклон телефона, а на компьютере — на
 * движение мыши. Возвращает {x, y} в диапазоне примерно -1..1, уже
 * сглаженные, плюс enable() — его нужно позвать В ОТВЕТ НА КАСАНИЕ, потому
 * что iOS выдаёт доступ к гироскопу только из обработчика жеста.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function useParallax({ enabled = true, strength = 1 } = {}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const base = useRef(null);          // нулевое положение телефона в руке
  const granted = useRef(false);

  const enable = useCallback(async () => {
    if (granted.current) return;
    const D = typeof window !== 'undefined' ? window.DeviceOrientationEvent : null;
    if (D && typeof D.requestPermission === 'function') {
      try {
        const res = await D.requestPermission();
        granted.current = res === 'granted';
      } catch {
        granted.current = false;
      }
    } else {
      granted.current = true;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    function onOrient(e) {
      if (e.beta == null || e.gamma == null) return;
      // первое событие задаёт точку отсчёта: человек держит телефон как ему
      // удобно, и «ноль» не обязан совпадать с горизонтом
      if (!base.current) base.current = { beta: e.beta, gamma: e.gamma };
      const dB = e.beta - base.current.beta;
      const dG = e.gamma - base.current.gamma;
      target.current = {
        x: clamp(dG / 26, -1, 1) * strength,
        y: clamp(dB / 26, -1, 1) * strength,
      };
    }
    function onMouse(e) {
      target.current = {
        x: clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1) * strength,
        y: clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1) * strength,
      };
    }

    window.addEventListener('deviceorientation', onOrient, true);
    const fine = window.matchMedia?.('(pointer: fine)')?.matches;
    if (fine) window.addEventListener('mousemove', onMouse);

    let raf;
    const cur = { x: 0, y: 0 };
    function tick() {
      cur.x += (target.current.x - cur.x) * 0.07;
      cur.y += (target.current.y - cur.y) * 0.07;
      // обновляем состояние только при заметном изменении — иначе React
      // перерисовывал бы сцену каждый кадр впустую
      setOffset((prev) => (Math.abs(prev.x - cur.x) > 0.004 || Math.abs(prev.y - cur.y) > 0.004
        ? { x: +cur.x.toFixed(3), y: +cur.y.toFixed(3) }
        : prev));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('deviceorientation', onOrient, true);
      window.removeEventListener('mousemove', onMouse);
      cancelAnimationFrame(raf);
    };
  }, [enabled, strength]);

  return { ...offset, enable };
}
