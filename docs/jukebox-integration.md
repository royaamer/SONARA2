# EarthJukeBox scientific integration

Implemented on SONARA's `integration-jukebox` branch, without merging the experiment branch. EarthJukeBox is a read-only source.

## Living Ocean

Source: `4929d2e`, `audio/oscarMonthlyBassoon.js` and its HTML inspector.

The optional **Explore a Region** layer retains SONARA's canvas, trails, transport, HUD and recordings. Pointer selection, touch selection, and arrow keys inspect longitude/latitude. Escape closes the inspector and returns focus to its button.

Sampling duplicates the original renderer's bilinear interpolation, requiring all four corners to have finite eastward `u` and northward `v` velocities. Longitude wraps. Between daily fields, both components are linearly interpolated at the existing playback position. Speed is `hypot(u, v)` in m/s; direction is `atan2(v, u)`, counterclockwise from east. The readout identifies the nearest real observation date, and compares the two adjacent daily speeds rather than calling interpolated motion a new observation.

The original ±73° visual cutoff and 0.06 m/s particle-seeding threshold explain absent trails. Missing samples remain missing. The source's invalid-point direction fallback is deliberately omitted: a missing velocity gets a position cross but no invented arrow.

The soundtrack is a regional sonification, not the selected pixel. Active Bassoon information requires enabled, actually playing media and an audited event interval. Inspection never switches audio or invents geographic synchronization.

## Temperature

Source: `79102a1`, `audio/temperaturePlayer.js`, its HTML, preview, processing scripts and processed data/audit.

`public/data/temperature/` contains byte-identical copies of all twelve 2025 monthly JSON files, `months.json`, and `sonification_audit.json`. The source dataset is NASA GISS GISTEMP v4 LOTI (GHCNv4/ERSSTv5, 1200 km), with 90 × 180 original 2° cells. `tempanomaly` is a **difference** from 1951–1980; K differences equal °C differences. These are not absolute temperatures. Null cells are preserved. The displayed approximate mean is computed from valid original cells using cosine-latitude weights, not presented as NASA's published global index.

The live player mapping at this commit differs from the older processor `note_events`. SONARA explicitly preserves and labels that legacy audit, and plays the **actual live player algorithm**:

- Original mask-aware 1.1-cell Gaussian preprocessing, 0.86 smoothed blend, B-spline interpolation, 0.60 support threshold, and 2048 × 1024 raster.
- Original anomaly color stops at −5, −3, −1, 0, 1, 3, 5; missing data stays unsupported.
- A 24-second west-to-east scan counts seven numeric anomaly/color bins per column. Thresholds: −4, −2, −0.5, 0.5, 2, 4 °C difference.
- Base MIDI: 48, 50, 53, 55, 57, 60, 64. Pitch = base + `round(12 * binPixelCount / 1024)`.
- Gain = zero for an empty bin; otherwise `(0.012 + 0.20 * share^0.95) / sqrt(max(1, activeBinCount / 2))`. Original sine/triangle voices, frequency/gain smoothing, compressor settings and 0.78 master gain are retained.
- Pause silences voices and retains position. Restart resets to zero and waits for Play, as in the source temperature player. Month changes and navigation release voices.

Smoothing adds no observations. The source has missing cells, and the numeric display is derived from measurements. No external temperature music, replacement recordings or ocean-specific audio have been generated.

## Files

- Existing integration points: `src/App.tsx`, `src/pages/mission-control.tsx`, `src/mission-control/experience-content.ts`, `src/pages/living-ocean.tsx`.
- Ocean additions: `src/living-ocean/inspection.ts`, `region-inspector.tsx`, `region-inspector.css`.
- Temperature additions: `src/pages/temperature.tsx`; `src/temperature/data.ts`, `mapping.ts`, `audio-engine.ts`, `use-temperature.ts`, `content.ts`, `temperature.css`; 14 files under `public/data/temperature/`.
- Verification: `tests/jukebox-integration.test.mjs`, `tests/jukebox-integration.browser.mjs`, adjusted navigation counts in `tests/verify-browser.mjs`, and test commands in `package.json`.

## Verification

Run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:browser`, and `npm run test:integration:browser`.

Scientific parity tests compare source commit assets, January/November raster bytes and every audio bin, and the original Ocean sampler. Existing regression tests validate all 365 Ocean daily fields and original monthly audio assets. The integration browser test uses installed Chrome with real Web Audio analyser measurements, real WAV playback, twelve temperature months, region inspection, keyboard/touch interaction and mobile screenshots. Artifacts are written to `.artifacts/jukebox-integration/` (ignored by Git). Signal verification measures browser PCM before physical speakers; it cannot verify a user's hardware volume.
