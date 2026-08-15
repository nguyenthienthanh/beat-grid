/**
 * beat-grid — tempo + beat detection from a decoded waveform.
 *
 * Pure functions over a mono `Float32Array`. No ffmpeg, no FFT library, no runtime
 * dependencies — decode audio however you like (ffmpeg, `AudioContext.decodeAudioData`,
 * a WAV parser) and hand the PCM samples in.
 *
 * Pipeline: energy-based onset novelty → tempo via autocorrelation (perceptually weighted
 * to dodge octave errors) → phase-locked beat grid (offset chosen to maximise onset energy
 * on beats).
 */

export interface OnsetEnvelope {
  /** Half-wave-rectified log-energy novelty, one value per analysis frame. */
  values: Float32Array;
  /** Analysis frames per second (= sampleRate / hopSize). */
  framesPerSecond: number;
}

export interface WaveformAnalysis {
  bpm: number;
  /** Beat onset times in seconds, phase-locked to the detected tempo. */
  beatTimes: number[];
  durationSeconds: number;
}

const DEFAULT_HOP = 512;

/**
 * Onset-strength envelope: frame the signal, take per-frame energy, and emit the positive
 * change in log-energy between consecutive frames. Peaks mark note/percussion onsets.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number, hopSize = DEFAULT_HOP): OnsetEnvelope {
  const frames = Math.max(0, Math.floor(samples.length / hopSize));
  const values = new Float32Array(frames);
  let prevLogE = 0;
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    const start = f * hopSize;
    const end = start + hopSize;
    for (let i = start; i < end; i++) energy += samples[i]! * samples[i]!;
    const logE = Math.log(1e-9 + energy / hopSize);
    values[f] = f === 0 ? 0 : Math.max(0, logE - prevLogE);
    prevLogE = logE;
  }
  return { values, framesPerSecond: sampleRate / hopSize };
}

/** Sum_{i} x[i]·x[i-lag] over the valid range (unnormalised autocorrelation at one lag). */
function autocorrAt(x: Float32Array, lag: number): number {
  let s = 0;
  for (let i = lag; i < x.length; i++) s += x[i]! * x[i - lag]!;
  return s;
}

/**
 * Estimate tempo (BPM) by autocorrelating the onset envelope and picking the lag with the
 * strongest periodicity in [minBpm, maxBpm], weighted toward ~120 BPM so a half/double-time
 * lag doesn't win (the classic octave error). Returns `fallbackBpm` if the envelope is silent.
 *
 * Pass `expectedBpm` when you already know roughly what the tempo should be (a stated BPM,
 * a previous analysis) — it tightens the prior and is the most reliable way to kill octave
 * errors on tracks with strong subdivisions.
 */
export function estimateTempo(
  env: OnsetEnvelope,
  minBpm = 70,
  maxBpm = 180,
  fallbackBpm = 120,
  expectedBpm?: number,
): number {
  const { values, framesPerSecond: fps } = env;
  if (values.length < 8) return fallbackBpm;
  // Mean-subtract so a DC offset doesn't dominate the autocorrelation.
  let mean = 0;
  for (const v of values) mean += v;
  mean /= values.length;
  const x = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) x[i] = values[i]! - mean;

  // Perceptual prior: bias toward `expectedBpm` when known — this is what kills the octave
  // error (picking 161 when the real tempo is 82). A tighter Gaussian around a known target;
  // otherwise a broad one centred on 120.
  const center = expectedBpm && expectedBpm >= 40 && expectedBpm <= 300 ? expectedBpm : 120;
  const sigma = expectedBpm ? 0.4 : 0.8;

  const lagMin = Math.max(2, Math.floor((fps * 60) / maxBpm));
  const lagMax = Math.min(values.length - 1, Math.ceil((fps * 60) / minBpm));
  let bestLag = lagMin;
  let bestScore = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const bpm = (fps * 60) / lag;
    const z = Math.log2(bpm / center); // Gaussian in log2-tempo space (octave-symmetric)
    const weight = Math.exp(-0.5 * (z * z) / (sigma * sigma));
    const score = autocorrAt(x, lag) * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const bpm = (fps * 60) / bestLag;
  return Math.round(bpm * 10) / 10;
}

/**
 * Phase-locked beat grid: given a tempo, slide one period of offset and pick the phase that puts
 * the most onset energy on the beats, then tile beats across the duration. Better than a blind
 * grid because the downbeat lands on a real onset.
 */
export function beatTimes(env: OnsetEnvelope, bpm: number, durationSeconds: number): number[] {
  const { values, framesPerSecond: fps } = env;
  const periodFrames = (fps * 60) / bpm;
  if (!Number.isFinite(periodFrames) || periodFrames < 1) return [];
  const period = Math.round(periodFrames);
  let bestOffset = 0;
  let bestSum = -Infinity;
  for (let offset = 0; offset < period; offset++) {
    let sum = 0;
    for (let f = offset; f < values.length; f += period) sum += values[f]!;
    if (sum > bestSum) {
      bestSum = sum;
      bestOffset = offset;
    }
  }
  const out: number[] = [];
  for (let t = bestOffset / fps; t < durationSeconds; t += 60 / bpm) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/**
 * Full analysis: onset envelope → tempo → phase-locked beats. `expectedBpm` (a stated tempo,
 * if known) is used as a prior to avoid half/double-time octave errors.
 */
export function analyzeWaveform(
  samples: Float32Array,
  sampleRate: number,
  hopSize = DEFAULT_HOP,
  expectedBpm?: number,
): WaveformAnalysis {
  const durationSeconds = samples.length / sampleRate;
  const env = onsetEnvelope(samples, sampleRate, hopSize);
  const bpm = estimateTempo(env, 70, 180, 120, expectedBpm);
  return { bpm, beatTimes: beatTimes(env, bpm, durationSeconds), durationSeconds };
}
