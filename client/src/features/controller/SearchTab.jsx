import React, { useCallback, useEffect, useRef, useState } from "react";
import { Add, PlaylistAdd, VerticalAlignTop } from "@mui/icons-material";
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, TextField, Typography } from "@mui/material";
import { decodeHtmlEntities, getBackendUrl } from "../../config";

function transformResult(item) {
  return {
    id: item.id.videoId || item.id.playlistId,
    title: decodeHtmlEntities(item.snippet.title),
    channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
    thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    isPlaylist: Boolean(item.id.playlistId),
  };
}

const SearchTab = ({ roomId, controllerKey, socket, isConnected, notify, roundRobinEnabled = false }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [priorityVideo, setPriorityVideo] = useState(null);
  const observer = useRef(null);
  const requestSequence = useRef(0);
  const loadingRef = useRef(false);

  const request = useCallback(async (pageToken, append) => {
    const normalized = query.trim();
    if (!normalized || !controllerKey || loadingRef.current) return;
    const sequence = ++requestSequence.current;
    loadingRef.current = true;
    append ? setLoadingMore(true) : setSearching(true);
    if (!append) { setHasSearched(true); setNextPageToken(null); }
    try {
      const url = new URL(`${getBackendUrl()}/api/search`);
      url.searchParams.set("query", normalized);
      url.searchParams.set("roomId", roomId);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${controllerKey}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Search failed (${response.status})`);
      if (sequence !== requestSequence.current) return;
      const transformed = (data.items || []).map(transformResult);
      setResults((previous) => {
        if (!append) return transformed;
        const existing = new Set(previous.map((item) => item.id));
        return [...previous, ...transformed.filter((item) => !existing.has(item.id))];
      });
      setNextPageToken(data.nextPageToken || null);
    } catch (error) {
      if (sequence === requestSequence.current) {
        if (!append) setResults([]);
        notify(`Search failed: ${error.message}`, "error");
      }
    } finally {
      if (sequence === requestSequence.current) {
        setSearching(false); setLoadingMore(false); loadingRef.current = false;
      }
    }
  }, [controllerKey, notify, query, roomId]);

  const lastResultRef = useCallback((node) => {
    observer.current?.disconnect();
    if (!node || !nextPageToken || loadingRef.current) return;
    observer.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingRef.current) request(nextPageToken, true);
    }, { threshold: 0.5 });
    observer.current.observe(node);
  }, [nextPageToken, request]);

  useEffect(() => () => observer.current?.disconnect(), []);

  const add = (video, addToTop = false) => {
    if (!controllerKey || !socket || !isConnected) return notify("Not connected or authenticated.", "error");
    socket.timeout(30_000).emit("add-to-queue", { roomId, video, controllerKey, addToTop }, (timeoutError, response) => {
      if (timeoutError) return notify("Adding the selection timed out.", "error");
      if (!response?.ok) return notify(response?.error?.message || "Could not add the selection.", "error");
      const suffix = response.skippedCount ? ` (${response.skippedCount} skipped)` : "";
      notify(`${response.addedCount} video${response.addedCount === 1 ? "" : "s"} added${addToTop ? " to the top" : ""}${suffix}.`, "success");
    });
  };

  const confirmPriorityAdd = () => {
    if (priorityVideo) add(priorityVideo, true);
    setPriorityVideo(null);
  };

  return <Box sx={{ maxWidth: 600, mx: "auto", width: "100%", p: 2 }}>
    <Paper sx={{ p: 3, mb: 2 }}><Typography variant="h5" gutterBottom>Search</Typography>
      {!hasSearched && <Typography variant="caption" color="text.secondary">Results are provided by YouTube API Services and subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</Typography>}
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}><TextField fullWidth placeholder="Search YouTube…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); request(null, false); } }} disabled={!isConnected || searching || !controllerKey} />
        <Button variant="contained" onClick={() => request(null, false)} disabled={!query.trim() || !isConnected || searching || !controllerKey}>{searching ? "…" : "Search"}</Button></Box>
    </Paper>
    <Paper sx={{ p: 2 }}><Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}><Typography variant="h6">Search Results</Typography>{results.length > 0 && <Chip label={results.length} size="small" />}</Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>{results.map((result, index) => <Box key={result.id} ref={index === results.length - 1 ? lastResultRef : null} sx={{ display: "flex", alignItems: "center", gap: 2, p: 1.5, borderRadius: 2, background: "rgba(139,92,246,.05)" }}>
        <Box component="img" src={result.thumbnailUrl || (result.isPlaylist ? undefined : `https://img.youtube.com/vi/${result.id}/mqdefault.jpg`)} alt="" sx={{ width: 80, height: 45, borderRadius: 1, objectFit: "cover", background: "#222" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap>{result.title}</Typography><Typography variant="caption" color="text.secondary">{result.channelTitle}</Typography>{result.isPlaylist && <Chip size="small" icon={<PlaylistAdd />} label="Playlist" sx={{ ml: 1, height: 20 }} />}</Box>
        <IconButton aria-label={`Add ${result.title} to top of queue`} onClick={() => setPriorityVideo(result)} disabled={!isConnected || !controllerKey} color="warning"><VerticalAlignTop /></IconButton>
        <IconButton aria-label={`Add ${result.title}`} onClick={() => add(result)} disabled={!isConnected || !controllerKey} color="success"><Add /></IconButton>
      </Box>)}</Box>
      {loadingMore && <Box sx={{ textAlign: "center", py: 2 }}><CircularProgress size={24} /></Box>}
      {hasSearched && !searching && results.length === 0 && <Typography color="text.secondary" align="center" sx={{ py: 4 }}>No results found.</Typography>}
    </Paper>
    <Dialog open={Boolean(priorityVideo)} onClose={() => setPriorityVideo(null)} fullWidth maxWidth="xs">
      <DialogTitle>Add to top of queue?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Add “{priorityVideo?.title}” to the top of {roundRobinEnabled ? "your personal queue order" : "the pending queue"}?
        </Typography>
        {roundRobinEnabled && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Round-robin turn order will remain unchanged.
        </Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPriorityVideo(null)}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={confirmPriorityAdd}>Add to top</Button>
      </DialogActions>
    </Dialog>
  </Box>;
};

export default SearchTab;
