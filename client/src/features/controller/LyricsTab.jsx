import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { ManageSearch } from "@mui/icons-material";
import { STORAGE_KEYS, decodeHtmlEntities } from "../../config";
import LineLyrics from "../lyrics/LineLyrics";
import LyricsBoundary from "../lyrics/LyricsBoundary";
import { SOURCE_LABELS, SOURCE_ORDER } from "../lyrics/lyricsDocument";
import { estimatePlaybackMs, lyricTimeMs } from "../lyrics/playbackEstimate";
import { serverClockStats, serverNow, subscribeServerClock } from "../lyrics/serverClock";
import useRoomLyrics from "../lyrics/useRoomLyrics";
import { CONTROLLER_NAV_HEIGHT } from "./ControllerNavigation";
import LyricsMatchDialog from "./LyricsMatchDialog";

// Mirrors the room display on a phone: the same song, source, offset, and
// clock, read line by line. Source and offset changes here apply to the whole
// room for the current song.

const MAX_OFFSET_MS = 30_000;
/** Ignore server offsets that disagree with a tap this recent; they are acknowledgements catching up. */
const PENDING_OFFSET_MS = 1500;
const CJK = new Set(["ja", "ko", "zh"]);

function readBool(key, fallback) {
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
}

function formatOffset(value) {
  return `${value > 0 ? "+" : ""}${value} ms`;
}

const STATUS_COPY = {
  idle: "Finding lyrics…",
  loading: "Finding lyrics…",
  none: "No lyrics were found for this song. Try searching with different words, or an administrator can add them.",
  error: "The lyrics services could not be reached. They will be tried again shortly.",
};

