import React from "react";
import { SkipNext } from "@mui/icons-material";
import { Box, Button, Chip, FormControlLabel, LinearProgress, Paper, Switch, Typography } from "@mui/material";
import { decodeHtmlEntities } from "../../config";

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

const ControlsTab = ({ roomId, username, controllerKey, socket, isConnected, settings, setSettings, currentVideo, playback, notify }) => {
  const toggleRoundRobin = (event) => {
    if (!controllerKey || !socket) return;
    const roundRobinEnabled = event.target.checked;
    socket.timeout(10_000).emit("update-settings", { roomId, controllerKey, settings: { roundRobinEnabled } }, (error, response) => {
      if (error || !response?.ok) return notify(response?.error?.message || "Settings update timed out.", "error");
      setSettings((previous) => ({ ...previous, roundRobinEnabled }));
    });
  };
  const skip = () => socket?.timeout(10_000).emit("play-next", { roomId, controllerKey, expectedQueueId: currentVideo?.queueId }, (error, response) => {
    if (error || !response?.ok) return notify(response?.error?.message || "Skip request timed out.", "error");
    if (response.reason === "stale") notify("The song had already advanced.", "info");
  });
  return <Box sx={{ maxWidth: 600, mx: "auto", width: "100%", p: 2 }}><Paper sx={{ p: 3 }}>
    <Typography variant="h5" gutterBottom>Controls {!isConnected && <Chip label="Disconnected" size="small" color="error" />}</Typography>
    {username && <Typography sx={{ mb: 2, color: "#10B981" }}>Signed in as <strong>{username}</strong></Typography>}
    <FormControlLabel control={<Switch checked={Boolean(settings.roundRobinEnabled)} onChange={toggleRoundRobin} disabled={!controllerKey} />} label="Round-robin queue" />
    {currentVideo && <Box sx={{ my: 3, p: 3, borderRadius: 2, background: "rgba(139,92,246,.1)" }}>
      <Typography variant="subtitle2" color="primary">Now Playing</Typography><Typography sx={{ mb: 2 }}>{decodeHtmlEntities(currentVideo.title)}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><Typography variant="caption">{formatTime(playback?.positionSec)}</Typography><LinearProgress sx={{ flex: 1 }} variant={playback?.durationSec ? "determinate" : "indeterminate"} value={playback?.durationSec ? Math.min(100, 100 * (playback.positionSec || 0) / playback.durationSec) : 0} /><Typography variant="caption">{formatTime(playback?.durationSec)}</Typography></Box>
      <Typography variant="caption" color="text.secondary">State: {playback?.state || "unknown"}</Typography>
    </Box>}
    <Button variant="contained" color="secondary" startIcon={<SkipNext />} onClick={skip} disabled={!currentVideo || !isConnected || !controllerKey}>Skip Current Song</Button>
  </Paper></Box>;
};

export default ControlsTab;
