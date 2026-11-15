import type { Audit } from './types';
import type { OceanStyle } from './comparison';

// Event strides, pitches and durations from Nimer's render_oscar_audio.py render().
// This describes the original WAVs; it never synthesizes or changes their audio.
export function soundtrackNotes(audit: Audit, seconds: number, style: OceanStyle) {
  const stride = style === 'deep_ocean' ? 4 : style === 'hybrid' ? 2 : 1;
  return audit.note_events.filter((_, index) => index % stride === 0).flatMap(event => {
    const voices = style === 'deep_ocean'
      ? [{ note: event.midi_note - 12, duration: 5.4 }]
      : [{ note: event.midi_note, duration: event.duration_seconds * (style === 'hybrid' ? 1.85 : 1) },
         { note: event.midi_note - 12, duration: event.duration_seconds * (style === 'hybrid' ? 2.1 : 1.15) }];
    return voices.filter(voice => seconds >= event.at_seconds && seconds < event.at_seconds + voice.duration)
      .map(voice => ({ ...voice, region: event.region }));
  });
}

export function soundtrackSourceEvent(audit: Audit, seconds: number, style: OceanStyle) {
  const stride = style === 'deep_ocean' ? 4 : style === 'hybrid' ? 2 : 1;
  return audit.note_events.filter((_, index) => index % stride === 0).findLast(event => event.at_seconds <= seconds) ?? null;
}
