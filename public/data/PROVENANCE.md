# Historical monthly lightning extract provenance

The active asset `lightning/2017-03.json` is copied byte-for-byte from EarthJukeBox
`data/processed/lightning/2017-03.json`. The legacy `lightning.json` snapshot is
retained for traceability but is not requested by the application.

- Declared source: NASA ISS LIS Science Data V3.
- Records: 67,029 flashes; 1,412 populated ten-minute windows.
- Records with March UTC timestamps: 67,020, across all 31 March dates.
- Additional UTC date: April 1, 2017, containing 9 records.
- First timestamp: 2017-03-01T01:31:40.072528Z.
- Last timestamp: 2017-04-01T00:26:49.240010Z.
- April timestamps: 2017-04-01T00:25:19.152852Z through 2017-04-01T00:26:49.240010Z.
- Fields: time (UTC ISO timestamp), latitude (degrees), longitude (degrees), radiance.
- Radiance unit declared in JSON: uJ/sr/m2/um.
- Active dataset SHA-256: ee880b08fae6ff6063cfe3b5dc33eaeb828903a0981373deb51794eabe8a88df.
- Updated scannerScore.js SHA-256: 4f1e192eaf0a1472a5519e4cbff701bcc286dcc7ddefd87c9c2dc58d3574d7c8.
- sonification.js SHA-256: e2f8f42e413a7de19b896ebc16aba3b86c79aac8ab83d71fc7f414fa82f00018.
- Map SHA-256: bb218c1051441cf6c59d80c76d74f28d7349a4f3f01e80762b5d0afe36939375.

Validation found no invalid timestamps, out-of-range coordinates, negative/nonfinite
radiances, or exact duplicate records. All ten-minute counts reconcile with the
67,029 individual records. Timestamps are sorted. Latitude range is approximately
-53.9769 to +53.6169 degrees; longitude range is -179.7690 to +179.6558 degrees.
Having observations on every March date does not establish complete daily coverage.

## Why April 1 is included

The filename identifies a nominal month; the JSON has no explicit month range,
per-record granule ID, or orbit identifier. It declares observation_coverage as
not_evaluated. April 1's nine records are valid under the same schema, and the
last ten-minute window (00:20–00:30 UTC) contains all nine.

EarthJukeBox's March download script includes
ISS_LIS_SC_V3.0_20170331_233154_FIN.nc. Its processor retains all flashes extracted
from orbit files, converting TAI offsets to UTC without calendar-month filtering.
An orbit crossing midnight is therefore a supported explanation, but cannot be
conclusively verified without raw NetCDF/per-record source metadata. The original
NetCDF files remain absent from the inspected repository.

SONARA preserves these nine records unchanged. March dates appear together in
the selector; April 1 appears in a separate additional-dates group and timeline,
with a localized explanation. All options and counts are derived from timestamps,
not a hardcoded number of dates. No records are invented, deduplicated or interpolated.

## Updated scientific mapping

The TypeScript port follows the updated EarthJukeBox scannerScore.js and its
sonification.js dependency. Latitude selects the nearest pentatonic base pitch;
relative longitude-band record density raises its register by up to 12 semitones,
after which frequency is rounded to MIDI. Velocity is 0.2 + 0.6 × normalized
radiance + 0.2 × density. Radiance is normalized to the day's maximum. This is
optical radiance, not electrical energy. Sampling, 45 ms voice offsets, 48 bands,
24-second duration and density-dependent note durations are retained.

Every selected UTC day's output is parity-tested against copies of the updated
original modules in tests/fixtures/. Sparse-band source-record reuse is retained
musically; repeated notes never increase recorded flash counts.

Audio is synthesized using native triangle oscillators. It is a generated musical
interpretation, not lightning recordings. Scanning is geographic, not chronological.
Coverage is not evaluated. Empty regions cannot establish absence of lightning.

The world map was supplied by EarthJukeBox; original cartographic attribution is
undocumented. Globe imagery is separately credited in TEXTURE_CREDITS.md.

Scientific source link: https://ghrc.nsstc.nasa.gov/lightning/
