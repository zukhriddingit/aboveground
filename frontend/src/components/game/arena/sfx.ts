// Small synthesized sound effects for the mini-games (no audio files): relay clicks, breaker clunks,
// an error buzz, arc crackle, a success chime, and looping hiss for torches, grinders and air.
// Browsers only start audio after a tap, so the first sound waits for the player's first input.
const KEY = "tverse-sfx";
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = typeof window !== "undefined" && window.localStorage?.getItem(KEY) === "off";
const listeners = new Set<() => void>();

function audio() {
  if (muted || typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    window.localStorage.setItem(KEY, on ? "off" : "on");
  } catch {
    // storage blocked: the choice lasts for this visit
  }
  if (on) void ctx?.suspend();
  listeners.forEach((l) => l());
}

export function subscribeMuted(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function env(a: AudioContext, peak: number, attack: number, decay: number) {
  const g = a.createGain();
  const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(a.destination);
  return g;
}

function burst(a: AudioContext, filter: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(a, peak, 0.002, decay));
  src.start();
  src.stop(a.currentTime + decay + 0.05);
}

function tone(a: AudioContext, type: OscillatorType, freq: number, peak: number, decay: number, delay = 0, to?: number) {
  const o = a.createOscillator();
  o.type = type;
  const t = a.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + decay + 0.05);
}

export const sfx = {
  /** A relay armature picking up, a nut seating: a short bright tick. */
  click() {
    const a = audio();
    if (!a) return;
    burst(a, "highpass", 2400, 0.7, 0.35, 0.05);
    tone(a, "triangle", 1800, 0.08, 0.04);
  },
  /** Something heavy latching: a breaker closing, couplers meeting. */
  clunk() {
    const a = audio();
    if (!a) return;
    tone(a, "sine", 120, 0.5, 0.25, 0, 55);
    burst(a, "lowpass", 900, 0.8, 0.4, 0.12);
  },
  /** Wrong move. */
  buzz() {
    const a = audio();
    if (!a) return;
    tone(a, "square", 98, 0.12, 0.28);
    tone(a, "square", 104, 0.08, 0.28);
  },
  /** An electrical arc. */
  zap() {
    const a = audio();
    if (!a) return;
    for (let k = 0; k < 4; k++) setTimeout(() => audio() && burst(audio()!, "bandpass", 3000 + Math.random() * 2500, 2, 0.35, 0.06), k * 45);
  },
  /** Step done. */
  good() {
    const a = audio();
    if (!a) return;
    tone(a, "sine", 784, 0.12, 0.25);
    tone(a, "sine", 1175, 0.1, 0.35, 0.09);
  },
  /** Repair finished. */
  success() {
    const a = audio();
    if (!a) return;
    tone(a, "sine", 523, 0.14, 0.5);
    tone(a, "sine", 659, 0.12, 0.5, 0.12);
    tone(a, "sine", 988, 0.12, 0.8, 0.24);
  },
};

/** A looping noise bed (torch roar, grinder, air) whose level follows `set`. */
export function noiseLoop(kind: "torch" | "grinder" | "air") {
  let src: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let osc: OscillatorNode | null = null;
  const start = () => {
    const a = audio();
    if (!a || src) return;
    src = a.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = a.createBiquadFilter();
    f.type = kind === "air" ? "highpass" : "bandpass";
    f.frequency.value = kind === "torch" ? 700 : kind === "grinder" ? 3200 : 2500;
    f.Q.value = kind === "grinder" ? 3 : 0.6;
    gain = a.createGain();
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(a.destination);
    if (kind === "grinder") {
      osc = a.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 420;
      const og = a.createGain();
      og.gain.value = 0.25;
      osc.connect(og).connect(gain);
      osc.start();
    }
    src.start();
  };
  return {
    set(level: number) {
      if (level > 0) start();
      if (gain && ctx) gain.gain.setTargetAtTime(Math.max(0, level) * (kind === "air" ? 0.12 : 0.2), ctx.currentTime, 0.04);
    },
    stop() {
      src?.stop();
      osc?.stop();
      src = null;
      osc = null;
      gain = null;
    },
  };
}
