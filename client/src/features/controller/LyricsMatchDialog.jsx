import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Close, ContentCopy } from "@mui/icons-material";
import { decodeHtmlEntities } from "../../config";
import { KIND_LABELS, SOURCE_LABELS, SOURCE_ORDER } from "../lyrics/lyricsDocument";

// What the current song's lyrics were matched to, next to the YouTube title,
// with a search to correct a wrong match. A correction is shared: the server
// keeps the terms for the video, so every room that plays it benefits.

const SEARCH_TIMEOUT_MS = 45_000;
// Lengths further apart than this suggest a different recording.
const DURATION_WARNING_SEC = 5;
const OUTCOME_COPY = { not_found: "No match found", error: "Could not be reached" };

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const searchLabel = ({ artist, track }) => (artist ? `${artist} — ${track}` : `“${track}”`);

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Phones on a plain-HTTP LAN address have no Clipboard API.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("copy failed");
}

function describeSearch({ found = [], outcomes = {} }) {
  const names = (ids) => ids.map((id) => SOURCE_LABELS[id] || id).join(" and ");
  const unreachable = Object.entries(outcomes).filter(([, status]) => status === "error").map(([id]) => id);
  const unreachableNote = unreachable.length ? ` ${names(unreachable)} could not be reached; try again shortly.` : "";
  if (found.length) {
    return { severity: "success", message: `Found on ${names(found)}. The room now shows the new lyrics.${unreachableNote}` };
  }
  return { severity: "info", message: `Nothing was found for these words, so the lyrics were left as they were.${unreachableNote}` };
}

