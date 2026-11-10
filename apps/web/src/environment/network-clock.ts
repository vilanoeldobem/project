/**
 * Server-anchored monotonic clock (spec §4.5, §15.2). `now()` never reads the OS wall clock after the
 * first sync, so changing the computer's clock does not move the world. RTT/2 is an approximation
 * (assumes symmetric latency); the lowest-RTT recent samples are trusted most.
 */

export interface ClockSample {
  rttMs: number;
  offsetMs: number;
}

export interface ClockStatus {
  synced: boolean;
  rttMs: number | null;
  /** Estimated server − local wall clock difference (diagnostics only). */
  offsetMs: number | null;
  lastSyncMono: number | null;
}

type Mono = () => number;

/** Max accepted RTT; noisier samples are discarded (spec §4.5 step 7). */
export const MAX_RTT_MS = 5000;
/** Below this error the clock slews (gradual, monotonic); above it, it jumps. */
export const SLEW_THRESHOLD_MS = 2000;
/** Slew rate: at most 10% faster/slower than real time while correcting. */
const SLEW_RATE = 0.1;
const WINDOW = 8;

export class NetworkClock {
  private anchorEpochMs: number;
  private anchorMonoMs: number;
  /** Pending correction still to be slewed in (ms). */
  private pendingMs = 0;
  private pendingFromMono = 0;
  private samples: ClockSample[] = [];
  private status: ClockStatus = { synced: false, rttMs: null, offsetMs: null, lastSyncMono: null };

  constructor(private readonly mono: Mono = () => performance.now(), wallNow = Date.now()) {
    this.anchorEpochMs = wallNow;
    this.anchorMonoMs = mono();
  }

  private applied(monoMs: number): number {
    if (this.pendingMs === 0) return 0;
    const budget = (monoMs - this.pendingFromMono) * SLEW_RATE;
    return Math.sign(this.pendingMs) * Math.min(Math.abs(this.pendingMs), Math.max(0, budget));
  }

  now(): number {
    const m = this.mono();
    return this.anchorEpochMs + (m - this.anchorMonoMs) + this.applied(m);
  }

  getStatus(): ClockStatus {
    return this.status;
  }

  /**
   * Feeds one request/response sample. `serverTimeMs` = server Date.now() when it answered;
   * sent/received are mono timestamps around the request.
   */
  update(serverTimeMs: number, sentMono: number, receivedMono: number): ClockSample | null {
    const rttMs = receivedMono - sentMono;
    if (!Number.isFinite(serverTimeMs) || !Number.isFinite(rttMs) || rttMs < 0 || rttMs > MAX_RTT_MS) return null;
    const estimatedNow = serverTimeMs + rttMs / 2;
    const sample: ClockSample = { rttMs, offsetMs: estimatedNow - receivedMono };
    // Best = lowest RTT in the window (least asymmetric-latency error); ties go to the newest.
    // A sample that disagrees with the window by more than the slew threshold means the server clock
    // (or this device's monotonic clock) really moved: restart the window from it.
    const prevBest = this.samples.reduce<ClockSample | null>((a, b) => (!a || b.rttMs <= a.rttMs ? b : a), null);
    const disagrees = prevBest && Math.abs(prevBest.offsetMs - sample.offsetMs) > SLEW_THRESHOLD_MS + rttMs;
    this.samples = disagrees ? [sample] : [...this.samples, sample].slice(-WINDOW);
    const best = this.samples.reduce((a, b) => (b.rttMs <= a.rttMs ? b : a));
    const target = best.offsetMs + receivedMono; // server time "now" per best sample
    const current = this.anchorEpochMs + (receivedMono - this.anchorMonoMs) + this.applied(receivedMono);
    const error = target - current;

    if (!this.status.synced || Math.abs(error) > SLEW_THRESHOLD_MS) {
      this.anchorEpochMs = target;
      this.anchorMonoMs = receivedMono;
      this.pendingMs = 0;
    } else {
      // Fold what was already slewed into the anchor, then slew the remaining error.
      this.anchorEpochMs = current;
      this.anchorMonoMs = receivedMono;
      this.pendingMs = error;
      this.pendingFromMono = receivedMono;
    }
    this.status = { synced: true, rttMs: best.rttMs, offsetMs: target - Date.now(), lastSyncMono: receivedMono };
    return sample;
  }
}
