import React from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../../config";
import { persistCurrentConsent } from "./consentStorage";

const ControllerConsentDialog = ({ open, onAccepted }) => {
  const navigate = useNavigate();
  const accept = () => {
    try { persistCurrentConsent(); onAccepted(); }
    catch { /* Keep the blocking dialog open when storage is unavailable. */ }
  };
  return <Dialog open={open} disableEscapeKeyDown onClose={() => {}} maxWidth="sm" fullWidth>
    <DialogTitle>Terms and Privacy Agreement</DialogTitle>
    <DialogContent dividers>
      <Typography paragraph color="text.secondary">
        Before registering this device as a room controller, review and accept the current Terms and Privacy Policy.
      </Typography>
      <Typography paragraph color="text.secondary">
        Active room state is stored for restart recovery. After closure, a minimized room and selected-video history is retained for no more than 30 days and is accessible only to authorized administrators. Controller names and search queries are excluded from that history.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Privacy version {CURRENT_PRIVACY_POLICY_VERSION} · <Link href="/privacy-policy" target="_blank">Privacy Policy</Link> · <Link href="/terms-of-service" target="_blank">Terms of Service</Link> · <Link href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms</Link>
      </Typography>
    </DialogContent>
    <DialogActions><Button color="error" onClick={() => navigate("/")}>Decline</Button><Button variant="contained" onClick={accept}>Accept & Continue</Button></DialogActions>
  </Dialog>;
};

export default ControllerConsentDialog;
