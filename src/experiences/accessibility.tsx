import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { requestAudio, useAudioInterruption } from './audio-focus';
import './accessibility.css';

const introduction = 'Welcome to SONARA. Use Tab and Shift Tab to move between controls. Use Enter or Space to activate buttons. Use the skip link to reach the main content. Mission Control offers Electric Sky, Living Ocean, and Temperature. ';
const navigation = 'Choose an observation date. Enter latitude and longitude and press Select to inspect a location without using the map. Read the selected measurements and scientific scale below the map. Original audio scans the map or plays the original ocean recording. For a selected location across available dates, choose Data-driven temporal synthesis and Selected Region. Play starts or resumes sound. Pause suspends it. Restart plays from the beginning. Stop resets it. Use Volume and the keyboard-accessible waveform to adjust loudness and seek. Missing measurements are reported as unavailable. ';
const science: Record<string, string> = {
  'electric-sky': 'Electric Sky uses real ISS LIS lightning observations. Original scan notes follow the recorded flashes and geographic positions. Temporal synthesis maps recorded flash counts to pitch and loudness. Satellite coverage is incomplete. ',
  'living-ocean': 'Living Ocean uses NASA OSCAR surface-current measurements in meters per second. Original Deep Ocean and optional Bassoon recordings use the existing scientific mapping. Temporal synthesis maps current speed to pitch and loudness. ',
  temperature: 'Temperature uses NASA GISTEMP monthly anomalies relative to the 1951 to 1980 baseline. Original sound scans color coverage on the displayed raster. Temporal synthesis maps source temperature anomalies to pitch and loudness. ',
};

export function AccessibilityTools() {
  const [location] = useLocation();
  const supported = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  const [state, setState] = useState('stopped');
  const [message, setMessage] = useState('');
  const [contrast, setContrast] = useState(() => { try { return localStorage.getItem('sonara-high-contrast') === 'true'; } catch { return false; } });
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = () => {
    utterance.current = null;
    if (supported) window.speechSynthesis.cancel();
    setState('stopped');
  };
  useAudioInterruption('guide', stop);
  useEffect(() => { stop(); return () => { if (supported) window.speechSynthesis.cancel(); }; }, [location]);
  useEffect(() => {
    document.documentElement.classList.toggle('sonara-high-contrast', contrast);
    try { localStorage.setItem('sonara-high-contrast', String(contrast)); } catch { /* Preferences work in memory when storage is unavailable. */ }
  }, [contrast]);
  const speak = () => {
    if (!supported) return;
    stop();
    requestAudio('guide');
    const experience = location.split('/').at(-1) ?? '';
    const text = introduction + (science[experience] ?? 'Choose an available scientific experience in Mission Control. ') + (science[experience] ? navigation : '') + 'Scientific playback pauses while this guide speaks. Press Stop guidance to end this guide.';
    const next = new SpeechSynthesisUtterance(text);
    next.lang = 'en-US';
    utterance.current = next;
    next.onend = () => { if (utterance.current === next) { utterance.current = null; setState('stopped'); } };
    next.onerror = () => { if (utterance.current === next) { utterance.current = null; setState('stopped'); setMessage('Spoken guidance is unavailable. Read the guidance text below.'); } };
    try { window.speechSynthesis.speak(next); setState('speaking'); setMessage(''); }
    catch { utterance.current = null; setMessage('Spoken guidance is unavailable. Read the guidance text below.'); }
  };
  return <aside className="accessibility-tools" aria-label="Accessibility tools" lang="en">
    <a className="mc-skip" href="#sonara-content" onClick={event => {
      const main = document.querySelector('main');
      if (main) { event.preventDefault(); main.tabIndex = -1; main.focus(); main.scrollIntoView(); }
    }}>Skip to main content</a>
    <button type="button" disabled={!supported} onClick={speak}>Audio Guide</button>
    <button type="button" disabled={state === 'stopped'} onClick={() => {
      if (state === 'paused') { requestAudio('guide'); window.speechSynthesis.resume(); setState('speaking'); }
      else { window.speechSynthesis.pause(); setState('paused'); }
    }}>{state === 'paused' ? 'Resume guidance' : 'Pause guidance'}</button>
    <button type="button" disabled={state === 'stopped'} onClick={stop}>Stop guidance</button>
    <button type="button" aria-pressed={contrast} onClick={() => setContrast(value => !value)}>High contrast</button>
    <details><summary>Guidance text</summary><p>{introduction}{science[location.split('/').at(-1) ?? '']}{navigation}</p></details>
    <span role="status">{!supported ? 'Spoken guidance is unavailable in this browser. Guidance text is available.' : message || (state === 'stopped' ? '' : 'Audio guide ' + state)}</span>
  </aside>;
}
