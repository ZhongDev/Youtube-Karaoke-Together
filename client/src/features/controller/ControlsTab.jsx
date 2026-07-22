import React, { useEffect, useState } from "react";
import {
  Forward,
  Pause,
  PlayArrow,
  Replay,
  SkipNext,
  VolumeDown,
  VolumeUp,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Paper,
  Slider,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { decodeHtmlEntities } from "../../config";
import {
  clampPlaybackPosition,
  formatPlaybackTimestamp,
  isPlaybackActive,
  parsePlaybackTimestamp,
} from "./playbackControls";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  return formatPlaybackTimestamp(seconds).replace(/\.\d{3}$/, "");
}

const ControlsTab = ({
  roomId,
  username,
  controllerKey,
  socket,
  isConnected,
  settings,
  setSettings,
  currentVideo,
  playback,
  notify,
}) => {
  const [seekValue, setSeekValue] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [volumeValue, setVolumeValue] = useState(100);
  const [adjustingVolume, setAdjustingVolume] = useState(false);
  const [commandPending, setCommandPending] = useState(false);
  const [exactSeekOpen, setExactSeekOpen] = useState(false);
  const [exactSeekValue, setExactSeekValue] = useState("");
  const [exactSeekError, setExactSeekError] = useState("");
  const duration = Number.isFinite(playback?.durationSec) ? playback.durationSec : null;
  const canControl = Boolean(currentVideo && isConnected && controllerKey && socket);

  useEffect(() => {
    if (!seeking) setSeekValue(clampPlaybackPosition(playback?.positionSec, duration));
  }, [duration, playback?.positionSec, seeking]);

  useEffect(() => {
    if (!adjustingVolume && Number.isFinite(playback?.volume)) setVolumeValue(playback.volume);
  }, [adjustingVolume, playback?.volume]);

  useEffect(() => {
    setExactSeekOpen(false);
    setExactSeekError("");
  }, [currentVideo?.queueId]);

  const sendPlaybackCommand = (command) => {
    if (!canControl) {
      notify("Playback controls require a connected controller and an active video.", "error");
      return;
    }
    setCommandPending(true);
    socket.timeout(10_000).emit("control-playback", {
      roomId,
      controllerKey,
      command: {
        ...command,
        ...(command.type === "volume" ? {} : { expectedQueueId: currentVideo.queueId }),
      },
    }, (error, response) => {
      setCommandPending(false);
      if (error || !response?.ok) {
        notify(response?.error?.message || "Playback control timed out.", "error");
        socket.emit("request-room-state", { roomId });
      }
    });
  };

  const toggleRoundRobin = (event) => {
    if (!controllerKey || !socket) return;
    const roundRobinEnabled = event.target.checked;
    socket.timeout(10_000).emit("update-settings", {
      roomId,
      controllerKey,
      settings: { roundRobinEnabled },
    }, (error, response) => {
      if (error || !response?.ok) return notify(response?.error?.message || "Settings update timed out.", "error");
      setSettings((previous) => ({ ...previous, roundRobinEnabled }));
    });
  };

  const skip = () => socket?.timeout(10_000).emit("play-next", {
    roomId,
    controllerKey,
    expectedQueueId: currentVideo?.queueId,
  }, (error, response) => {
    if (error || !response?.ok) return notify(response?.error?.message || "Skip request timed out.", "error");
    if (response.reason === "stale") notify("The song had already advanced.", "info");
  });

  const seekTo = (positionSec) => {
    const target = clampPlaybackPosition(positionSec, duration);
    setSeekValue(target);
    sendPlaybackCommand({ type: "seek", positionSec: target });
  };

  const openExactSeek = () => {
    setExactSeekValue(formatPlaybackTimestamp(seekValue));
    setExactSeekError("");
    setExactSeekOpen(true);
  };

  const submitExactSeek = (event) => {
    event.preventDefault();
    const positionSec = parsePlaybackTimestamp(exactSeekValue);
    if (positionSec == null) {
      setExactSeekError("Enter a time as mm:ss or hh:mm:ss, with optional milliseconds.");
      return;
    }
    if (!Number.isFinite(duration) || positionSec > duration) {
      setExactSeekError(`Time must not exceed ${formatPlaybackTimestamp(duration)}.`);
      return;
    }
    setExactSeekOpen(false);
    setExactSeekError("");
    seekTo(positionSec);
  };

  const playing = isPlaybackActive(playback?.state);

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", width: "100%", p: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Controls {!isConnected && <Chip label="Disconnected" size="small" color="error" />}
        </Typography>
        {username && <Typography sx={{ mb: 2, color: "#10B981" }}>Signed in as <strong>{username}</strong></Typography>}

        {currentVideo && (
          <Box sx={{ my: 3, p: { xs: 2, sm: 3 }, borderRadius: 2, background: "rgba(139,92,246,.1)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="subtitle2" color="primary" sx={{ flex: 1 }}>Now Playing</Typography>
              <Chip label={playback?.state || "unknown"} size="small" variant="outlined" />
            </Box>
            <Typography sx={{ mb: 2 }}>{decodeHtmlEntities(currentVideo.title)}</Typography>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant="text"
                size="small"
                aria-label="Enter exact playback time"
                title="Enter exact playback time"
                onClick={openExactSeek}
                disabled={!canControl || !duration || commandPending}
                sx={{ minWidth: 46, p: 0.25, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(seekValue)}
              </Button>
              <Slider
                aria-label="Seek playback timeline"
                min={0}
                max={duration || 1}
                step={1}
                value={Math.min(seekValue, duration || 1)}
                valueLabelDisplay="auto"
                valueLabelFormat={formatTime}
                disabled={!canControl || !duration || commandPending}
                onChange={(_, value) => {
                  setSeeking(true);
                  setSeekValue(Number(value));
                }}
                onChangeCommitted={(_, value) => {
                  setSeeking(false);
                  seekTo(Number(value));
                }}
              />
              <Typography variant="caption" sx={{ minWidth: 38, textAlign: "right" }}>{formatTime(duration)}</Typography>
            </Box>

            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr auto 1fr" },
              alignItems: "center",
              gap: 1,
              my: 2,
            }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Replay />}
                aria-label="Seek back 15 seconds"
                onClick={() => seekTo(seekValue - 15)}
                disabled={!canControl || commandPending}
                sx={{ gridColumn: { xs: "1", sm: "1" }, gridRow: { xs: "2", sm: "1" } }}
              >
                −15s
              </Button>
              <Button
                variant="contained"
                startIcon={playing ? <Pause /> : <PlayArrow />}
                onClick={() => sendPlaybackCommand({ type: playing ? "pause" : "play" })}
                disabled={!canControl || commandPending}
                aria-label={playing ? "Pause playback" : "Play playback"}
                sx={{ gridColumn: { xs: "1 / -1", sm: "2" }, gridRow: "1", minWidth: 112 }}
              >
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                endIcon={<Forward />}
                aria-label="Seek forward 15 seconds"
                onClick={() => seekTo(seekValue + 15)}
                disabled={!canControl || commandPending}
                sx={{ gridColumn: { xs: "2", sm: "3" }, gridRow: { xs: "2", sm: "1" } }}
              >
                +15s
              </Button>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <VolumeDown color="action" />
              <Slider
                aria-label="Room volume"
                min={0}
                max={100}
                step={1}
                value={volumeValue}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value}%`}
                disabled={!canControl || commandPending}
                onChange={(_, value) => {
                  setAdjustingVolume(true);
                  setVolumeValue(Number(value));
                }}
                onChangeCommitted={(_, value) => {
                  setAdjustingVolume(false);
                  sendPlaybackCommand({ type: "volume", volume: Number(value) });
                }}
              />
              <VolumeUp color="action" />
              <Typography variant="caption" sx={{ minWidth: 34, textAlign: "right" }}>{Math.round(volumeValue)}%</Typography>
            </Box>
          </Box>
        )}

        <Button
          variant="contained"
          color="secondary"
          startIcon={<SkipNext />}
          onClick={skip}
          disabled={!canControl}
        >
          Skip Current Song
        </Button>

        <Divider sx={{ my: 3 }} />
        <FormControlLabel
          control={<Switch checked={Boolean(settings.roundRobinEnabled)} onChange={toggleRoundRobin} disabled={!controllerKey} />}
          label="Round-robin queue"
        />
      </Paper>

      <Dialog
        open={exactSeekOpen}
        onClose={() => setExactSeekOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={submitExactSeek}>
          <DialogTitle>Seek to exact time</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter a time between 00:00.000 and {formatPlaybackTimestamp(duration)}.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Playback time"
              value={exactSeekValue}
              onChange={(event) => {
                setExactSeekValue(event.target.value);
                if (exactSeekError) setExactSeekError("");
              }}
              error={Boolean(exactSeekError)}
              helperText={exactSeekError || "Format: (hh:)mm:ss(.000)"}
              placeholder="01:23.456"
              inputProps={{ inputMode: "text", autoComplete: "off" }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setExactSeekOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Seek</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
};

export default ControlsTab;
