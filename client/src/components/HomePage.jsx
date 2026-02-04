import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Container,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Divider,
} from "@mui/material";
import {
  PlayCircleOutline,
  QueueMusic,
  Search,
  Settings,
  MusicNote,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const HomePage = () => {
  const navigate = useNavigate();
  const [tosDialogOpen, setTosDialogOpen] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    // Check if user chose "don't ask again"
    const dontAsk = localStorage.getItem("tosDoNotAsk");

    if (dontAsk === "true") {
      // User chose "don't ask again", so accept automatically
      setTosAccepted(true);
    } else {
      // Always show ToS dialog unless user specifically chose "don't ask again"
      setTosDialogOpen(true);
    }
  }, []);

  const handleCreateRoom = () => {
    if (!tosAccepted) {
      setTosDialogOpen(true);
      return;
    }

    const roomId = uuidv4();
    navigate(`/room/${roomId}`);
  };

  const handleTosAccept = () => {
    setTosAccepted(true);

    // Only save to localStorage if user checked "don't ask again"
    if (dontAskAgain) {
      localStorage.setItem("tosDoNotAsk", "true");
    }

    setTosDialogOpen(false);
  };

  const handleTosDecline = () => {
    setTosDialogOpen(false);
    // Return user to previous page or close tab if no history
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      window.close();
    }
  };

  const features = [
    {
      icon: <PlayCircleOutline sx={{ fontSize: 40 }} />,
      title: "Watch Together",
      description: "Synchronized video playback across all connected devices",
      gradient: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)",
    },
    {
      icon: <QueueMusic sx={{ fontSize: 40 }} />,
      title: "Queue Management",
      description:
        "Collaboratively build and manage your video playlist, with optional Round-Robin Queuing",
      gradient: "linear-gradient(135deg, #EC4899 0%, #F472B6 100%)",
    },
    {
      icon: <Search sx={{ fontSize: 40 }} />,
      title: "YouTube Search",
      description: "Search and add videos directly from YouTube",
      gradient: "linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)",
    },
    {
      icon: <Settings sx={{ fontSize: 40 }} />,
      title: "Mobile Control",
      description: "Control the experience from any mobile device via QR code",
      gradient: "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0A0A0F 0%, #12121A 50%, #0A0A0F 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow effects */}
      <Box
        sx={{
          position: "absolute",
          top: "10%",
          left: "20%",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          bottom: "20%",
          right: "10%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ py: { xs: 6, md: 10 } }}>
          {/* Header */}
          <Box sx={{ textAlign: "center", mb: 8 }}>
            {/* Logo/Icon */}
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 80,
                height: 80,
                borderRadius: "20px",
                background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
                mb: 3,
                boxShadow: "0 20px 40px rgba(139, 92, 246, 0.3)",
              }}
            >
              <MusicNote sx={{ fontSize: 40, color: "white" }} />
            </Box>

            <Typography
              variant="h2"
              component="h1"
              sx={{
                fontWeight: 800,
                fontSize: { xs: "2.5rem", md: "3.5rem" },
                background: "linear-gradient(135deg, #F1F5F9 0%, #94A3B8 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 2,
              }}
            >
              YouTube Karaoke Together
            </Typography>
            <Typography
              variant="h5"
              sx={{
                color: "text.secondary",
                fontWeight: 400,
                fontSize: { xs: "1.1rem", md: "1.4rem" },
                mb: 2,
              }}
            >
              Watch YouTube videos together in{" "}
              <Box
                component="span"
                sx={{
                  background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontWeight: 600,
                }}
              >
                perfect sync
              </Box>
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                maxWidth: 600,
                mx: "auto",
                mb: 5,
                lineHeight: 1.7,
              }}
            >
              Create shared viewing rooms, queue videos collaboratively, and enjoy
              synchronized playback across all devices.
            </Typography>

            <Button
              variant="contained"
              size="large"
              onClick={handleCreateRoom}
              sx={{
                px: 5,
                py: 2,
                fontSize: "1.1rem",
                fontWeight: 600,
                background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                boxShadow: "0 8px 30px rgba(139, 92, 246, 0.4)",
                transition: "all 0.3s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 12px 40px rgba(139, 92, 246, 0.5)",
                  background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
                },
              }}
            >
              Create Room
            </Button>
          </Box>

          {/* Features */}
          <Box sx={{ mb: 8 }}>
            <Typography
              variant="h4"
              component="h2"
              textAlign="center"
              sx={{
                fontWeight: 700,
                mb: 5,
                color: "text.primary",
              }}
            >
              Features
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 3,
              }}
            >
              {features.map((feature, index) => (
                <Paper
                  key={index}
                  elevation={0}
                  sx={{
                    p: 4,
                    background: "rgba(18, 18, 26, 0.6)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(148, 163, 184, 0.1)",
                    borderRadius: 3,
                    transition: "all 0.3s ease",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      background: feature.gradient,
                      mb: 2,
                      color: "white",
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography
                    variant="h6"
                    component="h3"
                    sx={{ fontWeight: 600, mb: 1, color: "text.primary" }}
                  >
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.6 }}>
                    {feature.description}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>

          {/* YouTube API Notice */}
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 6,
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" textAlign="center" sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#60A5FA" }}>Notice:</strong> This application uses YouTube API Services.
              By using this service, you agree to be bound by the{" "}
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#60A5FA", textDecoration: "underline" }}
              >
                YouTube Terms of Service
              </Link>
              .
            </Typography>
          </Paper>

          {/* Footer Links */}
          <Box
            sx={{
              borderTop: "1px solid rgba(148, 163, 184, 0.1)",
              pt: 4,
              textAlign: "center",
              display: "flex",
              justifyContent: "center",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <Link
              onClick={() => navigate("/privacy-policy")}
              sx={{
                textDecoration: "none",
                cursor: "pointer",
                color: "text.secondary",
                transition: "color 0.2s",
                "&:hover": { color: "#8B5CF6" },
              }}
            >
              Privacy Policy
            </Link>
            <Link
              onClick={() => navigate("/terms-of-service")}
              sx={{
                textDecoration: "none",
                cursor: "pointer",
                color: "text.secondary",
                transition: "color 0.2s",
                "&:hover": { color: "#8B5CF6" },
              }}
            >
              Terms of Service
            </Link>
            <Link
              onClick={() => navigate("/contact")}
              sx={{
                textDecoration: "none",
                cursor: "pointer",
                color: "text.secondary",
                transition: "color 0.2s",
                "&:hover": { color: "#8B5CF6" },
              }}
            >
              Contact Us
            </Link>
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                textDecoration: "none",
                color: "text.secondary",
                transition: "color 0.2s",
                "&:hover": { color: "#8B5CF6" },
              }}
            >
              Google Privacy Policy
            </Link>
          </Box>
        </Box>
      </Container>

      {/* Terms of Service Dialog */}
      <Dialog
        open={tosDialogOpen}
        onClose={() => {}} // Prevent closing without action
        maxWidth="md"
        fullWidth
        disableEscapeKeyDown
        PaperProps={{
          sx: {
            background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)",
            border: "1px solid rgba(148, 163, 184, 0.15)",
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 700,
            fontSize: "1.5rem",
            borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
            pb: 2,
          }}
        >
          Terms of Service Agreement
        </DialogTitle>
        <DialogContent sx={{ pt: 3, pb: 2 }}>
          <Typography variant="body1" paragraph sx={{ color: "text.secondary", mt: 2 }}>
            Welcome to YouTube Karaoke Together. Before you can use our service,
            you must agree to our terms.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: "text.primary", mt: 2 }}>
            YouTube Terms of Service
          </Typography>
          <Typography variant="body2" paragraph sx={{ color: "text.secondary" }}>
            By using YouTube Karaoke Together, you agree to be bound by the{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#8B5CF6" }}
            >
              YouTube Terms of Service
            </Link>
            . This application uses YouTube API Services to search and display
            video content.
          </Typography>

          <Divider sx={{ my: 3, borderColor: "rgba(148, 163, 184, 0.1)" }} />

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: "text.primary" }}>
            Privacy & Data Usage
          </Typography>
          <Typography variant="body2" paragraph sx={{ color: "text.secondary" }}>
            Our service processes video search queries and room management data.
            We do not store personal information permanently. Please review our{" "}
            <Link
              onClick={() => navigate("/privacy-policy")}
              sx={{ cursor: "pointer", color: "#8B5CF6" }}
            >
              Privacy Policy
            </Link>{" "}
            and the{" "}
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#8B5CF6" }}
            >
              Google Privacy Policy
            </Link>{" "}
            for more information.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: "text.primary" }}>
            Service Agreement
          </Typography>
          <Typography variant="body2" paragraph sx={{ color: "text.secondary" }}>
            By clicking "Accept", you acknowledge that you have read and agree
            to our{" "}
            <Link
              onClick={() => navigate("/terms-of-service")}
              sx={{ cursor: "pointer", color: "#8B5CF6" }}
            >
              Terms of Service
            </Link>
            .
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                sx={{
                  color: "text.secondary",
                  "&.Mui-checked": { color: "#8B5CF6" },
                }}
              />
            }
            label="Don't ask me again"
            sx={{ color: "text.secondary" }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: "1px solid rgba(148, 163, 184, 0.1)" }}>
          <Button
            onClick={handleTosDecline}
            sx={{
              color: "#EF4444",
              "&:hover": { backgroundColor: "rgba(239, 68, 68, 0.1)" },
            }}
          >
            Decline & Return
          </Button>
          <Button
            onClick={handleTosAccept}
            variant="contained"
            sx={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              "&:hover": {
                background: "linear-gradient(135deg, #A78BFA 0%, #8B5CF6 100%)",
              },
            }}
          >
            Accept & Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HomePage;
