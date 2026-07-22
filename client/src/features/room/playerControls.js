import { playerVideoIdentity } from "./playerIdentity";

export function playbackVolume(playback) {
  const volume = playback?.volume;
  return Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 100;
}

export function playerCommandMatchesVideo(command, video) {
  if (command?.type === "volume") return true;
  if (!command?.queueId || !video?.queueId) return false;
  return String(command.queueId) === String(video.queueId);
}

export function playerPlaybackMatchesVideo(playback, video) {
  if (!playback || !video) return false;
  if (playback.queueId != null && video.queueId != null) {
    return String(playback.queueId) === String(video.queueId);
  }
  return Boolean(playback.videoId && video.id && playback.videoId === video.id);
}

export function loadPlayerVideo(player, video, playback, startSeconds = 0) {
  if (!player || !video?.id) return null;
  const videoRequest = { videoId: video.id, startSeconds };
  const shouldRemainPaused = playerPlaybackMatchesVideo(playback, video) &&
    ["paused", "cued"].includes(playback?.state);
  player.loadVideoById(videoRequest);
  player.setVolume?.(playbackVolume(playback));
  if (shouldRemainPaused) player.pauseVideo?.();
  else player.playVideo?.();
  return playerVideoIdentity(video);
}

export function reconcilePlayerIntent(player, video, desiredPlayback, stateCode, restorePaused = false) {
  if (!player) return false;
  player.setVolume?.(playbackVolume(desiredPlayback));
  const shouldRemainPaused = playerPlaybackMatchesVideo(desiredPlayback, video) &&
    ["paused", "cued"].includes(desiredPlayback?.state);
  if (!restorePaused || !shouldRemainPaused || ![1, 2, 3, 5].includes(stateCode)) return false;

  const target = desiredPlayback.positionSec;
  const current = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : null;
  const atTarget = !Number.isFinite(target) || (Number.isFinite(current) && Math.abs(current - target) <= 1);
  if (!atTarget) {
    player.seekTo?.(target, true);
  }
  player.pauseVideo?.();
  return stateCode === 2 && atTarget;
}

export function playerPlaybackSnapshot(player, video, desiredPlayback, preservePausedCheckpoint = false) {
  if (!player) return null;
  const stateCode = typeof player.getPlayerState === "function" ? player.getPlayerState() : -1;
  if (video && stateCode === -1) return null;

  const stateMap = {
    [-1]: "unstarted",
    0: "ended",
    1: "playing",
    2: "paused",
    3: "buffering",
    5: "cued",
  };
  const matchesDesiredVideo = playerPlaybackMatchesVideo(desiredPlayback, video);
  const preservingPausedCheckpoint = preservePausedCheckpoint && matchesDesiredVideo &&
    ["paused", "cued"].includes(desiredPlayback?.state) &&
    [1, 2, 3, 5].includes(stateCode);
  const reportedPosition = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0;
  const reportedDuration = typeof player.getDuration === "function" ? player.getDuration() : null;
  const desiredPosition = desiredPlayback?.positionSec;
  const positionSec = preservingPausedCheckpoint && Number.isFinite(desiredPosition) &&
    (!Number.isFinite(reportedPosition) || Math.abs(reportedPosition - desiredPosition) > 1)
      ? desiredPosition
      : reportedPosition;
  const durationSec = preservingPausedCheckpoint && !(reportedDuration > 0)
    ? desiredPlayback.durationSec
    : reportedDuration;
  const state = preservingPausedCheckpoint && [1, 3, 5].includes(stateCode)
    ? (desiredPlayback.state === "cued" ? "cued" : "paused")
    : (stateMap[stateCode] || "unstarted");

  return {
    state,
    positionSec: Number.isFinite(positionSec) ? positionSec : 0,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null,
  };
}

export function applyPlayerCommand(player, command) {
  if (!player || !command) return false;
  if (command.type === "play") player.playVideo?.();
  else if (command.type === "pause") player.pauseVideo?.();
  else if (command.type === "seek" && Number.isFinite(command.positionSec)) {
    player.seekTo?.(command.positionSec, true);
  } else if (command.type === "volume" && Number.isFinite(command.volume)) {
    player.setVolume?.(playbackVolume(command));
  } else return false;
  return true;
}
