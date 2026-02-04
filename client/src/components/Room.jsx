import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Chip,
  Divider,
  Paper,
  Typography,
  IconButton,
  Modal,
  TextField,
  Button,
  Alert,
  Snackbar,
} from "@mui/material";
import YouTube from "react-youtube";
import { useParams } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
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
  const roomContainerRef = useRef(null);

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
  const [settingsState, setSettingsState] = useState({
    roundRobinEnabled: false,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Fullscreen handlers
  const enterFullscreen = useCallback(async () => {
    if (roomContainerRef.current) {
      try {
        if (roomContainerRef.current.requestFullscreen) {
          await roomContainerRef.current.requestFullscreen();
        } else if (roomContainerRef.current.webkitRequestFullscreen) {
          await roomContainerRef.current.webkitRequestFullscreen();
        } else if (roomContainerRef.current.msRequestFullscreen) {
          await roomContainerRef.current.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (err) {
        console.error("[ERR] Failed to enter fullscreen:", err);
      }
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      setIsFullscreen(false);
    } catch (err) {
      console.error("[ERR] Failed to exit fullscreen:", err);
    }
  }, []);

  // Listen for fullscreen change events (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, []);

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
      setSettingsState(room.settings || { roundRobinEnabled: false });
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
    socket.on("settings-updated", (settings) =>
      setSettingsState(settings || { roundRobinEnabled: false })
    );

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("video-changed", handleVideoChanged);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("playback-updated");
      socket.off("settings-updated");
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
      fs: 0, // Disable YouTube's fullscreen button (we use our own)
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
      ref={roomContainerRef}
      sx={{
        display: "flex",
        height: "100vh",
        p: isFullscreen ? 0 : 2,
        gap: isFullscreen ? 0 : 2,
        background: isFullscreen ? "#000" : "linear-gradient(180deg, #0A0A0F 0%, #12121A 100%)",
        color: "text.primary",
        position: "relative",
        overflow: "hidden",
        transition: "padding 0.3s ease, gap 0.3s ease, background 0.3s ease",
      }}
    >
      {/* Background glow - hidden in fullscreen */}
      {!isFullscreen && (
        <>
          <Box
            sx={{
              position: "absolute",
              top: "-20%",
              left: "-10%",
              width: "600px",
              height: "600px",
              background: "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)",
              filter: "blur(60px)",
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: "-20%",
              right: "-10%",
              width: "500px",
              height: "500px",
              background: "radial-gradient(circle, rgba(236, 72, 153, 0.06) 0%, transparent 70%)",
              filter: "blur(60px)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Main Video Player */}
      <Box
        sx={{
          flex: isFullscreen ? 1 : 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          position: isFullscreen ? "absolute" : "relative",
          zIndex: 1,
          ...(isFullscreen && {
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            height: "100%",
          }),
          transition: "all 0.3s ease",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: isFullscreen ? "#000" : "rgba(18, 18, 26, 0.7)",
            backdropFilter: isFullscreen ? "none" : "blur(20px)",
            border: isFullscreen ? "none" : "1px solid rgba(148, 163, 184, 0.1)",
            borderRadius: isFullscreen ? 0 : 3,
            transition: "all 0.3s ease",
          }}
        >
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              bgcolor: "#000",
              borderRadius: isFullscreen ? 0 : 3,
              position: "relative",
              overflow: "hidden",
              transition: "border-radius 0.3s ease",
            }}
          >
            {!isConnected && (
              <Box
                sx={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  background: "rgba(239, 68, 68, 0.2)",
                  backdropFilter: "blur(10px)",
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                <Tooltip title="Disconnected. Attempting to reconnect...">
                  <SignalWifiOffIcon sx={{ color: "#EF4444", fontSize: 20 }} />
                </Tooltip>
                <Typography variant="caption" sx={{ color: "#EF4444" }}>
                  Reconnecting...
                </Typography>
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
                iframeClassName={isFullscreen ? "youtube-player-fullscreen" : "youtube-player"}
                allow="autoplay"
              />
            </Box>
            {/* Exit Fullscreen Button - shown only in fullscreen mode */}
            {isFullscreen && (
              <Tooltip title="Exit Fullscreen">
                <IconButton
                  onClick={exitFullscreen}
                  sx={{
                    position: "absolute",
                    bottom: 24,
                    right: 24,
                    zIndex: 10,
                    color: "#fff",
                    background: "rgba(0, 0, 0, 0.6)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    opacity: 0.7,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      background: "rgba(139, 92, 246, 0.8)",
                      opacity: 1,
                      transform: "scale(1.1)",
                    },
                  }}
                >
                  <FullscreenExitIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Paper>
      </Box>

      {/* Sidebar - hidden in fullscreen */}
      <Box
        sx={{
          flex: 1,
          display: isFullscreen ? "none" : "flex",
          flexDirection: "column",
          gap: 2,
          position: "relative",
          zIndex: 1,
          minWidth: 0,
          maxWidth: 400,
          opacity: isFullscreen ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        {/* Queue Panel */}
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "rgba(18, 18, 26, 0.7)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(148, 163, 184, 0.1)",
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              p: 2,
              borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <QueueMusicIcon sx={{ color: "#8B5CF6", fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Queue
            </Typography>
            {queue.length > 0 && (
              <Chip
                label={queue.length}
                size="small"
                sx={{
                  height: 18,
                  minWidth: 18,
                  fontSize: "0.65rem",
                  background: "rgba(139, 92, 246, 0.2)",
                  color: "#A78BFA",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
            {settingsState.roundRobinEnabled && (
              <Chip
                label="RR"
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.6rem",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10B981",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
            {!isConnected && (
              <Chip
                label="Offline"
                size="small"
                sx={{
                  ml: "auto",
                  height: 18,
                  fontSize: "0.6rem",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#EF4444",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
          </Box>

          {queue.length === 0 && (
            <Box
              sx={{
                p: 2,
                mx: 2,
                mt: 2,
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: 2,
              }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                This application uses YouTube API Services. By using this
                service, you agree to the{" "}
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#60A5FA", textDecoration: "underline" }}
                >
                  YouTube Terms of Service
                </a>
                .
              </Typography>
            </Box>
          )}

          {/* Queue List */}
          <Box sx={{ flex: 1, overflow: "auto", px: 1.5, py: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            {queue.map((video, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  p: 1,
                  borderRadius: 1.5,
                  background: "rgba(139, 92, 246, 0.05)",
                  border: "1px solid rgba(148, 163, 184, 0.05)",
                  transition: "all 0.2s ease",
                  "&:hover": {
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
                    width: 56,
                    height: 32,
                    borderRadius: 0.75,
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 500,
                      color: "text.primary",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.3,
                    }}
                  >
                    {video.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.65rem",
                      display: "block",
                    }}
                  >
                    {video.addedBy}
                  </Typography>
                </Box>
              </Box>
            ))}

            {/* Empty State */}
            {queue.length === 0 && (
              <Box
                sx={{
                  py: 3,
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                <Typography variant="caption">Queue is empty</Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* QR Code Panel */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: "rgba(18, 18, 26, 0.7)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(148, 163, 184, 0.1)",
            borderRadius: 3,
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
              p: 2,
              background: "white",
              borderRadius: 2,
              transition: "transform 0.2s",
              "&:hover": {
                transform: "scale(1.02)",
              },
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
          <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: "rgba(148, 163, 184, 0.1)" }} />
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 1.5 }}>
            <Tooltip title="Settings">
              <IconButton
                onClick={handleSettingsOpen}
                sx={{
                  color: "#8B5CF6",
                  background: "rgba(139, 92, 246, 0.1)",
                  "&:hover": {
                    background: "rgba(139, 92, 246, 0.2)",
                  },
                }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton
                onClick={enterFullscreen}
                sx={{
                  color: "#8B5CF6",
                  background: "rgba(139, 92, 246, 0.1)",
                  "&:hover": {
                    background: "rgba(139, 92, 246, 0.2)",
                  },
                }}
              >
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>
      </Box>

      {/* Settings Modal */}
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
            width: 420,
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5)",
            p: 4,
            borderRadius: 3,
          }}
        >
          <Typography
            id="settings-modal-title"
            variant="h6"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 600, mb: 3 }}
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
            sx={{ mt: 3, display: "flex", justifyContent: "flex-end", gap: 2 }}
          >
            <Button
              onClick={handleSettingsClose}
              sx={{
                color: "text.secondary",
                "&:hover": { background: "rgba(148, 163, 184, 0.1)" },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              variant="contained"
              sx={{
                background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
                },
              }}
            >
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
          sx={{
            background:
              notification.severity === "error"
                ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                : notification.severity === "success"
                ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Room;
