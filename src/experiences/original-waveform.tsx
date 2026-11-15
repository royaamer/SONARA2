import { useEffect, useRef, useState } from 'react';
import { Waveform } from './temporal-player';
import { pcmPeaks } from './temporal-science';

export function OriginalWaveform({ identity, seconds, duration, playing, getPcm, urls, onSeek, disabled, id }: {
  identity: string; seconds: number; duration: number; playing: boolean;
  getPcm?: () => Float32Array | null; urls?: { url: string; gain: number }[];
  onSeek: (seconds: number) => void; disabled?: boolean; id: string;
}) {
  const [peaks, setPeaks] = useState<(number | null)[]>(Array(240).fill(null));
  const [error, setError] = useState('');
  const current = useRef({ seconds, playing, getPcm }); current.current = { seconds, playing, getPcm };
  const bins = useRef<(number | null)[]>(Array(240).fill(null));
  const urlKey = JSON.stringify(urls);
  useEffect(() => {
    bins.current = Array(240).fill(null); setPeaks([...bins.current]); setError('');
    if (!urls?.length) return;
    if (typeof AudioContext === 'undefined') { setError('Audio decoding unavailable in this browser'); return; }
    const controller = new AbortController(); const context = new AudioContext();
    void Promise.all(urls.map(async item => {
      const response = await fetch(item.url, { signal: controller.signal });
      if (!response.ok) throw Error('Waveform audio HTTP ' + response.status);
      return { buffer: await context.decodeAudioData(await response.arrayBuffer()), gain: item.gain };
    })).then(decoded => {
      if (controller.signal.aborted) return;
      const rate = decoded[0].buffer.sampleRate;
      const count = Math.max(...decoded.map(d => d.buffer.length));
      const channels = Math.max(...decoded.map(d => d.buffer.numberOfChannels));
      const channelPeaks: number[][] = [];
      for (let channel = 0; channel < channels; channel++) {
        const mix = new Float32Array(count);
        for (const { buffer, gain } of decoded) {
          if (buffer.sampleRate !== rate) throw Error('Waveform sample rates differ');
          const samples = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
          for (let i = 0; i < samples.length; i++) mix[i] += samples[i] * gain;
        }
        channelPeaks.push(pcmPeaks(mix));
      }
      setPeaks(channelPeaks[0].map((_, bin) => Math.max(...channelPeaks.map(channel => channel[bin]))));
    }).catch(e => { if (!controller.signal.aborted) setError(String(e)); }).finally(() => { if (context.state !== 'closed') void context.close().catch(() => {}); });
    return () => { controller.abort(); if (context.state !== 'closed') void context.close().catch(() => {}); };
  }, [identity, urlKey]);
  useEffect(() => {
    if (urls?.length) return;
    let animation = 0;
    const capture = () => {
      const state = current.current;
      if (state.playing && duration > 0) {
        const samples = state.getPcm?.();
        if (samples) {
          const index = Math.min(239, Math.floor(state.seconds / duration * 240));
          bins.current[index] = Math.max(bins.current[index] ?? 0, pcmPeaks(samples, 1)[0]); setPeaks([...bins.current]);
        }
      }
      animation = requestAnimationFrame(capture);
    };
    animation = requestAnimationFrame(capture); return () => cancelAnimationFrame(animation);
  }, [identity, duration, urlKey]);
  return <div className="original-waveform"><Waveform id={id} peaks={peaks} seconds={seconds} duration={duration} onSeek={onSeek} disabled={disabled}/>
    <span>{urls?.length ? 'Decoded audio PCM waveform' : 'Progressive PCM samples. Dashed regions have no captured samples.'}</span>{error && <span role="status">{error}</span>}</div>;
}

export function PlaybackVolume({ onChange }: { onChange: (volume: number) => void }) {
  const [volume, setVolume] = useState(.78), [muted, setMuted] = useState(false);
  const callback = useRef(onChange); callback.current = onChange;
  useEffect(() => callback.current(muted ? 0 : volume), [volume, muted]);
  return <div className="temporal-controls"><button className="mc-button" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
    <label>Volume<input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(+e.target.value)}/></label></div>;
}
