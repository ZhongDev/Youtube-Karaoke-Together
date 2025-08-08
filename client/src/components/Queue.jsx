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
} from "@mui/material";
import {
  PlaylistAdd as PlaylistIcon,
  Delete as DeleteIcon,
  SkipNext as SkipNextIcon,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import useSocket from "../hooks/useSocket";

const Queue = () => {
  const { roomId } = useParams();
  const [queue, setQueue] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
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
      joinRoom(roomId);
    }

    const handleRoomState = (room) => {
      console.log("[INFO] Received room state:", room);
      setQueue(room.queue || []);
      setCurrentVideo(room.currentVideo);
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
    socket.on("video-changed", handleVideoChanged);

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("video-changed", handleVideoChanged);
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

  return (
    <Box sx={{ p: 2, maxWidth: 800, mx: "auto" }}>
      <Paper elevation={3} sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>
          Current Queue {!isConnected && "(Disconnected)"}
        </Typography>

        {connectionError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Connection Error: {connectionError}
          </Alert>
        )}

        {isLoading && isConnected && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {currentVideo && (
          <>
            <Typography variant="subtitle1" color="primary" gutterBottom>
              Now Playing
            </Typography>
            <ListItem
              secondaryAction={
                <IconButton
                  edge="end"
                  onClick={handleSkipClick}
                  color="warning"
                  disabled={!isConnected}
                >
                  <SkipNextIcon />
                </IconButton>
              }
            >
              <ListItemAvatar>
                <Avatar
                  variant="rounded"
                  src={`https://img.youtube.com/vi/${currentVideo.id}/mqdefault.jpg`}
                  alt={currentVideo.title}
                />
              </ListItemAvatar>
              <ListItemText
                primary={currentVideo.title}
                secondary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Added by: {currentVideo.addedBy}
                    </Typography>
                    {currentVideo.isPlaylist && (
                      <Chip
                        size="small"
                        icon={<PlaylistIcon />}
                        label="Playlist"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                  </Box>
                }
              />
            </ListItem>
            <Divider sx={{ my: 2 }} />
          </>
        )}

        <Typography variant="subtitle1" color="primary" gutterBottom>
          Up Next
        </Typography>
        <List>
          {queue.map((video, index) => (
            <ListItem
              key={index}
              divider
              secondaryAction={
                <IconButton
                  edge="end"
                  onClick={() => handleDeleteClick(video, index)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemAvatar>
                <Avatar
                  variant="rounded"
                  src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                  alt={video.title}
                />
              </ListItemAvatar>
              <ListItemText
                primary={video.title}
                secondary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Added by: {video.addedBy}
                    </Typography>
                    {video.isPlaylist && (
                      <Chip
                        size="small"
                        icon={<PlaylistIcon />}
                        label="Playlist"
                        color="primary"
                        variant="outlined"
                      />
                    )}
                  </Box>
                }
              />
            </ListItem>
          ))}
          {queue.length === 0 && (
            <ListItem>
              <ListItemText
                primary="No videos in queue"
                secondary="Add videos from the search tab"
              />
            </ListItem>
          )}
        </List>
      </Paper>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">Remove from Queue</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove "{videoToDelete?.video.title}" from
            the queue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={skipDialogOpen}
        onClose={handleSkipCancel}
        aria-labelledby="skip-dialog-title"
      >
        <DialogTitle id="skip-dialog-title">Skip Current Song</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to skip "{currentVideo?.title}" and move to
            the next song?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSkipCancel} color="primary">
            Cancel
          </Button>
          <Button
            onClick={handleSkipConfirm}
            color="warning"
            variant="contained"
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
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Queue;
