import React, { useEffect, useMemo, useRef, useState } from "react";
import TwoTrackLyrics from "./TwoTrackLyrics";
import { timedLines } from "./lyricsDocument";
import { lyricTimeMs } from "./playbackEstimate";
import "./lyrics.css";

const STATUS_VISIBLE_MS = 6000;

function statusMessage(state, document) {
  if (!state?.display) return null;
  if (state.status === "loading") return "Finding lyrics…";
  if (state.status === "none" || state.status === "error") return "No lyrics found for this song";
  if (document && !document.synced) return "These lyrics aren't time-synced. Read them in the controller's Lyrics tab";
  return null;
}

/**
 * Lyrics over the room's video. Purely visual: it is aria-hidden and passes
 * every pointer and touch event through to the player.
 *
 * @param getPlaybackMs returns the player's smoothed position in milliseconds
 */
export default function LyricsOverlay({ state, document, getPlaybackMs }) {
  const offsetRef = useRef(state?.offsetMs ?? 0);
  offsetRef.current = state?.offsetMs ?? 0;
  const getPlaybackRef = useRef(getPlaybackMs);
  getPlaybackRef.current = getPlaybackMs;
  const lines = useMemo(() => timedLines(document), [document]);
  const rubyLines = useMemo(() => {
    if (!document?.synced || document.readingMode === "none") return null;
    return document.lines.some((line) => line.ruby) ? document.lines.map((line) => line.ruby || [{ base: line.text }]) : null;
  }, [document]);
  const getTimeMs = useMemo(() => () => lyricTimeMs(getPlaybackRef.current(), offsetRef.current), []);

  const message = statusMessage(state, document);
  const [statusVisible, setStatusVisible] = useState(Boolean(message));
  useEffect(() => {
    setStatusVisible(Boolean(message));
    if (!message || message === "Finding lyrics…") return undefined;
    const timer = setTimeout(() => setStatusVisible(false), STATUS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, state?.queueId]);

  if (!state?.display) return null;
  return (
    <div className="ytkt-lyrics-overlay" aria-hidden="true" data-testid="lyrics-overlay">
      {lines.length > 0 && <TwoTrackLyrics lines={lines} rubyLines={rubyLines} getTimeMs={getTimeMs} />}
      {message && <div className="ytkt-lyrics-status" style={{ opacity: statusVisible ? 1 : 0 }}>{message}</div>}
    </div>
  );
}
