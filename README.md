# beat-grid

[![npm](https://img.shields.io/npm/v/beat-grid)](https://www.npmjs.com/package/beat-grid)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/beat-grid)
[![license](https://img.shields.io/npm/l/beat-grid)](LICENSE)

Tempo detection and phase-locked beat grids from raw PCM.

**Zero runtime dependencies.** No ffmpeg, no FFT library, no native bindings — four pure
functions over a mono `Float32Array`. Decode audio however you already do it and hand the
samples in.

```bash
npm install beat-grid
```

```bash
pnpm add beat-grid     # or
yarn add beat-grid     # or
bun add beat-grid
```

ESM-only, ships its own types. Works in Node ≥ 18, Bun, Deno, workers and the browser —
there is nothing platform-specific in it.

## Why

Most beat-detection packages for JavaScript are built around the browser's `AudioContext`
and pull in an FFT dependency. This one is neither: it runs anywhere a `Float32Array` does
(Node, Bun, Deno, workers, the browser), has no install footprint, and is deterministic —
the same samples always give the same grid, so you can unit-test whatever you build on it.

## Usage

```ts
import { analyzeWaveform } from "beat-grid";

// `samples` = mono PCM in [-1, 1]; get it from ffmpeg, decodeAudioData, a WAV parser, …
const { bpm, beatTimes, durationSeconds } = analyzeWaveform(samples, 44100);

console.log(bpm);        // 128.3
console.log(beatTimes);  // [0.214, 0.682, 1.15, 1.618, …] seconds
```

Already know roughly what the tempo should be? Pass it as a prior — this is the most
reliable way to avoid half/double-time errors on tracks with strong subdivisions:

```ts
const { bpm } = analyzeWaveform(samples, 44100, 512, 80); // expect ~80 BPM
```

## API

### `analyzeWaveform(samples, sampleRate, hopSize?, expectedBpm?): WaveformAnalysis`

The whole pipeline in one call. Returns `{ bpm, beatTimes, durationSeconds }`.

### `onsetEnvelope(samples, sampleRate, hopSize?): OnsetEnvelope`

Onset-strength envelope: frames the signal, takes per-frame energy, and emits the positive
change in log-energy between consecutive frames. Peaks mark note and percussion onsets.
Returns `{ values, framesPerSecond }`.

### `estimateTempo(env, minBpm?, maxBpm?, fallbackBpm?, expectedBpm?): number`

Autocorrelates the onset envelope and picks the lag with the strongest periodicity in
`[minBpm, maxBpm]`. The score is weighted by a Gaussian in log2-tempo space centred on
`expectedBpm` (or 120 when unknown), which is what stops a half- or double-time lag from
winning — the classic octave error. Returns `fallbackBpm` for a silent or too-short signal.

Defaults: `minBpm = 70`, `maxBpm = 180`, `fallbackBpm = 120`.

### `beatTimes(env, bpm, durationSeconds): number[]`

Given a tempo, slides one period of offset and picks the phase that puts the most onset
energy on the beats, then tiles beats across the duration. Because the phase is chosen from
the audio, the downbeat lands on a real onset rather than at `t = 0`.

## Getting PCM in

`beat-grid` deliberately does not decode audio. Two common ways to feed it:

```ts
// Node — via ffmpeg, 22.05 kHz mono float32 is plenty for tempo work
import { execFileSync } from "node:child_process";
const raw = execFileSync("ffmpeg", [
  "-i", "track.mp3", "-f", "f32le", "-ac", "1", "-ar", "22050", "-",
], { maxBuffer: 1 << 28 });
const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
```

```ts
// Browser
const buf = await new AudioContext().decodeAudioData(arrayBuffer);
const samples = buf.getChannelData(0);
```

A lower sample rate means less work and does not hurt tempo accuracy — the analysis runs on
frame energy, not on pitch.

## Notes and limits

- **Mono only.** Mix down before calling; a stereo interleaved buffer will give nonsense.
- **Steady tempo assumed.** One global BPM and an evenly tiled grid. Music with tempo drift,
  rubato, or a mid-track tempo change is out of scope.
- **Octave errors are the failure mode to watch.** If detection lands on exactly half or
  double the real tempo, pass `expectedBpm`.
- `hopSize` defaults to 512 samples. Larger is faster and coarser; smaller resolves fast
  material better.

## Links

- **npm** — [npmjs.com/package/beat-grid](https://www.npmjs.com/package/beat-grid)
- **Source and issues** — [github.com/nguyenthienthanh/beat-grid](https://github.com/nguyenthienthanh/beat-grid)
- **Releases** — [changelog and tags](https://github.com/nguyenthienthanh/beat-grid/releases)

Extracted from a working AI music-video pipeline, where it replaced a text-declared BPM grid
with one measured off the actual audio.

## License

MIT
