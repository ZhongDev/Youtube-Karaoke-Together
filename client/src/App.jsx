import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import HomePage from "./components/HomePage.jsx";
import Room from "./components/Room.jsx";
import Control from "./components/Control.jsx";
import PrivacyPolicy from "./components/PrivacyPolicy.jsx";
import TermsOfService from "./components/TermsOfService.jsx";
import Contact from "./components/Contact.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Create cinematic dark theme
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#8B5CF6",      // Vibrant purple
      light: "#A78BFA",
      dark: "#7C3AED",
    },
    secondary: {
      main: "#EC4899",      // Pink accent
      light: "#F472B6",
      dark: "#DB2777",
    },
    background: {
      default: "#0A0A0F",   // Deep dark blue-black
      paper: "#12121A",     // Slightly lighter for cards
    },
    text: {
      primary: "#F1F5F9",
      secondary: "#94A3B8",
    },
    info: {
      main: "#3B82F6",
      light: "rgba(59, 130, 246, 0.15)",
      dark: "#2563EB",
    },
    warning: {
      main: "#F59E0B",
      light: "rgba(245, 158, 11, 0.15)",
    },
    error: {
      main: "#EF4444",
      light: "rgba(239, 68, 68, 0.15)",
    },
    success: {
      main: "#10B981",
      light: "rgba(16, 185, 129, 0.15)",
    },
    divider: "rgba(148, 163, 184, 0.1)",
  },
  typography: {
    fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontWeight: 700,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.1)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 10,
          padding: "10px 24px",
        },
        contained: {
          boxShadow: "0 4px 14px 0 rgba(139, 92, 246, 0.4)",
          "&:hover": {
            boxShadow: "0 6px 20px 0 rgba(139, 92, 246, 0.5)",
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: "linear-gradient(to bottom right, #12121A, #1A1A2E)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10,
            "& fieldset": {
              borderColor: "rgba(148, 163, 184, 0.2)",
            },
            "&:hover fieldset": {
              borderColor: "rgba(139, 92, 246, 0.5)",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#8B5CF6",
            },
          },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundColor: "#12121A",
          borderTop: "1px solid rgba(148, 163, 184, 0.1)",
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: "#94A3B8",
          "&.Mui-selected": {
            color: "#8B5CF6",
          },
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          "&:hover": {
            backgroundColor: "rgba(139, 92, 246, 0.08)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: "rgba(148, 163, 184, 0.1)",
        },
        bar: {
          borderRadius: 4,
          background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
        },
      },
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/room/:roomId" element={<Room />} />
            <Route path="/control/:roomId" element={<Control />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
