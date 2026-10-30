// Smooth playback clock for the room's YouTube player.
//
// player.getCurrentTime() returns the last time the embedded player reported,
// which only changes every ~250 ms. Reading it every animation frame and
// treating it as "now" makes a lyric wipe stutter and lag. Instead, the clock
// anchors to the moment a reported value *changes* (that is when it was true)
// and extrapolates from there at the playback rate. Polls that repeat the same
// value change nothing. Ported from ZhongDev/Youtube-Karaoke-App
// (src/shared/syncClock.ts) and made edge-triggered.
//
// Wall times (performance.now()) are passed in, never read here, so the logic
// is pure and testable with fake times.

export const SEEK_THRESHOLD_S = 0.35;
/** A playing value older than this is a stall, not a measurement: report it as fresh. */
const MAX_SAMPLE_AGE_MS = 1000;

export class SyncClock {
  constructor() {
    this.reset();
  }

  reset() {
    this.anchorS = 0;
    this.anchorWallMs = null;
    this.lastRawS = null;
    this.rate = 1;
    this.playing = false;
  }

  /** Feed one getCurrentTime() reading. Returns true when it looks like a seek. */
  poll(rawS, wallMs, rate = 1, playing = false) {
    const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    const changed = this.anchorWallMs === null || rawS !== this.lastRawS ||
      playing !== this.playing || safeRate !== this.rate;
    let seeked = false;
    if (changed) {
      if (this.anchorWallMs !== null) seeked = Math.abs(rawS - this.timeS(wallMs)) > SEEK_THRESHOLD_S;
      this.anchorS = rawS;
      this.anchorWallMs = wallMs;
    }
    this.lastRawS = rawS;
    this.rate = safeRate;
    this.playing = playing;
    return seeked;
  }

  /** Estimated playback position in seconds at the given wall time. */
  timeS(wallMs) {
    if (this.anchorWallMs === null) return 0;
    if (!this.playing) return this.anchorS;
    return this.anchorS + ((wallMs - this.anchorWallMs) / 1000) * this.rate;
  }

  /**
   * How long ago the last reported value became current. A reported position
   * stamped `now − age` describes the player more precisely than one stamped
   * with the moment it happened to be read.
   */
  sampleAgeMs(wallMs) {
    if (this.anchorWallMs === null || !this.playing) return 0;
    const age = wallMs - this.anchorWallMs;
    return age >= 0 && age <= MAX_SAMPLE_AGE_MS ? age : 0;
  }
}
