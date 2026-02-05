import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { useParams } from "react-router-dom";
import { STORAGE_KEYS, getStoredControllerKey, removeControllerKey } from "../config";

const Settings = () => {
  const { roomId } = useParams();
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.USERNAME) || "";
  });
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_ME) === "true";
  });
  const [saved, setSaved] = useState(false);
  const hasControllerKey = !!getStoredControllerKey(roomId);

  // Listen for changes to localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUsername = localStorage.getItem(STORAGE_KEYS.USERNAME);
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
        localStorage.setItem(STORAGE_KEYS.USERNAME, username);
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
      } else {
        localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "false");
        localStorage.setItem(STORAGE_KEYS.USERNAME, username);
      }

      // Trigger a storage event to notify other components
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.USERNAME,
          newValue: username,
          oldValue: localStorage.getItem(STORAGE_KEYS.USERNAME),
        })
      );

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleClearSession = () => {
    if (roomId) {
      removeControllerKey(roomId);
      // Force page refresh to re-register
      window.location.reload();
    }
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
          <SettingsIcon sx={{ color: "#8B5CF6" }} />
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Settings
          </Typography>
        </Box>

        {saved && (
          <Alert
            severity="success"
            sx={{
              mb: 3,
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            Settings saved successfully!
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
              Display Name
            </Typography>
            <TextField
              fullWidth
              label="Your Name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your display name"
              helperText="This name will be saved for future sessions if 'Remember me' is checked"
            />
          </Box>

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
            sx={{ color: "text.secondary" }}
          />

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!username.trim()}
            sx={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              py: 1.5,
              "&:hover": {
                background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
              },
              "&:disabled": {
                background: "rgba(148, 163, 184, 0.2)",
              },
            }}
          >
            Save Settings
          </Button>

          {/* Session Management */}
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
              Session Management
            </Typography>
            
            {hasControllerKey ? (
              <Box
                sx={{
                  p: 2,
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: 2,
                  mb: 2,
                }}
              >
                <Typography variant="body2" sx={{ color: "#10B981" }}>
                  You are registered for this room session.
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  p: 2,
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  borderRadius: 2,
                  mb: 2,
                }}
              >
                <Typography variant="body2" sx={{ color: "#F59E0B" }}>
                  You are not registered for this room. Scan the QR code to register.
                </Typography>
              </Box>
            )}

            <Button
              variant="outlined"
              onClick={handleClearSession}
              disabled={!hasControllerKey}
              sx={{
                borderColor: "rgba(239, 68, 68, 0.5)",
                color: "#EF4444",
                "&:hover": {
                  borderColor: "#EF4444",
                  background: "rgba(239, 68, 68, 0.1)",
                },
                "&:disabled": {
                  borderColor: "rgba(148, 163, 184, 0.2)",
                  color: "rgba(148, 163, 184, 0.5)",
                },
              }}
            >
              Clear Session & Re-register
            </Button>
            <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
              This will clear your current session and require you to scan the QR code again.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
