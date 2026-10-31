import React, { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Link,
  MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { readingText, SOURCE_LABELS, SOURCE_ORDER } from "../lyrics/lyricsDocument";
import { adminApi } from "./adminApi";
import { KIND_LABELS, formatOffset, songTitle } from "./lyricsFormat";
import { formatDate } from "./RoomTable";

const MAX_MANUAL_LENGTH = 30_000;
const LOOKUP_LABELS = { found: "found", not_found: "not found", error: "failed" };

const searchLabel = ({ artist, track }) => (artist ? `${artist} — ${track}` : `“${track}”`);

function settingsFrom(song) {
  return {
    defaultSource: song?.defaultSource || "",
    defaultOffsetMs: String(song?.defaultOffsetMs ?? 0),
    searchArtist: song?.searchArtist || "",
    searchTrack: song?.searchTrack || "",
  };
}

const LyricsSongDialog = ({ videoId, canEdit, timeZone, onClose, onChanged }) => {
  const [song, setSong] = useState(null);
  const [form, setForm] = useState(settingsFrom(null));
  const [manual, setManual] = useState("");
  const [sourceTab, setSourceTab] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const adopt = (detail) => {
    setSong(detail);
    setForm(settingsFrom(detail));
    setManual(detail.sources.find((source) => source.source === "ykt")?.body || "");
    setSourceTab((current) => (detail.sources.some((source) => source.source === current) ? current : detail.sources[0]?.source || null));
  };

  useEffect(() => {
    if (!videoId) return undefined;
    let alive = true;
    setSong(null);
    setPreview(null);
    setError("");
    setConfirmDelete(false);
    adminApi.lyricsSong(videoId)
      .then((detail) => alive && adopt(detail))
      .catch((requestError) => alive && setError(requestError.message));
    return () => { alive = false; };
  }, [videoId]);

  // A lookup started by adding the song finishes in the background: check back.
  useEffect(() => {
    if (!videoId || song?.status !== "loading") return undefined;
    const timer = setTimeout(() => adminApi.lyricsSong(videoId).then(adopt).catch(() => {}), 2000);
    return () => clearTimeout(timer);
  }, [videoId, song]);

  const run = async (label, action) => {
    setBusy(label);
    setError("");
    try {
      const result = await action();
      if (result) adopt(result);
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const saveSettings = () => {
    const offset = Number(form.defaultOffsetMs);
    if (!/^[+-]?\d+$/.test(form.defaultOffsetMs.trim()) || Math.abs(offset) > 30_000) {
      setError("The default delay must be a whole number of milliseconds between −30000 and 30000.");
      return;
    }
    run("settings", () => adminApi.updateLyricsSong(videoId, {
      defaultSource: form.defaultSource || null,
      defaultOffsetMs: offset,
      searchArtist: form.searchArtist,
      searchTrack: form.searchTrack,
    }));
  };

  const loadPreview = (readingMode) => run("preview", async () => {
    const { document } = await adminApi.lyricsPreview(videoId, { source: sourceTab || "", readingMode });
    setPreview(document);
    return null;
  });

  // Edited search terms only matter to a new search, so save them on the way.
  const refetch = () => run("refetch", async () => {
    if (searchChanged) await adminApi.updateLyricsSong(videoId, { searchArtist: form.searchArtist, searchTrack: form.searchTrack });
    return adminApi.refetchLyrics(videoId);
  });

  const remove = () => run("delete", async () => {
    await adminApi.deleteLyricsSong(videoId);
    onClose();
    return null;
  });

  const available = new Set(song?.sources.map((source) => source.source) || []);
  const shownSource = song?.sources.find((source) => source.source === sourceTab);
  const searchChanged = song && (form.searchArtist !== (song.searchArtist || "") || form.searchTrack !== (song.searchTrack || ""));

  return (
    <Dialog open={Boolean(videoId)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {song ? songTitle(song) : "Lyrics"}
        {song && (
          <Typography variant="body2" color="text.secondary">
            {song.channelTitle ? `${song.channelTitle} · ` : ""}
            <Link href={`https://www.youtube.com/watch?v=${encodeURIComponent(song.videoId)}`} target="_blank" rel="noopener noreferrer">{song.videoId}</Link>
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
        {!song && !error && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
        {song && (
          <Stack spacing={2.5}>
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Chip size="small" label={`Status: ${song.status}`} color={song.status === "ready" ? "success" : "default"} />
              <Chip size="small" variant="outlined" label={`Language: ${song.language || "unknown"}`} />
              {song.durationSec && <Chip size="small" variant="outlined" label={`${Math.floor(song.durationSec / 60)}:${String(song.durationSec % 60).padStart(2, "0")}`} />}
              {song.providers.map((provider) => {
                const lookup = song.lookup?.[provider];
                return <Chip key={provider} size="small" variant="outlined" label={`${SOURCE_LABELS[provider]}: ${lookup ? `${LOOKUP_LABELS[lookup.status] || lookup.status} ${formatDate(lookup.at, timeZone)}` : "not searched"}`} />;
              })}
              {song.adminCuratedAt && (
                <Chip size="small" variant="outlined" color="secondary" label="Curated · kept past retention"
                  title="An administrator added or edited this song, so retention never deletes it; only its YouTube details expire." />
              )}
              <Typography variant="caption" color="text.secondary">Requested {song.requestCount}× · last {formatDate(song.lastRequestedAt, timeZone)}</Typography>
            </Stack>
            {song.youtubeDataRemovedAt && (
              // The theme's translucent `light` shades would make standard alert text unreadable.
              <Alert severity="info" sx={{ color: "text.primary" }}>
                YouTube's title, channel, and length were removed on {formatDate(song.youtubeDataRemovedAt, timeZone)} because they could
                not be refreshed within the 30-day limit. The lyrics and these settings are kept, and the details return the next time a
                room plays the video. Refetching needs search terms until then.
              </Alert>
            )}

            <Box>
              <Typography variant="subtitle2" gutterBottom>Room defaults</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
                <TextField select size="small" label="Default source" value={form.defaultSource} disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, defaultSource: event.target.value })} sx={{ minWidth: 220 }}
                  helperText={`Rooms show ${SOURCE_LABELS[song.selectedSource] || "nothing"} now`}>
                  <MenuItem value="">Automatic</MenuItem>
                  {SOURCE_ORDER.map((source) => (
                    <MenuItem key={source} value={source} disabled={!available.has(source)}>{SOURCE_LABELS[source]}{source === "ykt" ? " (administrator)" : ""}</MenuItem>
                  ))}
                </TextField>
                <TextField size="small" label="Default delay (ms)" value={form.defaultOffsetMs} disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, defaultOffsetMs: event.target.value })}
                  helperText="Positive shows lyrics later; rooms can still adjust"
                  slotProps={{ htmlInput: { inputMode: "numeric" } }} />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} gap={2} sx={{ mt: 2 }}>
                <TextField size="small" fullWidth label="Search artist (optional)" value={form.searchArtist} disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, searchArtist: event.target.value })} />
                <TextField size="small" fullWidth label="Search track (optional)" value={form.searchTrack} disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, searchTrack: event.target.value })}
                  helperText="Replaces the automatic search for the next refetch" />
              </Stack>
              {song.searchPlan?.length > 0 && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                  Automatic search, from the title and channel, in order: {song.searchPlan.map(searchLabel).join(" → ")}
                </Typography>
              )}
              {canEdit && (
                <Stack direction="row" gap={1} sx={{ mt: 1.5 }}>
                  <Button variant="contained" onClick={saveSettings} disabled={Boolean(busy)}>{busy === "settings" ? "Saving…" : "Save defaults"}</Button>
                  <Button onClick={refetch} disabled={Boolean(busy) || song.providers.length === 0 || (!song.title && !form.searchArtist.trim() && !form.searchTrack.trim())}>
                    {busy === "refetch" ? "Searching…" : searchChanged ? "Refetch with these search terms" : "Refetch from providers"}
                  </Button>
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary">Current default: {song.defaultSource ? SOURCE_LABELS[song.defaultSource] : "automatic"}, {formatOffset(song.defaultOffsetMs)}</Typography>
            </Box>

            <Divider />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Stored lyrics</Typography>
              {song.sources.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No lyrics stored. Paste some below to make them available to rooms.</Typography>
              ) : (
                <>
                  <Tabs value={sourceTab || false} onChange={(event, value) => { setSourceTab(value); setPreview(null); }} sx={{ mb: 1 }}>
                    {song.sources.map((source) => <Tab key={source.source} value={source.source} label={`${SOURCE_LABELS[source.source]} · ${KIND_LABELS[source.kind]}`} />)}
                  </Tabs>
                  {shownSource && (
                    <>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                        {shownSource.providerTrack ? `Matched “${[shownSource.providerArtist, shownSource.providerTrack].filter(Boolean).join(" – ")}”` : "Administrator lyrics"}
                        {shownSource.providerDurationSec ? ` · ${shownSource.providerDurationSec}s recording` : ""}
                        {shownSource.confidence ? ` · confidence ${Math.round(shownSource.confidence * 100)}%` : ""}
                        {` · updated ${formatDate(shownSource.updatedAt, timeZone)}`}
                      </Typography>
                      <Box component="pre" sx={{ m: 0, p: 1.5, maxHeight: 220, overflow: "auto", bgcolor: "rgba(148,163,184,.08)", borderRadius: 1, fontSize: "0.75rem", whiteSpace: "pre-wrap" }}>
                        {shownSource.body}
                      </Box>
                      <Stack direction="row" gap={1} sx={{ mt: 1 }}>
                        <Button size="small" onClick={() => loadPreview("romaji")} disabled={Boolean(busy)}>Preview with reading aid</Button>
                        {song.language === "ja" && <Button size="small" onClick={() => loadPreview("furigana")} disabled={Boolean(busy)}>Preview with furigana</Button>}
                      </Stack>
                      {preview && (
                        <Box sx={{ mt: 1, maxHeight: 220, overflow: "auto", p: 1.5, border: "1px solid rgba(148,163,184,.2)", borderRadius: 1 }}>
                          {preview.lines.map((line, index) => (
                            <Box key={index} sx={{ mb: 0.75 }}>
                              {readingText(line.ruby, preview.readingMode) && <Typography variant="caption" color="secondary.light" component="div">{readingText(line.ruby, preview.readingMode)}</Typography>}
                              <Typography variant="body2">
                                {Number.isFinite(line.t) && <Box component="span" sx={{ color: "text.secondary", fontFamily: "monospace", mr: 1 }}>{(line.t / 1000).toFixed(2)}</Box>}
                                {line.text || " "}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </>
                  )}
                </>
              )}
            </Box>

            {canEdit && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Administrator lyrics (YKT)</Typography>
                  <TextField
                    multiline minRows={6} maxRows={16} fullWidth
                    placeholder={"[00:12.30]First line\n[00:16.80]Second line\n\nLRC timestamps make lyrics play in time; plain text is shown as an unsynced list."}
                    value={manual}
                    onChange={(event) => setManual(event.target.value)}
                    error={manual.length > MAX_MANUAL_LENGTH}
                    helperText={`${manual.length.toLocaleString()} / ${MAX_MANUAL_LENGTH.toLocaleString()} characters`}
                    slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: "0.8rem" } } }}
                  />
                  <Stack direction="row" gap={1} sx={{ mt: 1 }}>
                    <Button variant="contained" disabled={Boolean(busy) || !manual.trim() || manual.length > MAX_MANUAL_LENGTH}
                      onClick={() => run("manual", () => adminApi.setManualLyrics(videoId, manual))}>
                      {busy === "manual" ? "Saving…" : "Save YKT lyrics"}
                    </Button>
                    {available.has("ykt") && (
                      <Button color="error" disabled={Boolean(busy)} onClick={() => run("manual", () => adminApi.setManualLyrics(videoId, ""))}>Remove YKT lyrics</Button>
                    )}
                  </Stack>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {canEdit && song && (confirmDelete ? (
          <>
            <Typography variant="body2" color="error" sx={{ mr: "auto", ml: 1 }}>Delete this song and all of its stored lyrics?</Typography>
            <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
            <Button color="error" variant="contained" onClick={remove} disabled={Boolean(busy)}>Delete</Button>
          </>
        ) : (
          <Button color="error" onClick={() => setConfirmDelete(true)} sx={{ mr: "auto" }}>Delete from cache</Button>
        ))}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LyricsSongDialog;