const LyricsTab = ({
  roomId,
  controllerKey,
  socket,
  isConnected,
  currentVideo,
  playback,
  settings,
  lyricsPreference,
  onLyricsPreferenceChange,
  notify,
}) => {
  const [syncedView, setSyncedView] = useState(() => readBool(STORAGE_KEYS.LYRICS_SYNCED_VIEW, true));
  const [showReading, setShowReading] = useState(() => localStorage.getItem(STORAGE_KEYS.LYRICS_READING) !== "none");
  const [offsetDraft, setOffsetDraft] = useState("0");
  const [offset, setOffset] = useState(0);
  const [editingOffset, setEditingOffset] = useState(false);
  const [clockStats, setClockStats] = useState(serverClockStats);
  const [matchOpen, setMatchOpen] = useState(false);
  const pendingOffsetRef = useRef(null);
  const offsetRef = useRef(0);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  offsetRef.current = offset;

  const { state, document, error } = useRoomLyrics({
    socket,
    roomId,
    queueId: currentVideo?.queueId ?? null,
    wantDocument: true,
    readingMode: showReading ? "romaji" : "none",
  });

  useEffect(() => subscribeServerClock(setClockStats), []);

  // Adopt the room's offset unless it is an acknowledgement still catching up
  // with taps made here, or the reader is typing a value.
  useEffect(() => {
    if (!Number.isFinite(state?.offsetMs)) return;
    const pending = pendingOffsetRef.current;
    if (pending && pending.value !== state.offsetMs && Date.now() - pending.at < PENDING_OFFSET_MS) return;
    pendingOffsetRef.current = null;
    setOffset(state.offsetMs);
    if (!editingOffset) setOffsetDraft(String(state.offsetMs));
  }, [state?.offsetMs, state?.queueId, editingOffset]);

  const canChange = Boolean(isConnected && controllerKey && socket && currentVideo && state?.status === "ready");

  const sendLyricsChange = useCallback((change) => {
    if (!canChange) return;
    socket.timeout(10_000).emit("lyrics-set", {
      roomId,
      controllerKey,
      expectedQueueId: currentVideo.queueId,
      ...change,
    }, (timeoutError, response) => {
      if (timeoutError || !response?.ok) {
        pendingOffsetRef.current = null;
        notify(response?.error?.message || "The lyrics change timed out.", "error");
      }
    });
  }, [canChange, socket, roomId, controllerKey, currentVideo?.queueId, notify]);

  const applyOffset = (value) => {
    const next = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, Math.round(value)));
    pendingOffsetRef.current = { value: next, at: Date.now() };
    setOffset(next);
    setOffsetDraft(String(next));
    sendLyricsChange({ offsetMs: next });
  };

  const submitOffsetDraft = () => {
    setEditingOffset(false);
    const value = Number(offsetDraft.trim());
    if (!/^[+-]?\d+$/.test(offsetDraft.trim()) || !Number.isFinite(value)) {
      setOffsetDraft(String(offset));
      notify("Enter the offset as a whole number of milliseconds.", "error");
      return;
    }
    if (value !== offset) applyOffset(value);
  };

  const getTimeMs = useCallback(() => {
    const playbackMs = estimatePlaybackMs(playbackRef.current, serverNow());
    return playbackMs === null ? NaN : lyricTimeMs(playbackMs, offsetRef.current);
  }, []);

  const toggleSyncedView = (enabled) => {
    setSyncedView(enabled);
    localStorage.setItem(STORAGE_KEYS.LYRICS_SYNCED_VIEW, String(enabled));
  };

  const toggleReading = (enabled) => {
    setShowReading(enabled);
    localStorage.setItem(STORAGE_KEYS.LYRICS_READING, enabled ? "romaji" : "none");
  };

  const available = new Set((state?.sources || []).map((source) => source.id));
  const roomLatency = Number.isFinite(playback?.roomLatencyMs) ? playback.roomLatencyMs : null;
  const ownLatency = Number.isFinite(clockStats.rttMs) ? Math.round(clockStats.rttMs / 2) : null;

  return (
    // Pinned between the top of the screen and the fixed bottom navigation, so
    // the lyrics box always ends where the navigation starts: viewport-unit
    // heights are missing or wrong in some mobile and in-app browsers.
    <Box sx={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: CONTROLLER_NAV_HEIGHT,
      maxWidth: 720, mx: "auto", width: "100%", display: "flex", flexDirection: "column", p: { xs: 1, sm: 2 }, gap: 1,
    }}>
      <Paper sx={{ p: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: currentVideo ? 1 : 0 }}>
          <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentVideo ? decodeHtmlEntities(currentVideo.title) : "Lyrics"}
          </Typography>
          {!isConnected && <Chip label="Disconnected" size="small" color="error" />}
          {state?.display && <Chip label="On room screen" size="small" color="secondary" variant="outlined" />}
          {currentVideo && (
            <Button size="small" startIcon={<ManageSearch />} onClick={() => setMatchOpen(true)} aria-label="Lyrics match details" sx={{ flexShrink: 0, textTransform: "none" }}>
              Match
            </Button>
          )}
        </Box>

        {currentVideo && state?.status === "ready" && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={state.source}
                aria-label="Lyrics source"
                onChange={(event, source) => { if (source && source !== state.source) sendLyricsChange({ source }); }}
              >
                {SOURCE_ORDER.map((source) => (
                  <ToggleButton key={source} value={source} disabled={!available.has(source) || !canChange} aria-label={`${SOURCE_LABELS[source]} lyrics`} sx={{ px: 1.25, py: 0.25, textTransform: "none" }}>
                    {SOURCE_LABELS[source]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {state.sourceOverridden && (
                <Button size="small" onClick={() => sendLyricsChange({ source: null })} disabled={!canChange}>Use default</Button>
              )}
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", alignItems: "center", gap: 0.5 }}>
              <Button size="small" variant="outlined" aria-label="Lyrics 500 ms earlier" onClick={() => applyOffset(offset - 500)} disabled={!canChange} sx={{ minWidth: 0, px: 1 }}>−500</Button>
              <Button size="small" variant="outlined" aria-label="Lyrics 100 ms earlier" onClick={() => applyOffset(offset - 100)} disabled={!canChange} sx={{ minWidth: 0, px: 1 }}>−100</Button>
              <TextField
                size="small"
                label="Offset (ms)"
                value={offsetDraft}
                disabled={!canChange}
                onFocus={() => setEditingOffset(true)}
                onChange={(event) => setOffsetDraft(event.target.value)}
                onBlur={submitOffsetDraft}
                // TextField puts this handler on its wrapper; blur the input itself.
                onKeyDown={(event) => { if (event.key === "Enter") event.target.blur(); }}
                slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": "Lyrics offset in milliseconds", style: { textAlign: "center" } } }}
              />
              <Button size="small" variant="outlined" aria-label="Lyrics 100 ms later" onClick={() => applyOffset(offset + 100)} disabled={!canChange} sx={{ minWidth: 0, px: 1 }}>+100</Button>
              <Button size="small" variant="outlined" aria-label="Lyrics 500 ms later" onClick={() => applyOffset(offset + 500)} disabled={!canChange} sx={{ minWidth: 0, px: 1 }}>+500</Button>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1, mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
                Positive delays the lyrics, negative shows them earlier. Default {formatOffset(state.defaultOffsetMs || 0)}.
              </Typography>
              {state.offsetOverridden && (
                <Button size="small" onClick={() => { pendingOffsetRef.current = null; sendLyricsChange({ offsetMs: null }); }} disabled={!canChange}>Reset</Button>
              )}
            </Box>
            <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
              <FormControlLabel
                control={<Switch size="small" checked={syncedView && Boolean(document?.synced)} disabled={!document?.synced} onChange={(event) => toggleSyncedView(event.target.checked)} />}
                label={<Typography variant="body2">Time-synced</Typography>}
              />
              {CJK.has(state.language) && (
                <FormControlLabel
                  control={<Switch size="small" checked={showReading} onChange={(event) => toggleReading(event.target.checked)} />}
                  label={<Typography variant="body2">{state.language === "zh" ? "Pinyin" : "Romaji"}</Typography>}
                />
              )}
            </Box>
          </>
        )}
      </Paper>

      <Paper sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!currentVideo && <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>Nothing is playing.</Typography>}
        {currentVideo && error && !document && <Alert severity="warning" sx={{ m: 2, color: "text.primary" }}>{error}</Alert>}
        {currentVideo && state && state.status !== "ready" && (
          <Box sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, textAlign: "center" }}>
            {["idle", "loading"].includes(state.status) && <CircularProgress size={28} />}
            <Typography color="text.secondary">{STATUS_COPY[state.status]}</Typography>
            {state.status === "none" && (
              <Button variant="outlined" size="small" startIcon={<ManageSearch />} onClick={() => setMatchOpen(true)}>Search with different words</Button>
            )}
          </Box>
        )}
        {currentVideo && !state && !error && <Box sx={{ p: 3, display: "grid", placeItems: "center" }}><CircularProgress size={28} /></Box>}
        {currentVideo && document && (
          <>
            {!document.synced && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1 }}>
                These lyrics have no timestamps, so they can only be shown as a list.
              </Typography>
            )}
            <LyricsBoundary
              resetKey={`${document.revision}|${syncedView}|${showReading}`}
              fallback={<Alert severity="warning" sx={{ m: 2, color: "text.primary" }}>These lyrics could not be displayed.</Alert>}
            >
              <LineLyrics document={document} synced={syncedView} getTimeMs={getTimeMs} showReading={showReading} />
            </LyricsBoundary>
          </>
        )}
      </Paper>

      <Box sx={{ flexShrink: 0, px: 0.5 }}>
        <FormControlLabel
          control={<Switch size="small" checked={Boolean(lyricsPreference)} disabled={!isConnected || !controllerKey} onChange={(event) => onLyricsPreferenceChange(event.target.checked)} />}
          label={<Typography variant="body2">Show lyrics on the room screen for songs I add</Typography>}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {settings?.lyricsEnabled
            ? settings.lyricsPerUser
              ? "The room shows lyrics only for singers who turned this on."
              : "The room currently shows lyrics for every song; this applies when it is set to per-singer."
            : "Lyrics are off on the room screen. Turn them on from Controls."}
          {" "}Sync: room ~{roomLatency ?? "?"} ms, you ~{ownLatency ?? "?"} ms from the server.
        </Typography>
      </Box>

      <LyricsMatchDialog
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
        socket={socket}
        roomId={roomId}
        controllerKey={controllerKey}
        isConnected={isConnected}
        currentVideo={currentVideo}
        state={state}
        notify={notify}
      />
    </Box>
  );
};

export default LyricsTab;
