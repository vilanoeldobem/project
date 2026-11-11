/**
 * Procedural game audio (spec §12): one AudioContext, everything synthesized — no recorded or licensed
 * tracks, nothing sent over the network. Starts only from an explicit gesture (the "Som" toggle).
 *
 * Graph: ambience bus (wind that follows the shared weather + occasional sleigh bells) and SFX bus
 * (footsteps per ground surface, gift chime, mission jingle) → master → gentle compressor → output.
 * Variation (pitch, filter, noise offset, timing) is randomised per hit so repeats never sound
 * identical; a voice cap keeps bursts from piling up.
 */
import type { Surface } from "@vila/shared/game/world";
import type { EnvironmentFrame } from "@vila/shared/environment/frame";

const BELL_NOTES = [1318.5, 1568.0, 1760.0, 1975.5]; // E6 G6 A6 B6
/** Gift found: rising C-major arpeggio (C6 E6 G6 C7). */
const CHIME_NOTES = [1046.5, 1318.5, 1568.0, 2093.0];
/** Mission complete: G5 C6 E6 G6 then a held C7 sparkle. */
const JINGLE_NOTES = [784.0, 1046.5, 1318.5, 1568.0];
const MAX_VOICES = 24;

interface StepVoice {
  /** Band-pass centre (Hz) and Q of the noise burst. */
  freq: number;
  q: number;
  /** Burst length (s) and peak gain. */
  len: number;
  gain: number;
  /** Optional low "thump" (Hz) for hard ground, optional squeak (Hz) for ice. */
  thump?: number;
  ring?: number;
}

const STEP: Record<Surface, StepVoice> = {
  snow: { freq: 1100, q: 0.7, len: 0.12, gain: 0.32 },
  packed: { freq: 1600, q: 0.9, len: 0.08, gain: 0.22 },
  stone: { freq: 2400, q: 1.4, len: 0.04, gain: 0.14, thump: 110 },
  ice: { freq: 3600, q: 2.2, len: 0.035, gain: 0.1, ring: 2300 },
};

const vary = (base: number, spread: number) => base * (1 + (Math.random() * 2 - 1) * spread);

export class GameAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private ambience: GainNode;
  private sfx: GainNode;
  private wind: GainNode;
  private band: BiquadFilterNode;
  private noise: AudioBuffer;
  private nextBell = 0;
  private voices = 0;

  constructor() {
    this.ctx = new AudioContext();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.master.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.8);
    this.ambience = this.gain(0.8, this.master);
    this.sfx = this.gain(0.9, this.master);

    // Shared noise buffers: brown (wind) and white (footsteps).
    const len = this.ctx.sampleRate * 3;
    const brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const white = this.noise.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    this.band = this.ctx.createBiquadFilter();
    this.band.type = "bandpass";
    this.band.frequency.value = 500;
    this.band.Q.value = 0.6;
    this.wind = this.gain(0, this.ambience);
    src.connect(this.band).connect(this.wind);
    src.start();
    this.nextBell = this.ctx.currentTime + 4;
  }

  private gain(value: number, to: AudioNode) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  }

  /** Reserves a voice for `seconds`; false when the cap is reached (the sound is skipped). */
  private voice(seconds: number) {
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    setTimeout(() => this.voices--, seconds * 1000 + 50);
    return true;
  }

  /** Follows the shared weather; called a few times per second. */
  update(f: EnvironmentFrame) {
    const t = this.ctx.currentTime;
    const w = f.weather.windStrength;
    // Gusts: slow wobble on top of the shared macro wind.
    const gust = 0.75 + 0.25 * Math.sin(t * 0.35) * Math.sin(t * 0.13 + 1);
    this.wind.gain.setTargetAtTime((0.04 + 0.22 * w + 0.05 * f.weather.snowfall) * gust, t, 0.6);
    this.band.frequency.setTargetAtTime(350 + 700 * w * gust, t, 0.8);
    if (t >= this.nextBell) {
      this.bells(0.025 + 0.03 * f.look.artificial, 4 + Math.floor(Math.random() * 4), BELL_NOTES, 0.09, this.ambience);
      // More frequent in the evening, when the village is lit.
      this.nextBell = t + (14 + Math.random() * 26) * (1.4 - 0.6 * f.look.artificial);
    }
  }

  /** One footstep; `run` 0..1 scales loudness, `left` pans it a touch. */
  footstep(surface: Surface, run: number, left: boolean) {
    const v = STEP[surface];
    if (!this.voice(v.len + 0.05)) return;
    const at = this.ctx.currentTime + 0.005;
    const level = v.gain * (0.45 + 0.55 * run) * vary(1, 0.15);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = left ? -0.12 : 0.12;
    pan.connect(this.sfx);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = vary(1, 0.12);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = vary(v.freq, 0.18);
    bp.Q.value = v.q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + v.len);
    src.connect(bp).connect(env).connect(pan);
    src.start(at, Math.random() * 0.8, v.len + 0.02);

    if (v.thump) this.tone("sine", vary(v.thump, 0.1), at, 0.05, level * 0.8, pan);
    if (v.ring) this.tone("sine", vary(v.ring, 0.05), at, 0.06, level * 0.35, pan);
  }

  /** Gift found. */
  chime() {
    if (!this.voice(0.9)) return;
    const at = this.ctx.currentTime + 0.02;
    CHIME_NOTES.forEach((f, i) => {
      this.tone("triangle", f, at + i * 0.07, 0.6, 0.07, this.sfx);
      this.tone("sine", f * 2, at + i * 0.07, 0.35, 0.02, this.sfx);
    });
  }

  /** Mission complete: short ascending bell phrase and a sparkle tail. */
  jingle() {
    if (!this.voice(1.6)) return;
    const at = this.ctx.currentTime + 0.25; // lands after the gift chime when both fire together
    JINGLE_NOTES.forEach((f, i) => this.tone("triangle", f, at + i * 0.11, 0.7, 0.08, this.sfx));
    this.bells(0.035, 6, BELL_NOTES.map((n) => n * 1.5), 0.06, this.sfx, at + 0.45);
  }

  private tone(type: OscillatorType, freq: number, at: number, len: number, level: number, to: AudioNode) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g).connect(to);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  private bells(volume: number, n: number, notes: number[], spacing: number, to: AudioNode, start = this.ctx.currentTime + 0.05) {
    for (let i = 0; i < n; i++) {
      const at = start + i * (spacing + Math.random() * 0.05);
      const f = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.3 ? 2 : 1);
      this.tone("triangle", f, at, 0.5, volume, to);
    }
  }

  close() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.2);
    setTimeout(() => void this.ctx.close(), 600);
  }
}
