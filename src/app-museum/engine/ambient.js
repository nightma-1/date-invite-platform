/**
 * © 2026 Senti. Все права защищены.
 *
 * Тихая музыка залов. Ноты играет браузер, файлов и чужих записей нет.
 */

const MOODS = {
  warm: { chords: [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [174.6, 261.6, 349.2, 440], [196, 293.7, 392, 493.9]], bell: [523.3, 587.3, 659.3, 784, 880] },
  dream: { chords: [[293.7, 370, 440, 554.4], [246.9, 293.7, 370, 440], [196, 293.7, 370, 493.9], [220, 277.2, 329.6, 440]], bell: [587.3, 659.3, 740, 880, 987.8] },
};
const BAR_SECONDS = 7;

export function createAmbient(mood) {
  const notes = MOODS[mood];
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!notes || !Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(master);
  master.connect(ctx.destination);

  let bar = 0;
  let timer = null;
  let level = 0.16;

  const tone = (freq, start, length, peak, type) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + length * 0.3);
    gain.gain.linearRampToValueAtTime(0, start + length);
    osc.connect(gain);
    gain.connect(filter);
    osc.start(start);
    osc.stop(start + length + 0.05);
  };

  const playBar = () => {
    const t = ctx.currentTime + 0.05;
    for (const f of notes.chords[bar % notes.chords.length]) tone(f / 2, t, BAR_SECONDS * 1.25, 0.1, 'sine');
    for (let i = 0; i < 3; i += 1) {
      if (Math.random() < 0.7) {
        tone(notes.bell[Math.floor(Math.random() * notes.bell.length)], t + 1 + i * 1.9, 2.4, 0.05, 'triangle');
      }
    }
    bar += 1;
  };

  return {
    start() {
      ctx.resume();
      if (timer) return;
      playBar();
      timer = setInterval(playBar, BAR_SECONDS * 1000);
      master.gain.linearRampToValueAtTime(level, ctx.currentTime + 2.5);
    },
    setLevel(value) {
      level = value;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(value, ctx.currentTime + 0.6);
    },
    pause() { ctx.suspend(); },
    resume() { ctx.resume(); },
    stop() {
      clearInterval(timer);
      timer = null;
      ctx.close();
    },
  };
}
