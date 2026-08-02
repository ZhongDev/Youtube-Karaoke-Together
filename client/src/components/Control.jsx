import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Alert,
  Snackbar,
} from "@mui/material";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Queue from "./Queue.jsx";
import Settings from "./Settings.jsx";
import useSocket from "../hooks/useSocket";
import ControllerConsentDialog from "../features/consent/ControllerConsentDialog";
import SearchTab from "../features/controller/SearchTab";
import ControlsTab from "../features/controller/ControlsTab";
import ControllerNavigation from "../features/controller/ControllerNavigation";
import ControllerRegistrationDialog from "../features/controller/ControllerRegistrationDialog";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  getStoredControllerKey,
  removeControllerKey,
  storeControllerKey,
  STORAGE_KEYS,
  getStoredPreferredUsername,
  normalizeStoredUsername,
  storePreferredUsername,
} from "../config";

// Helper to get localStorage boolean with default
function getStorageBool(key, defaultVal = true) {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultVal : stored === "true";
}

const Control = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationRegistrationToken = searchParams.get('token') || new URLSearchParams(window.location.hash.slice(1)).get('token');
  const [consentAccepted, setConsentAccepted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TOS_ACCEPTED) === "true" &&
        localStorage.getItem(STORAGE_KEYS.PRIVACY_POLICY_ACCEPTED_VERSION) === CURRENT_PRIVACY_POLICY_VERSION;
    } catch { return false; }
  });
  const [controlMasterKey, setControlMasterKey] = useState(() => {
    const fromUrl = locationRegistrationToken;
    if (fromUrl) {
      sessionStorage.setItem(`${STORAGE_KEYS.REGISTRATION_TOKEN_PREFIX}${roomId}`, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(`${STORAGE_KEYS.REGISTRATION_TOKEN_PREFIX}${roomId}`);
  });

  useEffect(() => {
    if (locationRegistrationToken) navigate(`/control/${roomId}`, { replace: true });
  }, [locationRegistrationToken, navigate, roomId]);

  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // Auth state
  const [controllerKey, setControllerKey] = useState(() => getStoredControllerKey(roomId));
  const [controllerId, setControllerId] = useState(null);
  const [authRetry, setAuthRetry] = useState(0);
  const [username, setUsername] = useState(() => {
    return getStoredPreferredUsername();
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameError, setNameError] = useState(null);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_ME) === "true";
  });
  const [colorHue, setColorHue] = useState(null);
  const [queueColorsEnabled, setQueueColorsEnabled] = useState(() => getStorageBool(STORAGE_KEYS.QUEUE_COLORS_ENABLED));
  const [bgColorEnabled, setBgColorEnabled] = useState(() => getStorageBool(STORAGE_KEYS.BG_COLOR_ENABLED));
  const [lyricsRomajiEnabled, setLyricsRomajiEnabled] = useState(() => getStorageBool(STORAGE_KEYS.LYRICS_ROMAJI_ENABLED, false));

  const [currentTab, setCurrentTab] = useState(0);
  const [settingsState, setSettingsState] = useState({
    roundRobinEnabled: false,
  });
  const [playback, setPlayback] = useState(null);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [allowNewControllers, setAllowNewControllers] = useState(true);
  const [roomClosedReason, setRoomClosedReason] = useState(null);

  // Use the socket hook
  const {
    socket,
    isConnected,
    connectionError,
    serverError,
    clearServerError,
    registerController,
    authController,
    updateControllerColor,
    leaveRoom,
  } = useSocket();

  // Check if we need to register or authenticate
  useEffect(() => {
    if (!consentAccepted || !isConnected || !roomId) return;

    const existingKey = getStoredControllerKey(roomId);
    
    if (existingKey) {
      // Try to authenticate with existing key
      authController(roomId, existingKey)
        .then((data) => {
          console.log('[INFO] Authenticated as:', data.username);
          setControllerKey(existingKey);
          setControllerId(data.controllerId);
          setUsername(data.username);
          if (data.colorHue != null) setColorHue(data.colorHue);
        })
        .catch((error) => {
          console.log('[WARN] Existing key invalid:', error.message);
          if (["invalid_controller", "controller_removed"].includes(error.code)) {
            removeControllerKey(roomId);
            setControllerKey(null);
            setControllerId(null);
            if (controlMasterKey) setShowNameModal(true);
            else setNotification({ open: true, message: "Your controller access was removed. Please scan a new QR code.", severity: "error" });
          } else if (error.code === "controller_disabled") {
            setNotification({ open: true, message: "This controller is disabled. Access will retry automatically.", severity: "warning" });
            setTimeout(() => setAuthRetry((value) => value + 1), 5000);
          } else {
            setNotification({ open: true, message: `Unable to reconnect: ${error.message}`, severity: "warning" });
          }
        });
    } else if (controlMasterKey) {
      // No existing key, need to register
      setShowNameModal(true);
    } else {
      // No key and no master key - invalid access
      setNotification({
        open: true,
        message: "Missing access token. Please scan the QR code from the room screen.",
        severity: "error",
      });
    }
  }, [consentAccepted, isConnected, roomId, controlMasterKey, authController, authRetry]);

  // Listen for room state updates
  useEffect(() => {
    if (!socket) return;

    const handleRoomState = (room) => {
      console.log("[INFO] Control received room state:", room);
      setSettingsState(room.settings || { roundRobinEnabled: false });
      setPlayback(room.playback || null);
      setCurrentVideo(room.currentVideo || null);
      setAllowNewControllers(room.allowNewControllers !== false);
    };

    const handleSettingsUpdated = (newSettings) =>
      setSettingsState(newSettings || { roundRobinEnabled: false });
    const handlePlaybackUpdated = (pb) => setPlayback(pb);
    const handleVideoChanged = (video) => setCurrentVideo(video);
    const handleRegistrationStatus = ({ allowNewControllers: allow }) => {
      setAllowNewControllers(allow);
    };
    const handleQueueUpdated = (newQueue) => {
      // Just to ensure we're in sync - queue state is managed elsewhere but 
      // we update currentVideo display state if needed
    };
    const handleRoomClosed = ({ reason } = {}) => {
      removeControllerKey(roomId);
      setControllerKey(null);
      setControllerId(null);
      setRoomClosedReason(reason || "inactive");
      setNotification({ open: true, message: "This room closed after inactivity.", severity: "warning" });
    };

    socket.on("room-state", handleRoomState);
    socket.on("settings-updated", handleSettingsUpdated);
    socket.on("playback-updated", handlePlaybackUpdated);
    socket.on("video-changed", handleVideoChanged);
    socket.on("registration-status", handleRegistrationStatus);
    socket.on("queue-updated", handleQueueUpdated);
    socket.on("room-closed", handleRoomClosed);

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("settings-updated", handleSettingsUpdated);
      socket.off("playback-updated", handlePlaybackUpdated);
      socket.off("video-changed", handleVideoChanged);
      socket.off("registration-status", handleRegistrationStatus);
      socket.off("queue-updated", handleQueueUpdated);
      socket.off("room-closed", handleRoomClosed);
    };
  }, [socket, roomId]);

  useEffect(() => () => leaveRoom(roomId), [leaveRoom, roomId]);

  // Request room state when authenticated (ensures we have the latest state)
  useEffect(() => {
    if (socket && isConnected && controllerKey && roomId) {
      console.log("[INFO] Requesting room state after authentication");
      socket.emit("request-room-state", { roomId });
    }
  }, [socket, isConnected, controllerKey, roomId]);

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
      if (["invalid_controller", "controller_removed"].includes(serverError.code)) {
        removeControllerKey(roomId);
        setControllerKey(null);
        setControllerId(null);
      } else if (serverError.code === "controller_disabled") {
        setTimeout(() => setAuthRetry((value) => value + 1), 5000);
      }
      setNotification({
        open: true,
        message: `Server Error: ${serverError.message}`,
        severity: "error",
      });
      clearServerError();
    }
  }, [serverError, clearServerError, roomId]);

  // Listen for username updates from Settings
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEYS.USERNAME) {
        setUsername(normalizeStoredUsername(e.newValue || ""));
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Validate username (no [ or ] characters)
  const validateUsername = (name) => {
    if (!name || !name.trim()) {
      return "Please enter a name";
    }
    if (name.includes('[') || name.includes(']')) {
      return "Name cannot contain [ or ] characters";
    }
    if (name.length > 50) {
      return "Name must be 50 characters or less";
    }
    return null;
  };

  // Handle registration
  const handleRegister = async () => {
    const preferredName = normalizeStoredUsername(username);
    if (preferredName !== username) {
      setUsername(preferredName);
    }

    const error = validateUsername(preferredName);
    if (error) {
      setNameError(error);
      return;
    }

    if (!controlMasterKey) {
      setNotification({
        open: true,
        message: "Missing access token. Please scan the QR code again.",
        severity: "error",
      });
      return;
    }

    setIsRegistering(true);
    setNameError(null);

    try {
      const data = await registerController(roomId, controlMasterKey, preferredName);
      console.log('[INFO] Registered controller as:', data.username);
      
      // Store the key
      storeControllerKey(roomId, data.controllerKey);
      setControllerKey(data.controllerKey);
      setControllerId(data.controllerId);
      setUsername(data.username);
      if (data.colorHue != null) setColorHue(data.colorHue);
      sessionStorage.removeItem(`${STORAGE_KEYS.REGISTRATION_TOKEN_PREFIX}${roomId}`);
      setControlMasterKey(null);

      // Save username preference
      storePreferredUsername(preferredName, rememberMe);

      setShowNameModal(false);
    } catch (error) {
      console.error('[ERR] Registration failed:', error);
      setNameError(error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleToggleQueueColors = (enabled) => {
    setQueueColorsEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.QUEUE_COLORS_ENABLED, String(enabled));
  };

  const handleToggleLyricsRomaji = (enabled) => {
    setLyricsRomajiEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.LYRICS_ROMAJI_ENABLED, String(enabled));
  };

  const handleToggleBgColor = (enabled) => {
    setBgColorEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.BG_COLOR_ENABLED, String(enabled));
  };

  const handleColorChange = (newHue) => {
    setColorHue(newHue);
  };

  const handleColorCommit = (newHue) => {
    const key = getStoredControllerKey(roomId);
    if (key && isConnected) {
      updateControllerColor(roomId, key, newHue).catch((err) => {
        console.error('[ERR] Failed to update color:', err.message);
      });
    }
  };

  const notify = useCallback((message, severity = "info") => {
    setNotification({ open: true, message, severity });
  }, []);

  if (roomClosedReason) {
    return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Box sx={{ maxWidth: 480, textAlign: "center" }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {roomClosedReason === "deleted_by_creator" ? "The room and its stored data were deleted." : "The room closed after authenticated inactivity."}
        </Alert>
        <Button variant="contained" onClick={() => navigate("/", { replace: true })}>Return home</Button>
      </Box>
    </Box>;
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        pb: 8,
        background: bgColorEnabled && colorHue != null
          ? `linear-gradient(180deg, hsla(${colorHue}, 66.6%, 66.6%, 0.15) 0%, #0A0A0F 30%, #12121A 100%)`
          : "linear-gradient(180deg, #0A0A0F 0%, #12121A 100%)",
        transition: "background 0.3s ease",
      }}
    >
      <ControllerConsentDialog open={!consentAccepted} onAccepted={() => setConsentAccepted(true)} />
      <ControllerRegistrationDialog
        open={showNameModal} allowRegistration={allowNewControllers} username={username} setUsername={setUsername}
        error={nameError} clearError={() => setNameError(null)} rememberMe={rememberMe} setRememberMe={setRememberMe}
        registering={isRegistering} onRegister={handleRegister}
      />

      <Box role="tabpanel" hidden={currentTab !== 0}>
        <SearchTab
          roomId={roomId}
          controllerKey={controllerKey}
          socket={socket}
          isConnected={isConnected}
          notify={notify}
          roundRobinEnabled={Boolean(settingsState.roundRobinEnabled)}
        />
      </Box>
      {currentTab === 1 && (
        <Queue
          controllerKey={controllerKey}
          controllerId={controllerId}
          queueColorsEnabled={queueColorsEnabled}
          lyricsRomajiEnabled={lyricsRomajiEnabled}
        />
      )}
      {currentTab === 2 && (
        <ControlsTab
          roomId={roomId}
          username={username}
          controllerKey={controllerKey}
          socket={socket}
          isConnected={isConnected}
          settings={settingsState}
          setSettings={setSettingsState}
          currentVideo={currentVideo}
          playback={playback}
          notify={notify}
        />
      )}
      {currentTab === 3 && (
        <Settings
          queueColorsEnabled={queueColorsEnabled}
          onToggleQueueColors={handleToggleQueueColors}
          bgColorEnabled={bgColorEnabled}
          onToggleBgColor={handleToggleBgColor}
          lyricsRomajiEnabled={lyricsRomajiEnabled}
          onToggleLyricsRomaji={handleToggleLyricsRomaji}
          colorHue={colorHue}
          onColorChange={handleColorChange}
          onColorCommit={handleColorCommit}
        />
      )}

      <ControllerNavigation value={currentTab} onChange={setCurrentTab} />

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
            "& .MuiAlert-icon": { color: "white" },
          }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Control;
