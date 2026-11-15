# SONARA

React + TypeScript + Vite Earth observatory with English/Arabic support, a shared
Three.js Earth, cinematic Mission Control selection, and EarthJukeBox lightning sonification.

## Run locally

Node.js 22.12+ is required. Dependencies are already present in this workspace.

```powershell
npm.cmd run dev
```

Open the URL Vite prints (normally http://localhost:5173). On systems without
PowerShell's npm script restriction, `npm run dev` also works.

1. Enter or skip the homepage introduction.
2. Choose **Begin Listening**, then enter or wait for the cinematic transition.
3. Choose **The Electric Sky**. The other three cards open Coming Soon messages.
4. Select a historical UTC observation date and press **Activate Earth Scanner**.
5. Use Pause, Resume, Stop, Volume, and Mute. Dragging scan position pauses; Resume
   starts from that geographic position. Changing date stops audio and resets the scan.
6. Inspect the last source record under telemetry. Return to experiences opens the
   four choices immediately; entering from the homepage retains the cinematic transition.
7. Switch EN / ع to test Arabic and RTL. The geographic map always keeps west on the left.

Direct route: `/mission-control/electric-sky`. Audio begins only from a playback
button gesture. Use an HTTP server, not a double-clicked file:// URL. Check the
browser tab, operating-system volume, and speaker output if you cannot hear it.

## Architecture

- `src/pages/home.tsx`: original homepage; Four Experiences selection UI removed.
- `src/pages/mission-control.tsx`: cinematic experience cards and Coming Soon states.
- `src/mission-control/shared.tsx`: shared header, arrival sequence, language/document handling.
- The 3D observatory preview and interactive explanation section are not rendered
  in Mission Control or Electric Sky; the original homepage Earth remains intact.
- `src/pages/electric-sky.tsx`: lightning experience orchestration and localized controls.
- `src/electric-sky/scanner-score.ts`: typed EarthJukeBox mapping, retaining exact score behavior.
- `src/electric-sky/lightning-data.ts`: validated historical data loading.
- `src/electric-sky/audio-engine.ts`: native Web Audio transport and synthesis; one clock
  controls notes, longitude scan, and source highlights. No Tone.js dependency or CDN audio.
- `src/electric-sky/visualizations.tsx`: coordinate-based map and actual analyser spectrum.
- `src/mission-control/integrations.ts`: reusable public exports for future integrations.
- `public/data/lightning/2017-03.json`: byte-identical EarthJukeBox monthly extract.
- `public/maps/world-equirectangular.svg`: copied existing EarthJukeBox map.

The original `C:\Users\user\EarthJukeBox` repository is not modified.

## Scientific scope

The bundled extract identifies itself as **NASA ISS LIS Science Data V3**. It has
67,029 flash records and 1,412 populated ten-minute windows. Records cover every
March 2017 UTC date, plus nine records on April 1. Every record includes time, latitude, longitude, and optical radiance.
The loader validates the entire extract and reconciles every window count.

The score preserves `scannerScore.js`'s original 48 longitude bands, 24-second scan,
base pentatonic pitch scale, density-raised register (up to 12 semitones),
radiance sampling, linearly normalized radiance/density velocity, duration equations, and
45 ms voice offsets. It is a **geographic scan**, not a chronological replay.
Sparse bands can use one flash more than once musically. Note count is never used
as an observation count. Native triangle synthesis replaces the original Tone.js
renderer; no fixed harmony or extra observations are added.

Coverage is explicitly **not evaluated**. Counts are records in this extract, not
complete global lightning activity. Boundary dates may be partial. The original
NetCDF files are absent, so raw-data provenance cannot be independently re-audited
here. Radiance is optical radiance, not lightning electrical energy. Generated tones
are musical interpretations, not lightning recordings or a live NASA feed.

Data/score provenance and hashes: `public/data/PROVENANCE.md`.
Map supplied by EarthJukeBox; its original cartographic attribution is undocumented.
NASA globe imagery is archival; see `TEXTURE_CREDITS.md`. Google Fonts is the only
external font dependency; system fallbacks apply offline.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Unit tests use Node's test runner and existing esbuild, with no new packages. They
compare every date's score against an unchanged copy of EarthJukeBox's original
mapper, check dataset integrity and rejection behavior, projection, and transport lifecycle.

The browser test uses installed Chrome with an isolated temporary profile and a
loopback-only static server. It checks the production build, navigation, Coming Soon,
real observations, playback state, scanner/frequency alignment, controls, English/Arabic,
mobile overflow, data failure, and actual native offline PCM synthesis/mute.
The date selector groups the named month separately from additional timestamp dates.
April 1 is retained and explicitly labeled, not silently filtered. The download script
includes a March 31 23:31:54 orbit and processing does not filter flash dates; crossing
midnight is a supported inference, not verified per-record provenance.

Set `CHROME_PATH` if Chrome is installed elsewhere. Screenshots and results are written
to `.artifacts/browser/` (ignored by git). A waveform test proves audio generation;
it cannot verify your physical speakers or subjective listening quality.

## Deploy

```powershell
npm.cmd run build
npm.cmd run preview
```

Publish `dist/`. The default base is `/`. For a subfolder, set `BASE_PATH` to its
absolute path, for example `/sonara/`, before building. Configure your host to
serve `index.html` for application routes, including `/mission-control/electric-sky`.
No backend or NASA credentials are required to explore this bundled historical extract.
