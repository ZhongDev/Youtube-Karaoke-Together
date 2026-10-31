import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, MenuItem, Pagination, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import { SOURCE_LABELS } from "../lyrics/lyricsDocument";
import { adminApi } from "./adminApi";
import { KIND_LABELS, formatOffset, songTitle } from "./lyricsFormat";
import LyricsSongDialog from "./LyricsSongDialog";
import { formatDate } from "./RoomTable";

const PAGE_SIZE = 25;
const SORTS = [
  ["recent", "Recently requested"],
  ["updated", "Recently updated"],
  ["requests", "Most requested"],
  ["title", "Title"],
];

const LyricsPanel = ({ canEdit = false, timeZone }) => {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, rows: [], providers: [] });
  const [error, setError] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [openVideoId, setOpenVideoId] = useState(null);

  // Typing settles for a moment before it becomes a search.
  useEffect(() => {
    const timer = setTimeout(() => { setAppliedQuery(query.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.lyrics({ query: appliedQuery, sort, offset: page * PAGE_SIZE, limit: PAGE_SIZE }));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [appliedQuery, sort, page]);

  useEffect(() => { load(); }, [load]);

  const addVideo = async (event) => {
    event.preventDefault();
    if (!videoInput.trim()) return;
    setAdding(true);
    try {
      const song = await adminApi.addLyricsSong(videoInput.trim());
      setVideoInput("");
      setOpenVideoId(song.videoId);
      load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Lyrics found through {data.providers?.length ? data.providers.map((id) => SOURCE_LABELS[id]).join(" and ") : "no providers (lookups are turned off)"} are cached here, along with songs that had none.
        Lyrics you paste appear to rooms as the YKT source. Each song&apos;s YouTube details are refreshed through the Data API before 30 days, and songs whose video is gone are removed.
      </Alert>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} gap={2}>
        <TextField size="small" label="Search title, artist, or video ID" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ flex: 2 }} />
        <TextField size="small" select label="Sort" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }} sx={{ minWidth: 200 }}>
          {SORTS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        {canEdit && (
          <Box component="form" onSubmit={addVideo} sx={{ display: "flex", gap: 1, flex: 2 }}>
            <TextField size="small" label="Add a YouTube URL or video ID" value={videoInput} onChange={(event) => setVideoInput(event.target.value)} sx={{ flex: 1 }} />
            <Button type="submit" variant="outlined" disabled={adding || !videoInput.trim()}>{adding ? "Adding…" : "Add"}</Button>
          </Box>
        )}
      </Stack>
      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Song</TableCell>
                <TableCell>Sources</TableCell>
                <TableCell>Default</TableCell>
                <TableCell>Language</TableCell>
                <TableCell align="right">Requests</TableCell>
                <TableCell>Last requested</TableCell>
                <TableCell align="right">Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((song) => (
                <TableRow key={song.videoId} hover onClick={() => setOpenVideoId(song.videoId)} sx={{ cursor: "pointer" }}>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Typography variant="body2" noWrap title={songTitle(song)}>{songTitle(song)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>{song.videoId}</Typography>
                    {song.youtubeDataRemovedAt && <Typography variant="caption" color="text.secondary"> · YouTube details removed</Typography>}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {song.sources.length === 0 && <Chip size="small" variant="outlined" label="none" />}
                      {song.sources.map((source) => (
                        <Chip key={source.source} size="small" color={source.source === "ykt" ? "secondary" : "default"}
                          label={`${SOURCE_LABELS[source.source]} · ${KIND_LABELS[source.kind] || source.kind}`} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{song.defaultSource ? SOURCE_LABELS[song.defaultSource] : "Automatic"} · {formatOffset(song.defaultOffsetMs)}</TableCell>
                  <TableCell>{song.language || "—"}</TableCell>
                  <TableCell align="right">{song.requestCount}</TableCell>
                  <TableCell>{formatDate(song.lastRequestedAt, timeZone)}</TableCell>
                  <TableCell align="right"><Button size="small" onClick={(event) => { event.stopPropagation(); setOpenVideoId(song.videoId); }}>Open</Button></TableCell>
                </TableRow>
              ))}
              {data.rows.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center">{appliedQuery ? "No cached songs match." : "No songs have been cached yet."}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {data.total > PAGE_SIZE && (
          <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
            <Pagination page={page + 1} count={Math.ceil(data.total / PAGE_SIZE)} onChange={(event, value) => setPage(value - 1)} />
          </Box>
        )}
      </Paper>
      <Typography variant="caption" color="text.secondary">{data.total} cached song{data.total === 1 ? "" : "s"}</Typography>
      <LyricsSongDialog
        videoId={openVideoId}
        canEdit={canEdit}
        timeZone={timeZone}
        onClose={() => setOpenVideoId(null)}
        onChanged={load}
      />
    </Stack>
  );
};

export default LyricsPanel;
