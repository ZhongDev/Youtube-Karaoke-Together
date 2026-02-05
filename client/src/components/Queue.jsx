import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
  LinearProgress,
} from "@mui/material";
import {
  PlaylistAdd as PlaylistIcon,
  Delete as DeleteIcon,
  SkipNext as SkipNextIcon,
  QueueMusic as QueueMusicIcon,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import useSocket from "../hooks/useSocket";

const Queue = () => {
  const { roomId } = useParams();
  const [queue, setQueue] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [settingsState, setSettingsState] = useState({
    roundRobinEnabled: false,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState(null);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // Use the socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
    joinRoom,
  } = useSocket();

  // Handle socket connection and room joining
  useEffect(() => {
    if (!roomId) {
      console.error("[ERR] No roomId provided");
      return;
    }

    console.log("[INFO] Queue component mounted, roomId:", roomId);

    if (!socket) return;

    // Join room when connected
    if (isConnected) {
      const username = localStorage.getItem("karaokeUsername") || "";
      joinRoom(roomId, username);
    }

    const handleRoomState = (room) => {
      console.log("[INFO] Received room state:", room);
      setQueue(room.queue || []);
      setCurrentVideo(room.currentVideo);
      setPlayback(room.playback || null);
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setIsLoading(false);
    };

    const handleQueueUpdated = (newQueue) => {
      console.log("[INFO] Queue updated:", newQueue);
      setQueue(newQueue);
    };

    const handleVideoChanged = (video) => {
      console.log("[INFO] Video changed:", video);
      setCurrentVideo(video);
    };

    const handleSettingsUpdated = (settings) =>
      setSettingsState(settings || { roundRobinEnabled: false });
    const handlePlaybackUpdated = (pb) => setPlayback(pb);

    socket.on("room-state", handleRoomState);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("settings-updated", handleSettingsUpdated);
    socket.on("video-changed", handleVideoChanged);
    socket.on("playback-updated", handlePlaybackUpdated);

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("video-changed", handleVideoChanged);
      socket.off("settings-updated", handleSettingsUpdated);
      socket.off("playback-updated", handlePlaybackUpdated);
    };
  }, [roomId, socket, isConnected, joinRoom]);

  // Show server error notifications
  useEffect(() => {
    if (serverError) {
      setNotification({
        open: true,
        message: `Server Error: ${serverError.message}`,
        severity: "error",
      });
      clearServerError();
    }
  }, [serverError, clearServerError]);

  const handleDeleteClick = (video, index) => {
    setVideoToDelete({ video, index });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (videoToDelete) {
      socket.emit("remove-from-queue", { roomId, index: videoToDelete.index });
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setVideoToDelete(null);
  };

  const handleSkipClick = () => {
    setSkipDialogOpen(true);
  };

  const handleSkipConfirm = () => {
    socket.emit("play-next", roomId);
    setSkipDialogOpen(false);
  };

  const handleSkipCancel = () => {
    setSkipDialogOpen(false);
  };

  const formatTime = (sec) => {
    if (sec == null || Number.isNaN(sec)) return "--:--";
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  // Reusable Video Card Component
  const VideoCard = ({ video, onAction, actionIcon, actionColor, actionBgColor, isNowPlaying = false }) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        borderRadius: 2,
        background: isNowPlaying ? "transparent" : "rgba(139, 92, 246, 0.05)",
        border: isNowPlaying ? "none" : "1px solid rgba(148, 163, 184, 0.08)",
        transition: "all 0.2s ease",
        "&:hover": isNowPlaying ? {} : {
          background: "rgba(139, 92, 246, 0.1)",
          border: "1px solid rgba(139, 92, 246, 0.2)",
        },
      }}
    >
      {/* Thumbnail */}
      <Box
        component="img"
        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
        alt={video.title}
        sx={{
          width: 100,
          height: 56,
          borderRadius: 1.5,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: "text.primary",
            mb: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
          }}
        >
          {video.title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Added by: {video.addedBy}
          </Typography>
          {video.isPlaylist && (
            <Chip
              size="small"
              icon={<PlaylistIcon sx={{ fontSize: 12 }} />}
              label="Playlist"
              sx={{
                height: 18,
                fontSize: "0.65rem",
                background: "rgba(139, 92, 246, 0.2)",
                color: "#A78BFA",
                border: "none",
                "& .MuiChip-icon": { color: "#A78BFA" },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Action Button */}
      <IconButton
        onClick={onAction}
        disabled={!isConnected}
        sx={{
          flexShrink: 0,
          color: actionColor,
          background: actionBgColor,
          "&:hover": {
            background: actionBgColor.replace("0.1", "0.2"),
          },
          "&:disabled": {
            color: "rgba(148, 163, 184, 0.3)",
            background: "rgba(148, 163, 184, 0.05)",
          },
        }}
      >
        {actionIcon}
      </IconButton>
    </Box>
  );

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: "auto" }}>
      {/* Main Container */}
      <Paper
        elevation={0}
        sx={{
          background: "rgba(18, 18, 26, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 2.5,
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
          }}
        >
          <QueueMusicIcon sx={{ color: "#8B5CF6" }} />
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
            Queue
          </Typography>
          {!isConnected && (
            <Chip
              label="Disconnected"
              size="small"
              sx={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#EF4444",
                fontWeight: 500,
              }}
            />
          )}
        </Box>

        {/* Connection Error */}
        {connectionError && (
          <Alert
            severity="error"
            sx={{
              m: 2,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 2,
            }}
          >
            Connection Error: {connectionError}
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && isConnected && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress sx={{ color: "#8B5CF6" }} />
          </Box>
        )}

        {/* Content */}
        {!isLoading && (
          <Box sx={{ p: 2 }}>
            {/* Now Playing Section */}
            {currentVideo && (
              <Box sx={{ mb: 3 }}>
                <Box
                  sx={{
                    p: 2,
                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%)",
                    borderRadius: 2,
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      color: "#8B5CF6",
                      fontWeight: 700,
                      letterSpacing: 1,
                      display: "block",
                      mb: 1.5,
                    }}
                  >
                    Now Playing
                  </Typography>

                  <VideoCard
                    video={currentVideo}
                    onAction={handleSkipClick}
                    actionIcon={<SkipNextIcon />}
                    actionColor="#EC4899"
                    actionBgColor="rgba(236, 72, 153, 0.1)"
                    isNowPlaying
                  />

                  {/* Progress Bar */}
                  <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", minWidth: 36, fontFamily: "monospace" }}
                      >
                        {formatTime(playback?.positionSec)}
                      </Typography>
                      <LinearProgress
                        variant={playback?.durationSec ? "determinate" : "indeterminate"}
                        value={
                          playback?.durationSec
                            ? Math.max(0, Math.min(100, (100 * (playback?.positionSec || 0)) / (playback?.durationSec || 1)))
                            : 0
                        }
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "rgba(148, 163, 184, 0.15)",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 2,
                            background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
                          },
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", minWidth: 36, textAlign: "right", fontFamily: "monospace" }}
                      >
                        {formatTime(playback?.durationSec)}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Up Next Section */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                Up Next
              </Typography>
              {queue.length > 0 && (
                <Chip
                  label={queue.length}
                  size="small"
                  sx={{
                    height: 20,
                    minWidth: 20,
                    fontSize: "0.7rem",
                    background: "rgba(139, 92, 246, 0.2)",
                    color: "#A78BFA",
                  }}
                />
              )}
              {settingsState.roundRobinEnabled && (
                <Chip
                  label="Round-robin"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10B981",
                    ml: "auto",
                  }}
                />
              )}
            </Box>

            {/* Queue List */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {queue.map((video, index) => (
                <VideoCard
                  key={`${video.id}-${index}`}
                  video={video}
                  onAction={() => handleDeleteClick(video, index)}
                  actionIcon={<DeleteIcon fontSize="small" />}
                  actionColor="#EF4444"
                  actionBgColor="rgba(239, 68, 68, 0.1)"
                />
              ))}

              {/* Empty State */}
              {queue.length === 0 && (
                <Box
                  sx={{
                    py: 5,
                    px: 3,
                    textAlign: "center",
                    background: "rgba(148, 163, 184, 0.03)",
                    borderRadius: 2,
                    border: "1px dashed rgba(148, 163, 184, 0.15)",
                  }}
                >
                  <QueueMusicIcon sx={{ fontSize: 40, color: "rgba(148, 163, 184, 0.3)", mb: 1.5 }} />
                  <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
                    No videos in queue
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.7 }}>
                    Add videos from the search tab
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
            minWidth: 320,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>Remove from Queue</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Are you sure you want to remove "{videoToDelete?.video.title}" from the queue?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={handleDeleteCancel}
            sx={{
              color: "text.secondary",
              "&:hover": { background: "rgba(148, 163, 184, 0.1)" },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
              boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
              "&:hover": {
                background: "linear-gradient(135deg, #F87171 0%, #EF4444 100%)",
              },
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Skip Dialog */}
      <Dialog
        open={skipDialogOpen}
        onClose={handleSkipCancel}
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
            minWidth: 320,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>Skip Current Song</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Are you sure you want to skip "{currentVideo?.title}" and move to the next song?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={handleSkipCancel}
            sx={{
              color: "text.secondary",
              "&:hover": { background: "rgba(148, 163, 184, 0.1)" },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSkipConfirm}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)",
              boxShadow: "0 4px 14px rgba(236, 72, 153, 0.3)",
              "&:hover": {
                background: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
              },
            }}
          >
            Skip
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{
            background:
              notification.severity === "error"
                ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
            color: "white",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            "& .MuiAlert-icon": { color: "white" },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Queue;
