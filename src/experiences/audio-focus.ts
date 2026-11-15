import { useEffect, useRef } from 'react';

const eventName = 'sonara-audio-focus';
/** A deliberate playback request interrupts every other sound owner. */
export function requestAudio(owner: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: owner }));
}

export function useAudioInterruption(owner: string, pause: () => void) {
  const callback = useRef(pause);
  callback.current = pause;
  useEffect(() => {
    const interrupt = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== owner) callback.current();
    };
    const hidden = () => { if (document.hidden) callback.current(); };
    const stop = () => callback.current();
    window.addEventListener(eventName, interrupt);
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener(eventName, interrupt);
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [owner]);
}
