import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Box,
  Chip,
  Divider,
  Paper,
  Typography,
  IconButton,
  Modal,
  Button,
  Alert,
  Snackbar,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import YouTube from "react-youtube";
import { useParams, useSearchParams } from "react-router-dom";
import SettingsIcon from "@mui/icons-material/Settings";
import SignalWifiOffIcon from "@mui/icons-material/SignalWifiOff";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Tooltip from "@mui/material/Tooltip";
import useSocket from "../hooks/useSocket";
import { getBackendUrl, getStoredPlayerKey, storePlayerKey } from "../config";

const Room = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerRef = useRef(null);
  const lastVideoIdRef = useRef(null);
  const roomContainerRef = useRef(null);

  // Get playerKey from URL or localStorage
  const urlPlayerKey = searchParams.get('key');
  const storedPlayerKey = getStoredPlayerKey(roomId);
  const playerKey = urlPlayerKey || storedPlayerKey;

  // Store playerKey if it came from URL
  useEffect(() => {
    if (urlPlayerKey && roomId) {
      storePlayerKey(roomId, urlPlayerKey);
    }
  }, [urlPlayerKey, roomId]);

  const [qrCode, setQrCode] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [controllers, setControllers] = useState([]);
  const [allowNewControllers, setAllowNewControllers] = useState(true);

  // Use the socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
    joinRoomAdmin,
  } = useSocket();

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

  const handleSettingsOpen = () => setSettingsOpen(true);
  const handleSettingsClose = () => setSettingsOpen(false);

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

  // Fetch QR code (requires playerKey)
  const fetchQRCode = useCallback(async () => {
    if (!playerKey) {
      console.log("[WARN] No playerKey available for QR fetch");
      return;
    }

    const backendUrl = getBackendUrl();
    try {
      const response = await fetch(`${backendUrl}/api/rooms/${roomId}/qr`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${playerKey}`,
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
      setQrCode(null);
    }
  }, [roomId, playerKey]);

  // Fetch QR code on mount and when playerKey becomes available
  useEffect(() => {
    if (roomId && playerKey) {
      fetchQRCode();
    }
  }, [roomId, playerKey, fetchQRCode]);

  // Handle socket connection and room joining as admin
  useEffect(() => {
    if (!roomId) {
      console.error("[ERR] No roomId provided");
      return;
    }

    if (!playerKey) {
      console.error("[ERR] No playerKey available");
      setNotification({
        open: true,
        message: "Missing player key. Please create a new room from the home page.",
        severity: "error",
      });
      return;
    }

    console.log("[INFO] Room component mounted, roomId:", roomId);

    if (!socket) return;

    // Join room as admin when connected
    if (isConnected) {
      joinRoomAdmin(roomId, playerKey);
    }

    const handleRoomStateAdmin = (room) => {
      console.log("[INFO] Received admin room state:", room);
      setCurrentVideo(room.currentVideo);
      setQueue(room.queue || []);
      setPlayback(room.playback || null);
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setControllers(room.controllers || []);
      setAllowNewControllers(room.allowNewControllers !== false);
      setIsLoading(false);
    };

    const handleRoomState = (room) => {
      console.log("[INFO] Received room state:", room);
      setCurrentVideo(room.currentVideo);
      setQueue(room.queue || []);
      setPlayback(room.playback || null);
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setAllowNewControllers(room.allowNewControllers !== false);
      setIsLoading(false);
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
      }
      // Note: actual video loading is handled by the separate useEffect that watches currentVideo
    };

    const handleQueueUpdated = (newQueue) => {
      console.log("[INFO] Queue updated:", newQueue);
      setQueue(newQueue);
    };

    const handleControllersUpdated = (newControllers) => {
      console.log("[INFO] Controllers updated:", newControllers);
      setControllers(newControllers);
    };

    const handleRegistrationStatus = ({ allowNewControllers: allow }) => {
      setAllowNewControllers(allow);
    };

    socket.on("room-state-admin", handleRoomStateAdmin);
    socket.on("room-state", handleRoomState);
    socket.on("video-changed", handleVideoChanged);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("playback-updated", (pb) => setPlayback(pb));
    socket.on("settings-updated", (settings) =>
      setSettingsState(settings || { roundRobinEnabled: false })
    );
    socket.on("controllers-updated", handleControllersUpdated);
    socket.on("registration-status", handleRegistrationStatus);

    return () => {
      socket.off("room-state-admin", handleRoomStateAdmin);
      socket.off("room-state", handleRoomState);
      socket.off("video-changed", handleVideoChanged);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("playback-updated");
      socket.off("settings-updated");
      socket.off("controllers-updated", handleControllersUpdated);
      socket.off("registration-status", handleRegistrationStatus);
    };
  }, [roomId, socket, isConnected, joinRoomAdmin, playerKey]);

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

  const onPlayerReady = (event) => {
    console.log("[INFO] Player ready");
    playerRef.current = event.target;
    setIsPlayerReady(true);
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
    if (!currentVideo || lastVideoIdRef.current !== currentVideo.id) return;
    console.log("[INFO] Video ended, requesting next video");
    if (socket && playerKey) {
      socket.emit("player-play-next", { roomId, playerKey });
    }
  };

  // Periodically publish playback time to server while video is playing
  useEffect(() => {
    if (!playerKey || !socket || !isConnected) return;

    const interval = setInterval(() => {
      if (!playerRef.current) return;
      try {
        const player = playerRef.current;
        // YouTube IFrame API returns these as functions
        const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
        const stateMap = {
          [-1]: "unstarted",
          0: "ended",
          1: "playing",
          2: "paused",
          3: "buffering",
          5: "cued",
        };
        const positionSec = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
        const durationSec = typeof player.getDuration === 'function' ? player.getDuration() : null;
        
        socket.emit("playback-state", {
          roomId,
          playerKey,
          state: stateMap[state] || "unknown",
          positionSec: positionSec || 0,
          durationSec: durationSec > 0 ? durationSec : null,
          videoId: currentVideo?.id || null,
        });
      } catch (err) {
        console.error("[ERR] Failed to get playback state:", err);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [socket, roomId, currentVideo, playerKey, isConnected]);

  // Admin actions
  const handleToggleController = (controllerId, enabled) => {
    if (socket && playerKey) {
      socket.emit("admin-toggle-controller", {
        roomId,
        playerKey,
        controllerId,
        enabled,
      });
    }
  };

  const handleRemoveController = (controllerId) => {
    if (socket && playerKey) {
      socket.emit("admin-remove-controller", {
        roomId,
        playerKey,
        controllerId,
      });
    }
  };

  const handleToggleRegistration = (allow) => {
    if (socket && playerKey) {
      socket.emit("admin-toggle-registration", {
        roomId,
        playerKey,
        allow,
      });
      setAllowNewControllers(allow);
    }
  };

  // YouTube player options
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
      fs: 0,
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
          {qrCode ? (
            <Box
              sx={{
                flex: 3,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 2,
                background: "white",
                borderRadius: 2,
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
          ) : (
            <Box
              sx={{
                flex: 3,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 2,
                background: "rgba(148, 163, 184, 0.1)",
                borderRadius: 2,
              }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {playerKey ? "Loading QR..." : "Missing player key"}
              </Typography>
            </Box>
          )}
          <Divider orientation="vertical" flexItem sx={{ mx: 2, borderColor: "rgba(148, 163, 184, 0.1)" }} />
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 1.5 }}>
            <Tooltip title="Room Settings">
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

      {/* Settings Modal (Admin Panel) */}
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
            width: 500,
            maxHeight: "80vh",
            overflow: "auto",
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
            Room Admin
          </Typography>

          {/* Registration Toggle */}
          <Box
            sx={{
              mb: 3,
              p: 2,
              background: "rgba(139, 92, 246, 0.05)",
              borderRadius: 2,
              border: "1px solid rgba(148, 163, 184, 0.05)",
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={allowNewControllers}
                  onChange={(e) => handleToggleRegistration(e.target.checked)}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                      color: "#10B981",
                    },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: "#10B981",
                    },
                  }}
                />
              }
              label="Allow new controller registrations"
            />
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 1 }}>
              When disabled, new users cannot join via the QR code.
            </Typography>
          </Box>

          {/* Controllers List */}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
            Connected Controllers ({controllers.length})
          </Typography>

          {controllers.length === 0 ? (
            <Box
              sx={{
                p: 3,
                textAlign: "center",
                background: "rgba(148, 163, 184, 0.05)",
                borderRadius: 2,
                border: "1px dashed rgba(148, 163, 184, 0.2)",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                No controllers registered yet
              </Typography>
            </Box>
          ) : (
            <List sx={{ bgcolor: "transparent" }}>
              {controllers.map((controller) => (
                <ListItem
                  key={controller.id}
                  sx={{
                    mb: 1,
                    borderRadius: 2,
                    background: controller.enabled
                      ? "rgba(16, 185, 129, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                    border: controller.enabled
                      ? "1px solid rgba(16, 185, 129, 0.2)"
                      : "1px solid rgba(239, 68, 68, 0.2)",
                  }}
                >
                  <ListItemText
                    primary={controller.name}
                    secondary={
                      <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          ID: {controller.id}
                        </Typography>
                        {controller.enabled ? (
                          <Chip
                            label="Active"
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: "0.6rem",
                              background: "rgba(16, 185, 129, 0.2)",
                              color: "#10B981",
                            }}
                          />
                        ) : (
                          <Chip
                            label="Disabled"
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: "0.6rem",
                              background: "rgba(239, 68, 68, 0.2)",
                              color: "#EF4444",
                            }}
                          />
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={controller.enabled ? "Disable" : "Enable"}>
                      <IconButton
                        edge="end"
                        onClick={() => handleToggleController(controller.id, !controller.enabled)}
                        sx={{
                          mr: 1,
                          color: controller.enabled ? "#F59E0B" : "#10B981",
                        }}
                      >
                        {controller.enabled ? <BlockIcon /> : <CheckCircleIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        edge="end"
                        onClick={() => handleRemoveController(controller.id)}
                        sx={{ color: "#EF4444" }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}

          <Box
            sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}
          >
            <Button
              onClick={handleSettingsClose}
              variant="contained"
              sx={{
                background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
                },
              }}
            >
              Close
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
