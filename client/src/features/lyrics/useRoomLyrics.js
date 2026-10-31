import { useCallback, useEffect, useRef, useState } from "react";

// Lyrics state and document for the room's current video.
//
// The server pushes small `lyrics-updated` states (source, offset, status,
// revision) to every member. The text itself is only requested when this
// member wants it and its revision or reading mode differs from what is held,
// so offset nudges never re-download the lyrics. Membership is (re)established
// with each room-state event, which is also when state is re-requested after
// a reconnect.

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_RETRIES = 3;

export default function useRoomLyrics({ socket, roomId, queueId, wantDocument, readingMode = "romaji" }) {
  const [state, setState] = useState(null);
  const [document, setDocument] = useState(null);
  const [documentKey, setDocumentKey] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const queueIdRef = useRef(queueId);
  const stateRequestRef = useRef(0);
  const documentRequestRef = useRef(0);
  queueIdRef.current = queueId;
  // A member that always wants the text (a phone's Lyrics tab) asks the server
  // to look the song up; the room display's lookups follow the room setting.
  const lookupRef = useRef(wantDocument === true);
  lookupRef.current = wantDocument === true;

  const acceptState = useCallback((next) => {
    if (!next) return;
    // Ignore news about a different video until this member has caught up.
    if (String(next.queueId ?? "") !== String(queueIdRef.current ?? "")) return;
    setState(next);
  }, []);

  const refreshState = useCallback(() => {
    if (!socket?.connected || !roomId) return;
    const requestId = ++stateRequestRef.current;
    socket.timeout(REQUEST_TIMEOUT_MS).emit("lyrics-get", {
      roomId, queueId: queueIdRef.current, lookup: lookupRef.current,
    }, (timeoutError, response) => {
      if (requestId !== stateRequestRef.current) return;
      if (timeoutError || !response?.ok) {
        // Not joined yet: the room-state event that follows joining retries.
        if (response?.error?.code !== "not_joined") setError(response?.error?.message || "Lyrics are unavailable right now.");
        return;
      }
      setError(null);
      acceptState(response.state);
    });
  }, [socket, roomId, acceptState]);

  // A new video: forget the old one's lyrics at once, then ask about this one.
  useEffect(() => {
    setState(null);
    setDocument(null);
    setDocumentKey(null);
    setError(null);
    refreshState();
  }, [queueId, refreshState]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleUpdate = (update) => acceptState(update);
    const handleRoomState = () => refreshState();
    socket.on("lyrics-updated", handleUpdate);
    socket.on("room-state", handleRoomState);
    socket.on("room-state-admin", handleRoomState);
    socket.on("connect", handleRoomState);
    return () => {
      socket.off("lyrics-updated", handleUpdate);
      socket.off("room-state", handleRoomState);
      socket.off("room-state-admin", handleRoomState);
      socket.off("connect", handleRoomState);
    };
  }, [socket, acceptState, refreshState]);

  const revision = state?.revision ?? null;
  // "display": only when the room display shows lyrics for this song.
  const wanted = wantDocument === "display" ? Boolean(state?.display) : Boolean(wantDocument);
  const wantedKey = wanted && state?.status === "ready" && revision ? `${revision}|${readingMode}` : null;

  useEffect(() => setAttempt(0), [wantedKey]);

  useEffect(() => {
    if (!wantedKey || wantedKey === documentKey || !socket?.connected) return undefined;
    let retryTimer = null;
    const requestId = ++documentRequestRef.current;
    socket.timeout(REQUEST_TIMEOUT_MS).emit("lyrics-get", {
      roomId, queueId: queueIdRef.current, readingMode, includeDocument: true,
    }, (timeoutError, response) => {
      if (requestId !== documentRequestRef.current) return;
      if (timeoutError || !response?.ok) {
        setError(response?.error?.message || "The lyrics could not be loaded.");
        if (attempt < MAX_DOCUMENT_RETRIES) retryTimer = setTimeout(() => setAttempt((value) => value + 1), 2000 * (attempt + 1));
        return;
      }
      setError(null);
      acceptState(response.state);
      if (response.document && response.document.revision === response.state?.revision) {
        setDocument(response.document);
        setDocumentKey(`${response.document.revision}|${readingMode}`);
      }
    });
    return () => clearTimeout(retryTimer);
  }, [wantedKey, documentKey, socket, roomId, readingMode, acceptState, attempt]);

  // Never pair a state with the text of another source or song.
  const current = document && revision && document.revision === revision ? document : null;
  return { state, document: current, error, refresh: refreshState };
}
