export function clampPlaybackPosition(position, duration) {
  const safePosition = Number.isFinite(position) ? position : 0;
  const safeDuration = Number.isFinite(duration) && duration >= 0 ? duration : null;
  return safeDuration == null
    ? Math.max(0, safePosition)
    : Math.min(Math.max(0, safePosition), safeDuration);
}

export function isPlaybackActive(state) {
  return state === "playing" || state === "buffering";
}

export function parsePlaybackTimestamp(value) {
  const match = String(value ?? "").trim().match(
    /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?:\.(\d{1,3}))?$/
  );
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number((match[4] || "").padEnd(3, "0") || 0);
  return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
}

export function formatPlaybackTimestamp(value) {
  if (!Number.isFinite(value) || value < 0) return "00:00.000";
  const totalMilliseconds = Math.floor((value * 1000) + Number.EPSILON);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const clock = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  return hours > 0 ? `${hours.toString().padStart(2, "0")}:${clock}` : clock;
}
