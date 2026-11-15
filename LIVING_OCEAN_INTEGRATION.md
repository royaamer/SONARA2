# Living Ocean: full-year 2023 OSCAR integration

Source inspected: C:/Users/user/EarthJukeBox, checked-out my-work at b8eafe0 (Add monthly OSCAR audio previews). Source files were read only. The current reference implementation is audio/oscarMonthlyBassoon.html and audio/oscarMonthlyBassoon.js.

## Verified assets

All twelve months are complete: January 31 days, February 28, March 31, April 30, May 31, June 30, July 31, August 31, September 30, October 31, November 30, December 31. Coverage is January 1 through December 31, 2023: 365 unique dates, 365 distinct daily file hashes, and 365 distinct scientific u/v payloads.

Every daily JSON was parsed and validated against its monthly manifest: date/order, u/v array lengths, finite velocities, paired null masks, and nonempty ocean cells. Every grid is 360 by 180. Each month's original Deep Ocean WAV, sonification audit, Bassoon WAV, and Bassoon audit are present and valid. WAV headers/chunks and 25-second durations were checked. Bassoon source filenames, dates, speed thresholds, and speeds were checked against that month's original daily regional audit statistics.

The source also supplies Hybrid and Orchestral listening renders for every month. All 48 original WAVs were copied unchanged; the interface uses Deep Ocean plus optional Bassoon, matching the current source player. No audio was generated or re-rendered.

Only November supplies the separate web/sonification_metrics.json. It is loaded for November only. Other months use their own original sonification audits and do not request or inherit November's metrics. Missing optional metrics are not fabricated. No required files are missing.

451 original catalog/data/manifest/audit/audio/metrics files were copied and individually verified with SHA-256. Source bytes and values were retained exactly, including the original manifest descriptions. The existing original world map remains unchanged.

## Runtime integration

- public/data/ocean/ preserves the source's paths, including November's legacy web/ layout and the other months' web/YYYY-MM/ directories.
- availability.json is derived integration metadata, not scientific data. It enables only preflight-validated monthly packages and records optional Bassoon/metrics availability.
- src/living-ocean/loader.worker.ts loads the selected month, validates daily coverage and audit consistency again, and loads optional metrics only at their verified month-specific path.
- src/living-ocean/use-ocean.ts owns worker/media lifecycle, cancellation, original audio loading, pause/resume, Restart, seeking, and source Bassoon synchronization. Only the selected month is fetched. Switching/unmounting terminates workers, cancels animation, and unloads both audio sources.
- src/pages/living-ocean.tsx retains SONARA branding, route, immediate RETURN, English/Arabic, keyboard controls, and responsive presentation. Month navigation covers all twelve months. All date and time calculations use the selected manifest's actual field count and audited audio duration.
- src/living-ocean/renderer.ts retains EarthJukeBox interpolation, seeding, missing-cell rejection, midpoint integration, and turquoise strokes. It now uses the current source's fixed thickness 2.2px, trail half-life 9s, brightness 1.0, 3,900 particles on every screen, and month-dependent deterministic seed. Source clock-jump behavior replaces the earlier target-only reset optimization.
- The former target-only soundtrack selector, global-speed metric, daily-date dropdown, volume attenuation, and editable visual settings were removed from the Ocean interface. Source Play/Pause/Resume, Restart, month strip, UTC visual date, original source-event readout, and audited Bassoon toggle are used.

No sonification score-generation algorithm, scientific velocity value, or source audio file was changed. Deep Ocean plays at its original volume and rate; Bassoon uses the source volume of 0.52 and the source 75ms drift correction threshold.

## Reproducibility and tests

node scripts/integrate-ocean.mjs C:/Users/user/EarthJukeBox/data/processed/oscar

This inspects without copying. Adding --copy copies into SONARA only, writes availability.json, and records source/target checksums in .artifacts/ocean-year/verification.json.

TypeScript and production builds pass. Unit/integrity tests cover full-year source equality, incomplete/corrupt asset rejection, month-specific loading, optional metrics, and exact particle-stroke equality with the current EarthJukeBox JavaScript renderer. Different genuine February fields produce different paths.

The dedicated production-browser suite (npm run test:ocean:browser) passes for every month's first and last day, original monthly audio URLs/durations, actual trails, pause/resume, Restart, Bassoon toggle/synchronization, keyboard seeking, Arabic/mobile presentation, and direct RETURN with both audio layers released. It also verifies missing-WAV rejection without November substitution, Retry recovery, and cancellation during rapid month changes. Results and screenshots are in .artifacts/ocean-year/browser/. This suite is independent of concurrent dashboard edits to the broader browser regression suite.

The original project build warnings remain: tooltip sourcemap resolution and large main bundle. Source exports/audits were validated, not independently recomputed from raw NetCDF files. Mobile checks use Chrome emulation. Assets total approximately 394 MB on disk; the app loads one selected month rather than the entire year at once.
