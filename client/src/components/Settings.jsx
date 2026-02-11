import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Switch,
  Alert,
  Slider,
  IconButton,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { useParams } from "react-router-dom";
import { STORAGE_KEYS, getStoredControllerKey, removeControllerKey } from "../config";
import useSocket from "../hooks/useSocket";

const Settings = ({ queueColorsEnabled, onToggleQueueColors, bgColorEnabled, onToggleBgColor, colorHue, onColorChange, onColorCommit }) => {
  const { roomId } = useParams();
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.USERNAME) || "";
  });
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_ME) === "true";
  });
  const [saved, setSaved] = useState(false);
  const [renameError, setRenameError] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const hasControllerKey = !!getStoredControllerKey(roomId);

  const { socket, isConnected, renameController } = useSocket();

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

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    setRenameError(null);

    const controllerKey = getStoredControllerKey(roomId);
    if (controllerKey && socket && isConnected) {
      try {
        setIsRenaming(true);
        const result = await renameController(roomId, controllerKey, trimmed);
        const finalName = result?.username || trimmed;
        setUsername(finalName);

        if (rememberMe) {
          localStorage.setItem(STORAGE_KEYS.USERNAME, finalName);
          localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
        } else {
          localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "false");
          localStorage.setItem(STORAGE_KEYS.USERNAME, finalName);
        }

        window.dispatchEvent(
          new StorageEvent("storage", {
            key: STORAGE_KEYS.USERNAME,
            newValue: finalName,
            oldValue: localStorage.getItem(STORAGE_KEYS.USERNAME),
          })
        );

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (error) {
        setRenameError(error.message || 'Failed to rename');
      } finally {
        setIsRenaming(false);
      }
      return;
    }

    // Fallback: store local preference only
    if (rememberMe) {
      localStorage.setItem(STORAGE_KEYS.USERNAME, trimmed);
      localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "true");
    } else {
      localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, "false");
      localStorage.setItem(STORAGE_KEYS.USERNAME, trimmed);
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEYS.USERNAME,
        newValue: trimmed,
        oldValue: localStorage.getItem(STORAGE_KEYS.USERNAME),
      })
    );

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

        {renameError && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {renameError}
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
            disabled={!username.trim() || isRenaming}
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
            {isRenaming ? "Renaming..." : "Save Settings"}
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

          {/* Color Highlighting Settings */}
          <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
              Appearance
            </Typography>

            {/* Color Picker */}
            {colorHue != null && (
              <Box
                sx={{
                  p: 2,
                  background: "rgba(139, 92, 246, 0.05)",
                  borderRadius: 2,
                  border: "1px solid rgba(148, 163, 184, 0.05)",
                  mb: 2,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1.5 }}>
                  Your Color
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: `hsl(${colorHue}, 66.6%, 66.6%)`,
                      boxShadow: `0 0 12px hsla(${colorHue}, 66.6%, 66.6%, 0.5)`,
                      border: "2px solid rgba(255, 255, 255, 0.15)",
                    }}
                  />
                  <Slider
                    value={colorHue}
                    min={0}
                    max={359}
                    onChange={(e, val) => onColorChange(val)}
                    onChangeCommitted={(e, val) => onColorCommit(val)}
                    sx={{
                      flex: 1,
                      "& .MuiSlider-track": {
                        display: "none",
                      },
                      "& .MuiSlider-rail": {
                        height: 8,
                        borderRadius: 4,
                        opacity: 1,
                        background: "linear-gradient(to right, hsl(0,66.6%,66.6%), hsl(60,66.6%,66.6%), hsl(120,66.6%,66.6%), hsl(180,66.6%,66.6%), hsl(240,66.6%,66.6%), hsl(300,66.6%,66.6%), hsl(359,66.6%,66.6%))",
                      },
                      "& .MuiSlider-thumb": {
                        width: 20,
                        height: 20,
                        backgroundColor: `hsl(${colorHue}, 66.6%, 66.6%)`,
                        border: "2px solid rgba(255, 255, 255, 0.5)",
                        boxShadow: `0 0 8px hsla(${colorHue}, 66.6%, 66.6%, 0.6)`,
                        "&:hover, &.Mui-focusVisible": {
                          boxShadow: `0 0 12px hsla(${colorHue}, 66.6%, 66.6%, 0.8)`,
                        },
                      },
                    }}
                  />
                  <IconButton
                    onClick={() => { const h = Math.floor(Math.random() * 360); onColorChange(h); onColorCommit(h); }}
                    size="small"
                    sx={{
                      color: "text.secondary",
                      "&:hover": { color: "#8B5CF6", background: "rgba(139, 92, 246, 0.1)" },
                    }}
                  >
                    <ShuffleIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 1 }}>
                  This color is used for your queue items and background tint.
                </Typography>
              </Box>
            )}

            <Box
              sx={{
                p: 2,
                background: "rgba(139, 92, 246, 0.05)",
                borderRadius: 2,
                border: "1px solid rgba(148, 163, 184, 0.05)",
                mb: 2,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={queueColorsEnabled}
                    onChange={(e) => onToggleQueueColors(e.target.checked)}
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
                label="Queue color highlighting"
              />
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
                Show user-specific color highlights on queue items.
              </Typography>
            </Box>

            <Box
              sx={{
                p: 2,
                background: "rgba(139, 92, 246, 0.05)",
                borderRadius: 2,
                border: "1px solid rgba(148, 163, 184, 0.05)",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={bgColorEnabled}
                    onChange={(e) => onToggleBgColor(e.target.checked)}
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
                label="Background color"
              />
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
                Apply a subtle background tint based on your assigned color.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
