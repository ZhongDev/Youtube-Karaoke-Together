import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Divider,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Modal,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import YouTube from "react-youtube";
import { useParams } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import Tooltip from "@mui/material/Tooltip";
import useSocket from "../hooks/useSocket";
import config from "../ytkt-config.json";

// Get the initial backend URL from config
const getInitialBackendUrl = () => {
  const host =
    localStorage.getItem("backendHost") ||
    `${config.backend.ssl ? "https" : "http"}://${config.backend.hostname}`;
  const port = localStorage.getItem("backendPort") || `${config.backend.port}`;
  return `${host}:${port}`;
};

const getInitialBackendHost = () => {
  return (
    localStorage.getItem("backendHost") ||
    `${config.backend.ssl ? "https" : "http"}://${config.backend.hostname}`
  );
};

const getInitialFrontendPort = () => {
  return localStorage.getItem("frontendPort") || config.frontend.port;
};

const getInitialBackendPort = () => {
  return localStorage.getItem("backendPort") || config.backend.port;
};

const Room = () => {
  const { roomId } = useParams();
  const playerRef = useRef(null);
  const lastVideoIdRef = useRef(null);

  const [qrCode, setQrCode] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backendUrl, setBackendUrl] = useState(getInitialBackendUrl());
  const [backendHost, setBackendHost] = useState(getInitialBackendHost());
  const [backendPort, setBackendPort] = useState(getInitialBackendPort());
  const [frontendPort, setFrontendPort] = useState(getInitialFrontendPort());
  const [currentVideo, setCurrentVideo] = useState(null);
  const [initalStartSeconds, setInitalStartSeconds] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playback, setPlayback] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // Use the new socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
    joinRoom,
  } = useSocket(backendUrl);

  // Compute resume position based on playback snapshot
  const computeStartSeconds = useCallback(
    (videoId) => {
      if (!playback) return 0;
      if (playback.videoId && playback.videoId !== videoId) return 0;
      const pos =
        typeof playback.positionSec === "number" ? playback.positionSec : 0;
      const dur =
        typeof playback.durationSec === "number" ? playback.durationSec : null;
      const clamped =
        dur != null
          ? Math.min(Math.max(0, pos), Math.max(0, dur - 0.75))
          : Math.max(0, pos);
      return clamped;
    },
    [playback]
  );

  // Save backend URL to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("backendHost", backendHost);
  }, [backendHost]);

  useEffect(() => {
    localStorage.setItem("backendPort", backendPort);
  }, [backendPort]);

  useEffect(() => {
    localStorage.setItem("frontendPort", frontendPort);
  }, [frontendPort]);

  const handleSettingsOpen = () => setSettingsOpen(true);
  const handleSettingsClose = () => setSettingsOpen(false);

  const handleBackendHostChange = (event) => {
    setBackendHost(event.target.value);
  };

  const handleBackendPortChange = (event) => {
    setBackendPort(event.target.value);
  };

  const handleFrontendPortChange = (event) => {
    setFrontendPort(event.target.value);
  };

  // Update the fetchQRCode function to include roomId in its dependencies
  const fetchQRCode = useCallback(async () => {
    const API_URL = backendUrl;
    console.log("[INFO] API_URL:", API_URL);
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/qr`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          hostname: `${backendHost}:${frontendPort}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setQrCode(data.qrCode);
      console.log("[INFO] QR code fetched successfully");
    } catch (error) {
      console.error("[ERR] Failed to fetch QR code:", error);
      // Show user-friendly error message
      setQrCode(null);
    }
  }, [backendUrl, roomId, backendHost, frontendPort]);

  const handleSaveSettings = () => {
    const fullBackendUrl = `${backendHost}:${backendPort}`;
    setBackendUrl(fullBackendUrl);
    handleSettingsClose();
    // Socket will be recreated due to the useEffect dependency on backendUrl
    // Explicitly fetch new QR code after URL change
    fetchQRCode();
  };

  // Add effect to refetch QR code when backend URL changes
  useEffect(() => {
    if (roomId) {
      fetchQRCode();
    }
  }, [roomId, fetchQRCode]);

  // Handle socket connection and room joining
  useEffect(() => {
    if (!roomId) {
      console.error("[ERR] No roomId provided");
      return;
    }

    console.log("[INFO] Room component mounted, roomId:", roomId);

    if (!socket) return;

    // Join room when connected
    if (isConnected) {
      joinRoom(roomId);
    }

    const handleRoomState = (room) => {
      console.log("[INFO] Received room state:", room);
      setCurrentVideo(room.currentVideo);
      setQueue(room.queue || []);
      setPlayback(room.playback || null);
      setIsLoading(false);

      if (room.currentVideo && playerRef.current) {
        const incomingId = room.currentVideo.id;
        const alreadyLoadedSameVideo = lastVideoIdRef.current === incomingId;
        if (!alreadyLoadedSameVideo) {
          const startSeconds = computeStartSeconds(incomingId);
          playerRef.current.loadVideoById({
            videoId: incomingId,
            startSeconds,
          });
          playerRef.current.playVideo();
          lastVideoIdRef.current = incomingId;
        }
      }
    };

    const handleVideoChanged = (video) => {
      console.log("[INFO] Video changed:", video);
      setCurrentVideo(video);

      if (video === null) {
        if (playerRef.current) {
          playerRef.current.pauseVideo();
          playerRef.current.clearVideo();
        }
        lastVideoIdRef.current = null;
      } else if (playerRef.current) {
        const incomingId = video.id;
        const alreadyLoadedSameVideo = lastVideoIdRef.current === incomingId;
        if (!alreadyLoadedSameVideo) {
          console.log("[INFO] Loading new video in player");
          const startSeconds = computeStartSeconds(incomingId);
          playerRef.current.loadVideoById({
            videoId: incomingId,
            startSeconds,
          });
          playerRef.current.playVideo();
          lastVideoIdRef.current = incomingId;
        }
      }
    };

    const handleQueueUpdated = (newQueue) => {
      console.log("[INFO] Queue updated:", newQueue);
      setQueue(newQueue);
    };

    socket.on("room-state", handleRoomState);
    socket.on("video-changed", handleVideoChanged);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("playback-updated", (pb) => setPlayback(pb));

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("video-changed", handleVideoChanged);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("playback-updated");
    };
  }, [roomId, socket, isConnected, joinRoom, currentVideo]);

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

  const onPlayerReady = (event) => {
    console.log("[INFO] Player ready");
    playerRef.current = event.target;
    setIsPlayerReady(true);
    // If there is a currentVideo known from server state, ensure it is loaded immediately
    try {
      const incomingId = currentVideo?.id;
      const startSeconds = computeStartSeconds(incomingId);
      if (incomingId) {
        const alreadyLoadedSameVideo = lastVideoIdRef.current === incomingId;
        if (!alreadyLoadedSameVideo) {
          playerRef.current.loadVideoById({
            videoId: incomingId,
            startSeconds: startSeconds,
          });
          setInitalStartSeconds(startSeconds);
          console.log(
            "[INFO] Loaded video:",
            incomingId,
            "with startSeconds:",
            startSeconds
          );
          playerRef.current.playVideo();
          lastVideoIdRef.current = incomingId;
        } else {
          playerRef.current.seekTo(Math.round(initalStartSeconds ?? 0), true);
          console.log(
            "[INFO] Seeking to:",
            initalStartSeconds ?? 0,
            "for video:",
            incomingId
          );
        }
      }
    } catch (_) {}
  };

  // Ensure we load the current room video once the player is ready or currentVideo changes
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;
    if (!currentVideo || !currentVideo.id) return;

    const incomingId = currentVideo.id;
    const alreadyLoadedSameVideo = lastVideoIdRef.current === incomingId;
    if (!alreadyLoadedSameVideo) {
      try {
        const startSeconds = computeStartSeconds(incomingId);
        playerRef.current.loadVideoById({ videoId: incomingId, startSeconds });
        playerRef.current.playVideo();
        lastVideoIdRef.current = incomingId;
      } catch (_) {}
    }
  }, [isPlayerReady, currentVideo, playerRef, computeStartSeconds]);

  const onVideoEnd = () => {
    // Only proceed if we actually loaded the currentVideo into the player
    if (!currentVideo || lastVideoIdRef.current !== currentVideo.id) return;
    console.log("[INFO] Video ended, requesting next video");
    if (socket) {
      socket.emit("play-next", roomId);
    }
  };

  // Periodically publish playback time to server while video is playing
  useEffect(() => {
    const interval = setInterval(() => {
      if (!socket || !playerRef.current) return;
      try {
        const state = playerRef.current.getPlayerState();
        // 1=playing, 2=paused, 3=buffering, 0=ended, -1=unstarted, 5=cued
        const stateMap = {
          [-1]: "unstarted",
          0: "ended",
          1: "playing",
          2: "paused",
          3: "buffering",
          5: "cued",
        };
        const positionSec = playerRef.current.getCurrentTime?.() || 0;
        const durationSec = playerRef.current.getDuration?.() || null;
        socket.emit("playback-state", {
          roomId,
          state: stateMap[state] || "unknown",
          positionSec,
          durationSec,
          videoId: currentVideo?.id || null,
        });
      } catch (_) {}
    }, 1000);
    return () => clearInterval(interval);
  }, [socket, roomId, currentVideo]);

  // Keep YouTube player mounted at all times; display disconnect indicator
  const opts = {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      mute: 0,
      enablejsapi: 1,
    },
  };

  // If socket disconnects, try to keep playback going
  useEffect(() => {
    if (!isConnected && playerRef.current) {
      try {
        playerRef.current.playVideo();
      } catch (_) {}
    }
  }, [isConnected]);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        p: 2,
        gap: 2,
        bgcolor: "background.default",
        color: "text.primary",
      }}
    >
      <Box sx={{ flex: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        <Paper
          elevation={3}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: "background.paper",
          }}
        >
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              bgcolor: "black",
              position: "relative",
            }}
          >
            {!isConnected && (
              <Box sx={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>
                <Tooltip title="Disconnected. Attempting to reconnect...">
                  <SignalWifiOffIcon color="error" />
                </Tooltip>
              </Box>
            )}
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <YouTube
                videoId={currentVideo?.id || undefined}
                opts={opts}
                onReady={onPlayerReady}
                onEnd={onVideoEnd}
                onError={(error) => {
                  console.error("[ERR] YouTube player error:", error);
                  // Avoid skipping ahead before first load completes
                  if (
                    !currentVideo ||
                    lastVideoIdRef.current !== currentVideo.id
                  )
                    return;
                  if (socket) {
                    socket.emit("play-next", roomId);
                  }
                }}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                iframeClassName="youtube-player"
                allow="autoplay"
              />
            </Box>
          </Box>
        </Paper>
      </Box>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Paper
          elevation={3}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: "background.paper",
          }}
        >
          <Typography
            variant="h6"
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          >
            Queue {!isConnected && "(Disconnected)"}
          </Typography>

          {queue.length === 0 && (
            <Box
              sx={{
                p: 2,
                bgcolor: "info.light",
                color: "info.contrastText",
                fontSize: "0.75rem",
              }}
            >
              <Typography variant="caption">
                This application uses YouTube API Services. By using this
                service, you agree to the{" "}
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  YouTube Terms of Service
                </a>
                .
              </Typography>
            </Box>
          )}
          <List sx={{ flex: 1, overflow: "auto" }}>
            {queue.map((video, index) => (
              <ListItem key={index} divider>
                <ListItemAvatar>
                  <Avatar
                    variant="rounded"
                    src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                    alt={video.title}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={video.title}
                  secondary={`Added by: ${video.addedBy}`}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
        <Paper
          elevation={3}
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            bgcolor: "background.paper",
          }}
        >
          <Box
            component="a"
            href={`${backendHost}:${frontendPort}/control/${roomId}`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              flex: 3,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={qrCode}
              alt="Room QR Code"
              style={{
                maxWidth: "100%",
                justifyContent: "center",
                alignItems: "center",
              }}
            />
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
          <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <IconButton onClick={handleSettingsOpen} color="primary">
              <SettingsIcon />
            </IconButton>
          </Box>
        </Paper>
      </Box>

      <Modal
        open={settingsOpen}
        onClose={handleSettingsClose}
        aria-labelledby="settings-modal-title"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 4,
            borderRadius: 1,
          }}
        >
          <Typography
            id="settings-modal-title"
            variant="h6"
            component="h2"
            gutterBottom
          >
            Backend Settings
          </Typography>
          <TextField
            fullWidth
            label="Backend Host"
            value={backendHost}
            onChange={handleBackendHostChange}
            margin="normal"
            helperText="Enter the backend URL (e.g., http://localhost)"
          />
          <TextField
            fullWidth
            label="Backend Port"
            value={backendPort}
            onChange={handleBackendPortChange}
            margin="normal"
            helperText="Enter the backend port (e.g., 8443)"
            type="number"
          />
          <TextField
            fullWidth
            label="Frontend Port"
            value={frontendPort}
            onChange={handleFrontendPortChange}
            margin="normal"
            helperText="Enter the frontend port (e.g., 443)"
            type="number"
          />
          <Box
            sx={{ mt: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}
          >
            <Button onClick={handleSettingsClose}>Cancel</Button>
            <Button onClick={handleSaveSettings} variant="contained">
              Save
            </Button>
          </Box>
        </Box>
      </Modal>

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

export default Room;
