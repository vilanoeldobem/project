/**
 * Procedural ambience (spec §12): wind noise that follows the shared weather and soft synthesized
 * sleigh bells now and then. No recorded or licensed tracks; nothing is sent over the network.
 * Starts only from an explicit gesture (the "Som ambiente" toggle) and never loops music.
 */
import type { EnvironmentFrame } from "./frame";

const BELL_NOTES = [1318.5, 1568.0, 1760.0, 1975.5]; // E6 G6 A6 B6

export class Ambience {
  private ctx: AudioContext;
  private master: GainNode;
  private wind: GainNode;
  private band: BiquadFilterNode;
  private nextBell = 0;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.master.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.8);

    const len = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.band = this.ctx.createBiquadFilter();
    this.band.type = "bandpass";
    this.band.frequency.value = 500;
    this.band.Q.value = 0.6;
    this.wind = this.ctx.createGain();
    this.wind.gain.value = 0;
    src.connect(this.band).connect(this.wind).connect(this.master);
    src.start();
    this.nextBell = this.ctx.currentTime + 4;
  }

  update(f: EnvironmentFrame) {
    const t = this.ctx.currentTime;
    const w = f.weather.windStrength;
    // Gusts: slow wobble on top of the shared macro wind.
    const gust = 0.75 + 0.25 * Math.sin(t * 0.35) * Math.sin(t * 0.13 + 1);
    this.wind.gain.setTargetAtTime((0.04 + 0.22 * w + 0.05 * f.weather.snowfall) * gust, t, 0.6);
    this.band.frequency.setTargetAtTime(350 + 700 * w * gust, t, 0.8);
    if (t >= this.nextBell) {
      this.jingle(0.025 + 0.03 * f.look.artificial);
      // More frequent in the evening, when the village is lit.
      this.nextBell = t + (14 + Math.random() * 26) * (1.4 - 0.6 * f.look.artificial);
    }
  }

  private jingle(volume: number) {
    const start = this.ctx.currentTime + 0.05;
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = start + i * (0.09 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)] * (Math.random() < 0.3 ? 2 : 1);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(volume, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(g).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.55);
    }
  }

  close() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.2);
    setTimeout(() => void this.ctx.close(), 600);
  }
}
