/** Audible playback can enter playing only from Play or an already playing seek. */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended' | 'stopped';
