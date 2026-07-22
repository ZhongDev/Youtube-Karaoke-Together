export function playerVideoIdentity(video) {
  if (!video?.id) return null;
  return video.queueId == null ? `video:${video.id}` : `queue:${video.queueId}`;
}

export function shouldLoadPlayerVideo(loadedIdentity, video) {
  const nextIdentity = playerVideoIdentity(video);
  return Boolean(nextIdentity && nextIdentity !== loadedIdentity);
}

export function playerResumeSeconds(playback, video) {
  if (!playback || !video) return 0;
  if (playback.queueId && String(playback.queueId) !== String(video.queueId)) return 0;
  if (playback.videoId && playback.videoId !== video.id) return 0;
  const position = typeof playback.positionSec === "number" ? playback.positionSec : 0;
  const duration = typeof playback.durationSec === "number" ? playback.durationSec : null;
  return duration == null
    ? Math.max(0, position)
    : Math.min(Math.max(0, position), Math.max(0, duration - 0.75));
}
