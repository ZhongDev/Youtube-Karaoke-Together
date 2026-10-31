// Where the room player is right now, as seen from a controller.
//
// The room reports its position with `sampledAt`, the server-clock time at
// which that position was true. Every controller converts its own clock to the
// server's (serverClock.js), so all of them extrapolate the same position no
// matter how long each message took to arrive.

/** Extrapolate at most this far: older samples mean the room went quiet. */
export const MAX_EXTRAPOLATION_MS = 5000;

export function estimatePlaybackMs(playback, serverNowMs) {
  if (!playback || !Number.isFinite(playback.positionSec)) return null;
  const baseMs = playback.positionSec * 1000;
  if (playback.state !== "playing") return baseMs;
  const sampledAt = Number.isFinite(playback.sampledAt) ? playback.sampledAt : playback.updatedAt;
  if (!Number.isFinite(sampledAt)) return baseMs;
  const elapsed = Math.min(Math.max(0, serverNowMs - sampledAt), MAX_EXTRAPOLATION_MS);
  const rate = Number.isFinite(playback.playbackRate) && playback.playbackRate > 0 ? playback.playbackRate : 1;
  const estimate = baseMs + elapsed * rate;
  const durationMs = Number.isFinite(playback.durationSec) ? playback.durationSec * 1000 : Infinity;
  return Math.min(estimate, durationMs);
}

/**
 * Lyric time for a playback time. A positive offset delays the lyrics: with
 * +500 ms a line stamped 10.0 s is shown when the video reaches 10.5 s.
 */
export function lyricTimeMs(playbackMs, offsetMs) {
  return playbackMs - (Number.isFinite(offsetMs) ? offsetMs : 0);
}
