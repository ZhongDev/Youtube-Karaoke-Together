import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
} from "@mui/material";

const Settings = () => {
  const [username, setUsername] = useState(() => {
    const savedUsername = localStorage.getItem("karaokeUsername");
    return savedUsername || "";
  });
  const [rememberMe, setRememberMe] = useState(() => {
    const rememberMeValue = localStorage.getItem("karaokeRememberMe");
    return rememberMeValue === "true";
  });

  // Listen for changes to localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUsername = localStorage.getItem("karaokeUsername");
      if (savedUsername !== username) {
        setUsername(savedUsername || "");
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [username]);

  const handleSave = () => {
    if (username.trim()) {
      if (rememberMe) {
        // Save username and remember preference
        localStorage.setItem("karaokeUsername", username);
        localStorage.setItem("karaokeRememberMe", "true");
      } else {
        // Don't save username to localStorage, just set remember preference to false
        // This ensures username is cleared on page refresh
        localStorage.setItem("karaokeRememberMe", "false");
        // But temporarily set it for current session notification
        localStorage.setItem("karaokeUsername", username);
      }

      // Trigger a storage event to notify other components
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "karaokeUsername",
          newValue: username,
          oldValue: localStorage.getItem("karaokeUsername"),
        })
      );

      // Notify server of identity for RR participation if in a room context
      try {
        const roomId =
          window.location.pathname.split("/control/")[1] ||
          window.location.pathname.split("/room/")[1];
        if (roomId && window.ytktSocket && window.ytktSocket.connected) {
          window.ytktSocket.emit("identify", { roomId, username });
        }
      } catch (_) {}
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 800, mx: "auto" }}>
      <Paper elevation={3} sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>
          Settings
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            fullWidth
            label="Your Name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                color="primary"
              />
            }
            label="Remember me"
          />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!username.trim()}
          >
            Save Settings
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
