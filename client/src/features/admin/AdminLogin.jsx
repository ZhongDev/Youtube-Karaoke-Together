import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { adminApi } from "./adminApi";

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-ytkt-google-identity]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.ytktGoogleIdentity = "true";
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error("Google Identity Services could not be loaded"));
    };
    document.head.appendChild(script);
  });
}

const AdminLogin = ({ bootstrap = false }) => {
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  const accessCodeRef = useRef("");
  const [status, setStatus] = useState(null);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  accessCodeRef.current = accessCode;

  useEffect(() => {
    let cancelled = false;
    adminApi.bootstrapStatus().then(async (result) => {
      if (cancelled) return;
      setStatus(result);
      if (!clientId || !result.googleConfigured) throw new Error("Google administrator sign-in is not configured on both the client and server.");
      await loadGoogleIdentity();
      if (cancelled) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setLoading(true);
          setError("");
          try {
            await adminApi.loginGoogle({
              idToken: credential,
              ...(bootstrap || result.bootstrapRequired
                ? { bootstrapCode: accessCodeRef.current }
                : { inviteCode: accessCodeRef.current || undefined }),
            });
            navigate("/admin", { replace: true });
          } catch (loginError) {
            setError(loginError.message);
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "filled_black", size: "large", width: 280 });
      setLoading(false);
    }).catch((loadError) => {
      if (!cancelled) { setError(loadError.message); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [bootstrap, clientId, navigate]);

  const needsBootstrap = bootstrap || status?.bootstrapRequired;
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Paper sx={{ width: "100%", maxWidth: 480, p: 4 }}>
        <Typography variant="h4" gutterBottom>Administrator sign-in</Typography>
        <Typography color="text.secondary" paragraph>
          Sign in with an approved Google identity. This sign-in does not request access to your YouTube account.
        </Typography>
        <TextField
          fullWidth
          margin="normal"
          type="password"
          label={needsBootstrap ? "One-time bootstrap code" : "Invitation code (new administrators only)"}
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          required={needsBootstrap}
          autoComplete="one-time-code"
        />
        {needsBootstrap && (
          <Alert severity="info" sx={{ my: 2 }}>
            Generate this short-lived code on the server with <code>npm run admin:bootstrap</code>.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        <Box sx={{ minHeight: 48, mt: 3, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {loading && <CircularProgress size={28} />}
          <Box ref={buttonRef} sx={{ display: loading ? "none" : "block" }} />
        </Box>
        <Button sx={{ mt: 2 }} onClick={() => navigate("/")}>Return home</Button>
      </Paper>
    </Box>
  );
};

export default AdminLogin;
