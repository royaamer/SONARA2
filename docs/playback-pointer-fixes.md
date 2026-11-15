# Scientific pointers and strict playback fixes

Work performed on integration-jukebox. No commit, push, merge, or EarthJukeBox edits.
Existing working-tree edits were preserved. No scientific datasets, map dimensions, lightning marker styling, Welcome page, Mission Control page, or logo were edited for this task. The shared ambient controller was changed solely to remove automatic sound.

## Root causes

The shared introduction controller registered document-wide pointer, click, and keyboard listeners that started ambient music on ordinary interactions. It also started music on Unmute and faded audio across navigation. Restart resumed playing sessions in Electric Sky, Ocean, and temporal synthesis. Bassoon changes could start a layer. Selection/scope changes did not consistently cancel both engines. Synthesized completion depended on UI snapshots; lightning release tails could extend past duration and temperature oscillators had no audio-clock stop. Pending activations and reused references needed cancellation and cleanup protection. Active seeks to the end could restart tracks.

## Lifecycle and autoplay prevention

Removed generic gesture and Unmute activation. Navigation immediately stops ambient sources. Ambient music no longer loops. Only Play starts a stopped session. Restart resets silently; seeking preserves silence unless continuing a previously playing session, and seeking to the end never replays. Selection, observation, scope, audio mode, and bassoon changes cancel old playback. Generation checks reject stale activation success and failure callbacks. Temporal output reads current mute/volume after asynchronous activation. Unmount cancels animation frames, stops/disconnects sources and closes contexts; normal playback reuses contexts. Engine state includes idle, playing, paused, ended, and stopped while existing localized status labels remain compatible.

Pause/Stop disconnect synthesized voices immediately. Lightning notes are bounded by the scan's audio-clock end, with a silent boundary source updating completion independently of UI polling. Temperature oscillators receive native stop deadlines. Temporal PCM ends naturally and disconnects its source. Ocean completion pauses both WAV layers, invalidates pending requests, and cancels its animation frame. Completion retains progress at duration and requires another Play.

## Pointer metrics and synchronization

- Electric Sky: Full Map mean recorded flashes per occupied 5-degree cell in the displayed day. Uses source counts and the same per-cell linear color scale. Empty cells retain unknown coverage, not invented zero observations.
- Living Ocean: Full Map area-weighted mean speed of valid interpolated source vectors in the displayed field, in m/s. Uses the same temporal interpolation as selected-location inspection. Temporal synthesis uses each discrete day's area-weighted valid-grid mean speed.
- Temperature: Full Map area-weighted mean anomaly from valid original monthly source cells, relative to 1951-1980. Selected values use original source cells, not smoothed display pixels.

Selected Region labels distinguish local measurements from Full Map summaries. Missing/nonfinite measurements show No data without a pointer. Original geographic scans keep the displayed day's/month's scientific value; they do not claim temporal evolution. Ocean original playback follows the interpolated displayed field without claiming the regional soundtrack is a local measurement. Temporal synthesis maps its AudioContext playback position to the source-date frame; seek updates that frame immediately and pause holds it. No independent pointer animation was introduced.

## Files changed for this task

- src/observatory/ambient.tsx
- src/observatory/ambient-audio.ts
- src/electric-sky/audio-engine.ts
- src/temperature/audio-engine.ts
- src/living-ocean/use-ocean.ts
- src/living-ocean/inspection.ts
- src/pages/electric-sky.tsx
- src/pages/living-ocean.tsx
- src/pages/temperature.tsx
- src/experiences/experience-dashboard.tsx
- src/experiences/temporal-player.tsx
- src/experiences/temporal-science.ts
- src/experiences/playback-state.ts
- tests/electric-sky.test.mjs
- tests/temporal-science.test.mjs
- tests/playback-policy.test.mjs
- tests/playback-policy.browser.mjs
- docs/playback-pointer-fixes.md

## Verification

TypeScript check and production build passed. Build emits existing tooltip sourcemap and large-bundle warnings. The final full automated suite passed: 41 tests, zero failures. Tests cover real dataset preservation, source-grid sampling and missing masks, pointer rendering, pending activation cancellation and stale rejection, audio-clock boundaries without UI polling, silent restart/seek, and full-map ocean interpolation.

Headless Chrome ran the existing temporal browser suite for all three experiences: selected pointers, playback, pause, seek, original-mode switching, responsive layouts, keyboard/accessibility and SPA cleanup passed. The dedicated playback policy browser suite also checks Welcome/Mission Control silence, Full Map pointers, silent seeks/restarts, original and temporal completion, post-completion silence, replay, selection/scope/mode cancellation, missing data and navigation. Browser verification instruments real Web Audio sources and HTML media; it is not a human speaker/listening test.

No known remaining functional issues from these two fixes. Build warnings remain outside this task. Browser test cleanup may retain its isolated temporary Chrome profile when Windows holds files open.
