import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Divider,
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

    socket.on("room-state", handleRoomState);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("settings-updated", (settings) =>
      setSettingsState(settings || { roundRobinEnabled: false })
    );
    socket.on("video-changed", handleVideoChanged);
    socket.on("playback-updated", (pb) => setPlayback(pb));

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("video-changed", handleVideoChanged);
      socket.off("settings-updated");
      socket.off("playback-updated");
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
      // Clear the server error after showing notification
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

  return (
    <Box sx={{ p: 2, maxWidth: 800, mx: "auto" }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          background: "rgba(18, 18, 26, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          borderRadius: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <QueueMusicIcon sx={{ color: "#8B5CF6" }} />
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Current Queue
          </Typography>
          {!isConnected && (
            <Chip
              label="Disconnected"
              size="small"
              sx={{
                ml: "auto",
                background: "rgba(239, 68, 68, 0.2)",
                color: "#EF4444",
              }}
            />
          )}
        </Box>

        {connectionError && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            Connection Error: {connectionError}
          </Alert>
        )}

        {isLoading && isConnected && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress sx={{ color: "#8B5CF6" }} />
          </Box>
        )}

        {currentVideo && (
          <>
            <Box
              sx={{
                p: 3,
                mb: 3,
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: 2,
                border: "1px solid rgba(139, 92, 246, 0.2)",
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ color: "#8B5CF6", fontWeight: 600, mb: 2 }}
              >
                Now Playing
              </Typography>
              <ListItem
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={handleSkipClick}
                    disabled={!isConnected}
                    sx={{
                      color: "#EC4899",
                      background: "rgba(236, 72, 153, 0.1)",
                      "&:hover": {
                        background: "rgba(236, 72, 153, 0.2)",
                      },
                      "&:disabled": {
                        color: "rgba(148, 163, 184, 0.3)",
                      },
                    }}
                  >
                    <SkipNextIcon />
                  </IconButton>
                }
                sx={{ px: 0 }}
              >
                <ListItemAvatar sx={{ minWidth: 96 }}>
                  <Avatar
                    variant="rounded"
                    src={`https://img.youtube.com/vi/${currentVideo.id}/mqdefault.jpg`}
                    alt={currentVideo.title}
                    sx={{
                      width: 80,
                      height: 50,
                      borderRadius: 1,
                    }}
                  />
                </ListItemAvatar>
                <ListItemText
                  sx={{ my: 0 }}
                  primary={
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {currentVideo.title}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Added by: {currentVideo.addedBy}
                      </Typography>
                      {currentVideo.isPlaylist && (
                        <Chip
                          size="small"
                          icon={<PlaylistIcon sx={{ fontSize: 14 }} />}
                          label="Playlist"
                          sx={{
                            height: 20,
                            fontSize: "0.7rem",
                            background: "rgba(139, 92, 246, 0.2)",
                            color: "#A78BFA",
                            border: "none",
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondaryTypographyProps={{ component: "div" }}
                />
              </ListItem>
              <Box sx={{ px: 0, pt: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40 }}>
                    {formatTime(playback?.positionSec)}
                  </Typography>
                  <LinearProgress
                    variant={
                      playback?.durationSec ? "determinate" : "indeterminate"
                    }
                    value={
                      playback?.durationSec
                        ? Math.max(
                            0,
                            Math.min(
                              100,
                              (100 * (playback?.positionSec || 0)) /
                                (playback?.durationSec || 1)
                            )
                          )
                        : 0
                    }
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 40, textAlign: "right" }}>
                    {formatTime(playback?.durationSec)}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 1, display: "block" }}>
                  State: {playback?.state || "unknown"}
                </Typography>
              </Box>
            </Box>
          </>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ color: "#8B5CF6", fontWeight: 600 }}>
            Up Next
          </Typography>
          {settingsState.roundRobinEnabled && (
            <Chip
              label="Round-robin"
              size="small"
              sx={{
                background: "rgba(16, 185, 129, 0.2)",
                color: "#10B981",
              }}
            />
          )}
        </Box>

        <List>
          {queue.map((video, index) => (
            <ListItem
              key={index}
              secondaryAction={
                <IconButton
                  edge="end"
                  onClick={() => handleDeleteClick(video, index)}
                  sx={{
                    mr: .5,
                    ml: .5,
                    color: "#EF4444",
                    background: "rgba(239, 68, 68, 0.1)",
                    "&:hover": {
                      background: "rgba(239, 68, 68, 0.2)",
                    },
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              }
              sx={{
                borderRadius: 2,
                mb: 1,
                background: "rgba(139, 92, 246, 0.05)",
                border: "1px solid rgba(148, 163, 184, 0.05)",
                transition: "all 0.2s",
                "&:hover": {
                  background: "rgba(139, 92, 246, 0.1)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                },
              }}
            >
              <ListItemAvatar sx={{ minWidth: 96 }}>
                <Avatar
                  variant="rounded"
                  src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                  alt={video.title}
                  sx={{
                    width: 80,
                    height: 50,
                    borderRadius: 1,
                  }}
                />
              </ListItemAvatar>
              <ListItemText
                sx={{ my: 0 }}
                primary={
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {video.title}
                  </Typography>
                }
                secondary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Added by: {video.addedBy}
                    </Typography>
                    {video.isPlaylist && (
                      <Chip
                        size="small"
                        icon={<PlaylistIcon sx={{ fontSize: 14 }} />}
                        label="Playlist"
                        sx={{
                          height: 20,
                          fontSize: "0.7rem",
                          background: "rgba(139, 92, 246, 0.2)",
                          color: "#A78BFA",
                          border: "none",
                        }}
                      />
                    )}
                  </Box>
                }
                secondaryTypographyProps={{ component: "div" }}
              />
            </ListItem>
          ))}
          {queue.length === 0 && (
            <Box
              sx={{
                p: 4,
                textAlign: "center",
                background: "rgba(148, 163, 184, 0.05)",
                borderRadius: 2,
                border: "1px dashed rgba(148, 163, 184, 0.2)",
              }}
            >
              <QueueMusicIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="body1" sx={{ color: "text.secondary" }}>
                No videos in queue
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Add videos from the search tab
              </Typography>
            </Box>
          )}
        </List>
      </Paper>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle id="delete-dialog-title" sx={{ fontWeight: 600 }}>
          Remove from Queue
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "text.secondary" }}>
            Are you sure you want to remove "{videoToDelete?.video.title}" from
            the queue?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
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
        aria-labelledby="skip-dialog-title"
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle id="skip-dialog-title" sx={{ fontWeight: 600 }}>
          Skip Current Song
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "text.secondary" }}>
            Are you sure you want to skip "{currentVideo?.title}" and move to
            the next song?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
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
              "&:hover": {
                background: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
              },
            }}
          >
            Skip
          </Button>
        </DialogActions>
      </Dialog>

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
            "& .MuiAlert-icon": {
              color: "white",
            },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Queue;
