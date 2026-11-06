/**
 * © 2026 Senti. Все права защищены.
 *
 * Запись голоса прямо в конструкторе. Микрофон запрашивается только по нажатию.
 */

import { useEffect, useRef, useState } from 'react';
import { MUSEUM_LIMITS as L } from '../lib/museumPlans.js';

export default function VoiceRecorder({ onDone, onError, styles, t }) {
  const [seconds, setSeconds] = useState(null);
  const stopRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function start() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(t('museum.builder.micDenied'));
      return;
    }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (chunks.length) onDone(new Blob(chunks, { type: recorder.mimeType }));
    };
    let elapsed = 0;
    setSeconds(0);
    const timer = setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      if (elapsed >= L.maxVoiceSeconds) stopRef.current?.();
    }, 1000);
    stopRef.current = () => {
      clearInterval(timer);
      stopRef.current = null;
      setSeconds(null);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    recorder.start();
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {seconds === null ? (
        <button type="button" data-testid="record" style={styles.ghost} onClick={start}>{t('museum.builder.record')}</button>
      ) : (
        <>
          <button type="button" data-testid="record-stop" style={{ ...styles.ghost, background: '#f85589', color: '#fff' }} onClick={() => stopRef.current?.()}>{t('museum.builder.stop')}</button>
          <span style={{ fontSize: 13, color: '#80757b' }}>{t('museum.builder.recording', { seconds })}</span>
        </>
      )}
      <input ref={fileRef} data-testid="voice-input" type="file" accept="audio/*" hidden onChange={(e) => { if (e.target.files[0]) onDone(e.target.files[0]); e.target.value = ''; }} />
      {seconds === null && <button type="button" style={styles.ghost} onClick={() => fileRef.current.click()}>{t('museum.builder.uploadAudio')}</button>}
    </div>
  );
}
