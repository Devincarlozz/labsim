import {
  OscillatorSettings,
  FunctionGeneratorSettings,
  ClockSettings,
  WaveformType,
} from '../model/types';

// ─── Waveform Generation ─────────────────────────────────────────────────────

export function generateSineWave(
  frequency: number,
  amplitude: number,
  sampleRate: number,
  numSamples: number,
  dcOffset = 0,
  startTime = 0,
): Float32Array {
  const samples = new Float32Array(numSamples);
  const dt = 1 / sampleRate;
  for (let i = 0; i < numSamples; i++) {
    const t = startTime + i * dt;
    samples[i] = dcOffset + amplitude * Math.sin(2 * Math.PI * frequency * t);
  }
  return samples;
}

export function generateSquareWave(
  frequency: number,
  amplitude: number,
  sampleRate: number,
  numSamples: number,
  dcOffset = 0,
  dutyCycle = 0.5,
  startTime = 0,
): Float32Array {
  const samples = new Float32Array(numSamples);
  const dt = 1 / sampleRate;
  const period = 1 / frequency;
  for (let i = 0; i < numSamples; i++) {
    const t = startTime + i * dt;
    const phase = ((t % period) + period) % period;
    samples[i] = dcOffset + (phase < period * dutyCycle ? amplitude : -amplitude);
  }
  return samples;
}

export function generateTriangleWave(
  frequency: number,
  amplitude: number,
  sampleRate: number,
  numSamples: number,
  dcOffset = 0,
  startTime = 0,
): Float32Array {
  const samples = new Float32Array(numSamples);
  const dt = 1 / sampleRate;
  const period = 1 / frequency;
  for (let i = 0; i < numSamples; i++) {
    const t = startTime + i * dt;
    const phase = ((t % period) + period) % period;
    const normalized = phase / period;
    // Triangle: 0→1 in first half, 1→-1 in second half (linearly)
    let value: number;
    if (normalized < 0.25) {
      value = normalized * 4;
    } else if (normalized < 0.75) {
      value = 2 - normalized * 4;
    } else {
      value = normalized * 4 - 4;
    }
    samples[i] = dcOffset + amplitude * value;
  }
  return samples;
}

// ─── Waveform dispatch ───────────────────────────────────────────────────────

export function generateWaveform(
  waveformType: WaveformType,
  frequency: number,
  amplitude: number,
  sampleRate: number,
  numSamples: number,
  dcOffset = 0,
  dutyCycle = 0.5,
  startTime = 0,
): Float32Array {
  switch (waveformType) {
    case 'sine':
      return generateSineWave(frequency, amplitude, sampleRate, numSamples, dcOffset, startTime);
    case 'square':
      return generateSquareWave(frequency, amplitude, sampleRate, numSamples, dcOffset, dutyCycle, startTime);
    case 'triangle':
      return generateTriangleWave(frequency, amplitude, sampleRate, numSamples, dcOffset, startTime);
  }
}

// ─── Instrument Signal Generation ────────────────────────────────────────────

const DISPLAY_SAMPLE_RATE = 1000; // Samples for display
const DISPLAY_SAMPLES = 512;

export function getOscillatorSamples(
  settings: OscillatorSettings,
  time: number,
): Float32Array {
  if (!settings.enabled) return new Float32Array(DISPLAY_SAMPLES);
  return generateSineWave(
    settings.frequency,
    settings.amplitude,
    DISPLAY_SAMPLE_RATE,
    DISPLAY_SAMPLES,
    0,
    time,
  );
}

export function getFunctionGeneratorSamples(
  settings: FunctionGeneratorSettings,
  time: number,
): Float32Array {
  if (!settings.enabled) return new Float32Array(DISPLAY_SAMPLES);
  return generateWaveform(
    settings.waveform,
    settings.frequency,
    settings.amplitude,
    DISPLAY_SAMPLE_RATE,
    DISPLAY_SAMPLES,
    settings.dcOffset,
    0.5,
    time,
  );
}

export function getClockSamples(
  settings: ClockSettings,
  time: number,
): Float32Array {
  if (!settings.running) return new Float32Array(DISPLAY_SAMPLES);
  return generateSquareWave(
    settings.frequency,
    1, // Clock is always 0/1
    DISPLAY_SAMPLE_RATE,
    DISPLAY_SAMPLES,
    0,
    settings.dutyCycle,
    time,
  );
}

// ─── Readout Helpers ─────────────────────────────────────────────────────────

export function formatFrequency(hz: number): string {
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
  return `${hz.toFixed(2)} Hz`;
}

export function formatPeriod(hz: number): string {
  const period = 1 / hz;
  if (period >= 1) return `${period.toFixed(3)} s`;
  if (period >= 1e-3) return `${(period * 1e3).toFixed(3)} ms`;
  if (period >= 1e-6) return `${(period * 1e6).toFixed(3)} µs`;
  return `${(period * 1e9).toFixed(3)} ns`;
}

export function formatAmplitude(v: number): string {
  if (Math.abs(v) >= 1) return `${v.toFixed(2)} V`;
  return `${(v * 1000).toFixed(1)} mV`;
}
