import { describe, it, expect } from "vitest";
import { onsetEnvelope, estimateTempo, beatTimes, analyzeWaveform } from "./index.js";

const SR = 22050;

/** Synthesize a click track: a short decaying 1.5 kHz burst on every beat at `bpm`. */
function clickTrack(bpm: number, durationSec: number, sr = SR): Float32Array {
  const n = Math.floor(durationSec * sr);
  const x = new Float32Array(n);
  const period = Math.round((60 / bpm) * sr);
  const clickLen = Math.floor(sr * 0.03); // 30 ms
  for (let start = 0; start < n; start += period) {
    for (let i = 0; i < clickLen && start + i < n; i++) {
      const t = i / sr;
      x[start + i] = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 60);
    }
  }
  return x;
}

describe("onsetEnvelope", () => {
  it("produces one frame per hop and peaks at onsets", () => {
    const env = onsetEnvelope(clickTrack(120, 4), SR);
    expect(env.framesPerSecond).toBeCloseTo(SR / 512, 1);
    expect(env.values.length).toBeGreaterThan(0);
    // A click track has clear positive novelty somewhere.
    expect(Math.max(...env.values)).toBeGreaterThan(0);
  });

  it("returns an empty envelope for a signal shorter than one hop", () => {
    const env = onsetEnvelope(new Float32Array(10), SR);
    expect(env.values.length).toBe(0);
  });
});

describe("estimateTempo", () => {
  it.each([
    [90, 84, 96],
    [120, 113, 127],
    [150, 142, 158],
  ])("detects %i BPM from a click track", (bpm, lo, hi) => {
    const detected = estimateTempo(onsetEnvelope(clickTrack(bpm, 10), SR));
    expect(detected).toBeGreaterThanOrEqual(lo);
    expect(detected).toBeLessThanOrEqual(hi);
  });

  it("falls back on a silent/too-short signal", () => {
    expect(estimateTempo(onsetEnvelope(new Float32Array(100), SR))).toBe(120);
  });

  it("uses the expected-BPM prior to avoid the octave (half/double) error", () => {
    // A track with a strong beat at 80 BPM AND eighth-note subdivisions (→ 160 BPM is tempting).
    const sr = SR,
      dur = 10,
      n = dur * sr;
    const x = new Float32Array(n);
    const beat = Math.round((60 / 80) * sr);
    const clickLen = Math.floor(sr * 0.03);
    for (let s = 0; s < n; s += beat) {
      for (let k = 0; k < clickLen && s + k < n; k++)
        x[s + k] = Math.sin(2 * Math.PI * 1500 * (k / sr)) * Math.exp(-(k / sr) * 60);
      // weaker subdivision click at the half-beat
      const h = s + Math.round(beat / 2);
      for (let k = 0; k < clickLen && h + k < n; k++)
        x[h + k] = 0.7 * Math.sin(2 * Math.PI * 1500 * (k / sr)) * Math.exp(-(k / sr) * 60);
    }
    const env = onsetEnvelope(x, sr);
    // With the prior pinned at 80, detection should land near 80, not 160.
    const withPrior = estimateTempo(env, 70, 180, 120, 80);
    expect(withPrior).toBeGreaterThanOrEqual(76);
    expect(withPrior).toBeLessThanOrEqual(84);
  });
});

describe("beatTimes", () => {
  it("tiles beats across the duration at ~60/bpm spacing", () => {
    const env = onsetEnvelope(clickTrack(120, 8), SR);
    const beats = beatTimes(env, 120, 8);
    // 120 BPM over 8 s ≈ 16 beats.
    expect(beats.length).toBeGreaterThanOrEqual(14);
    expect(beats.length).toBeLessThanOrEqual(18);
    // Spacing ≈ 0.5 s.
    expect(beats[1]! - beats[0]!).toBeCloseTo(0.5, 1);
  });

  it("returns no beats for a non-finite or absurd tempo", () => {
    const env = onsetEnvelope(clickTrack(120, 2), SR);
    expect(beatTimes(env, 0, 2)).toEqual([]);
    expect(beatTimes(env, Number.NaN, 2)).toEqual([]);
  });
});

describe("analyzeWaveform", () => {
  it("returns real duration, bpm, and beats together", () => {
    const a = analyzeWaveform(clickTrack(128, 6), SR);
    expect(a.durationSeconds).toBeCloseTo(6, 1);
    expect(a.bpm).toBeGreaterThanOrEqual(120);
    expect(a.bpm).toBeLessThanOrEqual(136);
    expect(a.beatTimes.length).toBeGreaterThan(8);
  });
});
