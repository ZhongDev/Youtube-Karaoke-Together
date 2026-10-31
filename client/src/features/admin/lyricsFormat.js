import { decodeHtmlEntities } from "../../config";

/** The YouTube title when its snapshot is held, else the provider's match, else the video ID. */
export function songTitle(song) {
  if (song.title) return decodeHtmlEntities(song.title);
  const provider = song.sources?.find((source) => source.providerTrack);
  if (provider) return [provider.providerArtist, provider.providerTrack].filter(Boolean).join(" – ");
  return song.videoId;
}

export function formatOffset(value) {
  return `${value > 0 ? "+" : ""}${value || 0} ms`;
}

export { KIND_LABELS } from "../lyrics/lyricsDocument";
