import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  TextField,
  Button,
  IconButton,
  Paper,
  Typography,
  Chip,
  BottomNavigation,
  BottomNavigationAction,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Switch,
  LinearProgress,
  Alert,
  Snackbar,
} from "@mui/material";
import {
  Search as SearchIcon,
  QueueMusic as QueueIcon,
  Settings as SettingsIcon,
  SkipNext as SkipIcon,
  Add as AddIcon,
  PlaylistAdd as PlaylistIcon,
} from "@mui/icons-material";
import { useParams } from "react-router-dom";
import Queue from "./Queue.jsx";
import Settings from "./Settings.jsx";
import useSocket from "../hooks/useSocket";
import config from "../ytkt-config.json";

const Control = () => {
  const { roomId } = useParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [username, setUsername] = useState(() => {
    const savedUsername = localStorage.getItem("karaokeUsername");
    return savedUsername || "";
  });
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("karaokeRememberMe") === "true";
  });
  const [showNameModal, setShowNameModal] = useState(() => {
    const rememberMe = localStorage.getItem("karaokeRememberMe");
    const hasUsername = localStorage.getItem("karaokeUsername");

    // Show modal if user hasn't chosen to remember (rememberMe !== 'true')
    // This covers:
    // 1. First time users (rememberMe is null)
    // 2. Users who explicitly chose not to remember (rememberMe === 'false')
    // 3. Users with no username
    if (rememberMe !== "true") {
      return true;
    }

    // If remember is true but no username, still show modal
    return !hasUsername;
  });
  const [currentTab, setCurrentTab] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [settingsState, setSettingsState] = useState({
    roundRobinEnabled: false,
  });
  const [playback, setPlayback] = useState(null);
  const [currentVideo, setCurrentVideo] = useState(null);
  const loadingRef = useRef(false);
  const observer = useRef();

  // Use the socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
    joinRoom,
  } = useSocket();

  const loadMoreResults = useCallback(async () => {
    if (!nextPageToken || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const query = searchQuery.trim();
      console.log(
        "[INFO] Loading more results for:",
        query,
        "with token:",
        nextPageToken
      );
      const API_URL = `${config.backend.ssl ? "https" : "http"}://${
        config.backend.hostname
      }:${config.backend.port}`;
      const response = await fetch(
        `${API_URL}/api/search?query=${encodeURIComponent(
          query
        )}&pageToken=${encodeURIComponent(nextPageToken)}`
      );
      if (!response.ok) {
        throw new Error(`Load more failed with status: ${response.status}`);
      }
      const data = await response.json();
      console.log("[INFO] Load more results:", data);

      const transformedResults = data.items.map((item) => ({
        id: item.id.videoId || item.id.playlistId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        isPlaylist: !!item.id.playlistId,
      }));

      setSearchResults((prevResults) => {
        const existingIds = new Set(prevResults.map((r) => r.id));
        const newResults = transformedResults.filter(
          (r) => !existingIds.has(r.id)
        );
        return [...prevResults, ...newResults];
      });

      setNextPageToken(data.nextPageToken);
    } catch (error) {
      console.error("[ERR] Load more failed:", error);
    } finally {
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [nextPageToken, searchQuery]);

  const lastResultRef = useCallback(
    (node) => {
      if (loadingRef.current || !nextPageToken) return;

      if (observer.current) {
        observer.current.disconnect();
      }

      observer.current = new IntersectionObserver(
        (entries) => {
          if (
            entries[0].isIntersecting &&
            !loadingRef.current &&
            nextPageToken
          ) {
            loadMoreResults();
          }
        },
        {
          threshold: 0.5,
        }
      );

      if (node) {
        observer.current.observe(node);
      }
    },
    [nextPageToken, loadMoreResults]
  );

  // Handle initial username setup
  useEffect(() => {
    const rememberMe = localStorage.getItem("karaokeRememberMe");
    const savedUsername = localStorage.getItem("karaokeUsername");

    // If user chose not to remember, we should clear the username on page load
    // to force them to enter it again
    if (rememberMe === "false") {
      localStorage.removeItem("karaokeUsername");
      setUsername("");
    } else if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

  // Join room when connected (send username for RR tracking)
  useEffect(() => {
    if (!roomId) {
      console.error("[ERR] No roomId provided");
      return;
    }

    console.log("[INFO] Control component mounted, roomId:", roomId);

    if (isConnected) {
      joinRoom(roomId, username);
    }
  }, [roomId, isConnected, joinRoom, username]);

  // Listen for room state, settings and playback updates
  useEffect(() => {
    if (!socket) return;
    const handleRoomState = (room) => {
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setPlayback(room.playback || null);
      setCurrentVideo(room.currentVideo || null);
    };
    const handleSettingsUpdated = (newSettings) =>
      setSettingsState(newSettings || { roundRobinEnabled: false });
    const handlePlaybackUpdated = (pb) => setPlayback(pb);
    const handleVideoChanged = (video) => setCurrentVideo(video);

    socket.on("room-state", handleRoomState);
    socket.on("settings-updated", handleSettingsUpdated);
    socket.on("playback-updated", handlePlaybackUpdated);
    socket.on("video-changed", handleVideoChanged);

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("settings-updated", handleSettingsUpdated);
      socket.off("playback-updated", handlePlaybackUpdated);
      socket.off("video-changed", handleVideoChanged);
    };
  }, [socket, roomId]);

  // Show connection error notifications
  useEffect(() => {
    if (connectionError) {
      setNotification({
        open: true,
        message: `Connection Error: ${connectionError}`,
        severity: "error",
      });
    }
  }, [connectionError]);

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

  // Listen for username changes from Settings
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "karaokeUsername" && e.newValue) {
        setUsername(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setNextPageToken(null);
    setHasSearched(true); // Mark that a search has been performed
    try {
      console.log("[INFO] Searching for:", query);
      const API_URL = `${config.backend.ssl ? "https" : "http"}://${
        config.backend.hostname
      }:${config.backend.port}`;
      const response = await fetch(
        `${API_URL}/api/search?query=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }
      const data = await response.json();
      console.log("[INFO] Search results:", data);

      const transformedResults = data.items.map((item) => ({
        id: item.id.videoId || item.id.playlistId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        isPlaylist: !!item.id.playlistId,
      }));

      console.log("[INFO] Transformed results:", transformedResults);
      setSearchResults(transformedResults);
      setNextPageToken(data.nextPageToken);
    } catch (error) {
      console.error("[ERR] Search failed:", error);
      setSearchResults([]);
      setNotification({
        open: true,
        message: `Search failed: ${error.message}`,
        severity: "error",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const addToQueue = (video) => {
    if (!username.trim()) {
      setCurrentTab(2); // Switch to settings tab
      setNotification({
        open: true,
        message: "Please set your name in settings first!",
        severity: "warning",
      });
      return;
    }

    if (!isConnected) {
      setNotification({
        open: true,
        message: "Not connected to server. Please wait for connection.",
        severity: "error",
      });
      return;
    }

    console.log("[INFO] Adding to queue:", video);
    const videoData = {
      ...video,
      addedBy: username,
    };
    socket.emit("add-to-queue", { roomId, video: videoData });

    setNotification({
      open: true,
      message: `Added "${video.title}" to queue!`,
      severity: "success",
    });
  };

  const handleNameSubmit = () => {
    if (username.trim()) {
      // Always save the username to localStorage
      localStorage.setItem("karaokeUsername", username);

      if (rememberMe) {
        localStorage.setItem("karaokeRememberMe", "true");
      } else {
        localStorage.removeItem("karaokeRememberMe");
      }
      setShowNameModal(false);
    }
  };

  const handleSkip = () => {
    if (!username.trim()) {
      setShowNameModal(true);
      return;
    }
    socket.emit("play-next", roomId);
  };

  const toggleRoundRobin = (event) => {
    const enabled = !!event.target.checked;
    setSettingsState((prev) => ({ ...prev, roundRobinEnabled: enabled }));
    if (socket) {
      socket.emit("update-settings", {
        roomId,
        settings: { roundRobinEnabled: enabled },
      });
    }
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

  const renderSearchTab = () => (
    <Box sx={{ maxWidth: 600, mx: "auto", width: "100%", p: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 2,
          background: "rgba(18, 18, 26, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          borderRadius: 3,
        }}
      >
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          Search
        </Typography>
        {!hasSearched && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: 2,
            }}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              This service uses YouTube API Services. By using this app, you
              agree to the{" "}
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
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search for a video..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!isConnected || isSearching}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={!isConnected || isSearching || !searchQuery.trim()}
            sx={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              minWidth: 100,
              "&:hover": {
                background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
              },
              "&:disabled": {
                background: "rgba(148, 163, 184, 0.2)",
              },
            }}
          >
            {isSearching ? "..." : "Search"}
          </Button>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: 2,
          background: "rgba(18, 18, 26, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          borderRadius: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Search Results
          </Typography>
          {searchResults.length > 0 && (
            <Chip
              label={searchResults.length}
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
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {searchResults.map((result, index) => (
            <Box
              key={result.id}
              ref={index === searchResults.length - 1 ? lastResultRef : null}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                p: 1.5,
                borderRadius: 2,
                background: "rgba(139, 92, 246, 0.05)",
                border: "1px solid rgba(148, 163, 184, 0.08)",
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
                src={`https://img.youtube.com/vi/${result.id}/mqdefault.jpg`}
                alt={result.title}
                sx={{
                  width: 80,
                  height: 45,
                  borderRadius: 1,
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
                    lineHeight: 1.3,
                  }}
                >
                  {result.title}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {result.channelTitle}
                  </Typography>
                  {result.isPlaylist && (
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

              {/* Add Button */}
              <IconButton
                onClick={() => addToQueue(result)}
                disabled={!isConnected}
                sx={{
                  flexShrink: 0,
                  color: "#10B981",
                  background: "rgba(16, 185, 129, 0.1)",
                  "&:hover": {
                    background: "rgba(16, 185, 129, 0.2)",
                  },
                  "&:disabled": {
                    color: "rgba(148, 163, 184, 0.3)",
                    background: "rgba(148, 163, 184, 0.05)",
                  },
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>
          ))}

          {/* Loading More Indicator */}
          {isLoadingMore && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} sx={{ color: "#8B5CF6" }} />
            </Box>
          )}

          {/* Empty State */}
          {searchResults.length === 0 && hasSearched && !isSearching && (
            <Box
              sx={{
                py: 4,
                textAlign: "center",
                color: "text.secondary",
              }}
            >
              <Typography variant="body2">No results found</Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );

  const renderControlsTab = () => (
    <Box sx={{ maxWidth: 600, mx: "auto", width: "100%", p: 2 }}>
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
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
          Controls{" "}
          {!isConnected && (
            <Chip
              label="Disconnected"
              size="small"
              sx={{
                ml: 1,
                background: "rgba(239, 68, 68, 0.2)",
                color: "#EF4444",
              }}
            />
          )}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
                checked={!!settingsState.roundRobinEnabled}
                onChange={toggleRoundRobin}
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: "#8B5CF6",
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    backgroundColor: "#8B5CF6",
                  },
                }}
              />
            }
            label="Round-robin queue"
          />
        </Box>
        {currentVideo && (
          <Box
            sx={{
              mb: 3,
              p: 3,
              background: "rgba(139, 92, 246, 0.1)",
              borderRadius: 2,
              border: "1px solid rgba(139, 92, 246, 0.2)",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ color: "#8B5CF6", fontWeight: 600, mb: 1 }}
            >
              Now Playing
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 500, mb: 2 }}>
              {currentVideo.title}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
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
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              State: {playback?.state || "unknown"}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<SkipIcon />}
            onClick={handleSkip}
            disabled={!isConnected}
            sx={{
              background: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)",
              px: 4,
              py: 1.5,
              "&:hover": {
                background: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
              },
              "&:disabled": {
                background: "rgba(148, 163, 184, 0.2)",
              },
            }}
          >
            Skip Current Song
          </Button>
        </Box>
      </Paper>
    </Box>
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        pb: 8,
        background: "linear-gradient(180deg, #0A0A0F 0%, #12121A 100%)",
      }}
    >
      {/* Name Entry Dialog */}
      <Dialog
        open={showNameModal}
        onClose={() => {}}
        disableEscapeKeyDown
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle sx={{ textAlign: "center", fontWeight: 600, pt: 4 }}>
          Enter Your Name
        </DialogTitle>
        <DialogContent sx={{ px: 3 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Your Name"
            fullWidth
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleNameSubmit()}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                sx={{
                  color: "text.secondary",
                  "&.Mui-checked": { color: "#8B5CF6" },
                }}
              />
            }
            label="Remember me"
            sx={{ mt: 1, color: "text.secondary" }}
          />
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 4 }}>
          <Button
            onClick={handleNameSubmit}
            variant="contained"
            disabled={!username.trim()}
            sx={{
              minWidth: 150,
              background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
              },
              "&:disabled": {
                background: "rgba(148, 163, 184, 0.2)",
              },
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {currentTab === 0 && renderSearchTab()}
      {currentTab === 1 && <Queue />}
      {currentTab === 2 && renderControlsTab()}
      {currentTab === 3 && <Settings />}

      <BottomNavigation
        value={currentTab}
        onChange={(event, newValue) => {
          setCurrentTab(newValue);
        }}
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(18, 18, 26, 0.95)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(148, 163, 184, 0.1)",
          height: 64,
        }}
      >
        <BottomNavigationAction
          label="Search"
          icon={<SearchIcon />}
          sx={{
            color: "text.secondary",
            "&.Mui-selected": {
              color: "#8B5CF6",
            },
          }}
        />
        <BottomNavigationAction
          label="Queue"
          icon={<QueueIcon />}
          sx={{
            color: "text.secondary",
            "&.Mui-selected": {
              color: "#8B5CF6",
            },
          }}
        />
        <BottomNavigationAction
          label="Controls"
          icon={<SkipIcon />}
          sx={{
            color: "text.secondary",
            "&.Mui-selected": {
              color: "#8B5CF6",
            },
          }}
        />
        <BottomNavigationAction
          label="Settings"
          icon={<SettingsIcon />}
          sx={{
            color: "text.secondary",
            "&.Mui-selected": {
              color: "#8B5CF6",
            },
          }}
        />
      </BottomNavigation>

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
            width: "100%",
            background:
              notification.severity === "error"
                ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
                : notification.severity === "success"
                ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                : notification.severity === "warning"
                ? "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
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

export default Control;