const LyricsMatchDialog = ({ open, onClose, socket, roomId, controllerKey, isConnected, currentVideo, state, notify }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [details, setDetails] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ artist: "", track: "" });
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const prefilledForRef = useRef(null);
  const requestRef = useRef(0);
  const queueId = currentVideo?.queueId ?? null;
  const title = currentVideo ? decodeHtmlEntities(currentVideo.title) : "";
  const channel = currentVideo?.channelTitle ? decodeHtmlEntities(currentVideo.channelTitle) : "";

  // A different song: forget the last one's details, search, and result.
  // Declared before loading so it never wipes a reply that arrives at once.
  useEffect(() => {
    setDetails(null);
    setLoadedFor(null);
    setResult(null);
    prefilledForRef.current = null;
  }, [queueId]);

  const load = useCallback(() => {
    if (!socket?.connected || !roomId || queueId === null) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    socket.timeout(10_000).emit("lyrics-match", { roomId, queueId }, (timeoutError, response) => {
      if (requestId !== requestRef.current) return;
      setLoading(false);
      if (!timeoutError && response?.ok) setDetails(response.details ?? null);
      setLoadedFor(queueId);
    });
  }, [socket, roomId, queueId]);

  // Fresh details on opening, and whenever the song or its lyrics change.
  useEffect(() => {
    if (open) load();
  }, [open, load, state?.revision, state?.status]);

  // Start the search fields from what was last searched, once the song's
  // details have arrived, each time the screen opens.
  useEffect(() => {
    if (!open || queueId === null || loadedFor !== queueId || prefilledForRef.current === queueId) return;
    prefilledForRef.current = queueId;
    const start = details?.searchTerms || details?.searchPlan?.[0] || { artist: "", track: title };
    setForm({ artist: start.artist || "", track: start.track || "" });
  }, [open, loadedFor, details, queueId, title]);

  useEffect(() => {
    if (!open) prefilledForRef.current = null;
  }, [open]);

  const copyTitle = async () => {
    try {
      await copyText(title);
      notify("Title copied.", "success");
    } catch {
      notify("Copying is not available here; select the title and copy it instead.", "error");
    }
  };

  const canSearch = Boolean(isConnected && socket && controllerKey && queueId !== null && !searching);

  const search = (event) => {
    event.preventDefault();
    if (!canSearch) return;
    if (!form.track.trim()) {
      setResult({ severity: "error", message: "Enter the song title to search for." });
      return;
    }
    setSearching(true);
    setResult(null);
    socket.timeout(SEARCH_TIMEOUT_MS).emit("lyrics-search", {
      roomId, controllerKey, expectedQueueId: queueId, artist: form.artist, track: form.track,
    }, (timeoutError, response) => {
      setSearching(false);
      if (timeoutError || !response?.ok) {
        setResult({ severity: "error", message: response?.error?.message || "The search took too long. Try again." });
        return;
      }
      if (response.details) setDetails(response.details);
      setResult(describeSearch(response));
    });
  };

  const videoDuration = details?.durationSec ?? null;
  const shownSources = SOURCE_ORDER.filter((source) => details?.providers?.includes(source) || details?.matches?.some((entry) => entry.source === source));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="lyrics-match-title">
      <DialogTitle id="lyrics-match-title" sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box sx={{ flex: 1 }}>Lyrics match</Box>
        <IconButton onClick={onClose} aria-label="Close lyrics match"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!currentVideo ? (
          <Typography color="text.secondary">Nothing is playing.</Typography>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" color="text.secondary">YouTube video</Typography>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Typography variant="body1" data-testid="lyrics-match-video-title" sx={{ flex: 1, fontWeight: 600, wordBreak: "break-word", userSelect: "text", WebkitUserSelect: "text" }}>
                  {title}
                </Typography>
                <IconButton size="small" onClick={copyTitle} aria-label="Copy video title"><ContentCopy fontSize="small" /></IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ userSelect: "text", WebkitUserSelect: "text" }}>
                {[channel, formatDuration(videoDuration)].filter(Boolean).join(" · ")}
              </Typography>
            </Box>

            <Divider />
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>Matched lyrics</Typography>
                {loading && <CircularProgress size={16} aria-label="Loading match" />}
              </Box>
              {!details && !loading && <Typography variant="body2" color="text.secondary">This song has not been looked up yet.</Typography>}
              <Stack spacing={1}>
                {shownSources.map((source) => {
                  const match = details.matches.find((entry) => entry.source === source);
                  const outcome = details.lookup?.[source];
                  const showing = state?.source === source;
                  const lengthOff = match && Number.isFinite(match.durationSec) && Number.isFinite(videoDuration)
                    && Math.abs(match.durationSec - videoDuration) > DURATION_WARNING_SEC;
                  return (
                    <Box key={source} data-testid={`lyrics-match-${source}`} sx={{ p: 1.25, border: 1, borderColor: showing ? "secondary.main" : "divider", borderRadius: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                        <Typography variant="subtitle2">{SOURCE_LABELS[source]}</Typography>
                        {showing && <Chip size="small" label="Showing" color="secondary" variant="outlined" />}
                        {match && <Chip size="small" variant="outlined" label={KIND_LABELS[match.kind] || match.kind} />}
                        {Number.isFinite(match?.confidence) && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>{Math.round(match.confidence * 100)}% match</Typography>
                        )}
                      </Box>
                      {match && source === "ykt" && <Typography variant="body2" color="text.secondary">Added by an administrator.</Typography>}
                      {match && source !== "ykt" && (
                        <>
                          <Typography variant="body2" sx={{ userSelect: "text", WebkitUserSelect: "text", wordBreak: "break-word" }}>
                            <strong>{match.track || "Unknown title"}</strong>{match.artist ? ` — ${match.artist}` : ""}
                          </Typography>
                          {Number.isFinite(match.durationSec) && (
                            <Typography variant="caption" color={lengthOff ? "warning.main" : "text.secondary"}>
                              {formatDuration(match.durationSec)}
                              {lengthOff ? ` · the video is ${formatDuration(videoDuration)}, so this may be a different recording` : ""}
                            </Typography>
                          )}
                        </>
                      )}
                      {!match && (
                        <Typography variant="body2" color="text.secondary">
                          {outcome ? OUTCOME_COPY[outcome.status] || outcome.status : "Not searched yet"}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Stack>
              {details?.searchPlan?.length > 0 && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, userSelect: "text", WebkitUserSelect: "text" }}>
                  {details.searchTerms ? "Searched with corrected terms: " : "Searched for, in order: "}
                  {details.searchPlan.map(searchLabel).join(" → ")}
                </Typography>
              )}
            </Box>

            <Divider />
            <Box component="form" onSubmit={search} noValidate>
              <Typography variant="overline" color="text.secondary">Wrong song? Search again</Typography>
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <TextField size="small" label="Artist" value={form.artist} disabled={searching}
                  onChange={(event) => setForm({ ...form, artist: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: 200, autoCapitalize: "words" } }} />
                <TextField size="small" label="Song title" value={form.track} disabled={searching} required
                  onChange={(event) => setForm({ ...form, track: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: 200 } }} />
                <Typography variant="caption" color="text.secondary">
                  Searches LRCLIB and NetEase with these words. The lyrics are replaced only if something is found, and the
                  correction applies wherever this video plays.
                </Typography>
                <Button type="submit" variant="contained" disabled={!canSearch} startIcon={searching ? <CircularProgress size={16} color="inherit" /> : null}>
                  {searching ? "Searching…" : "Search again"}
                </Button>
                {/* The theme's translucent `light` shades would make standard alert text unreadable. */}
                {result && <Alert severity={result.severity} onClose={() => setResult(null)} sx={{ color: "text.primary" }}>{result.message}</Alert>}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LyricsMatchDialog;
