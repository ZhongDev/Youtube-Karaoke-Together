import React from "react";
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, TextField,
} from "@mui/material";

const ControllerRegistrationDialog = ({
  open, allowRegistration, username, setUsername, error, clearError, rememberMe, setRememberMe,
  registering, onRegister,
}) => (
  <Dialog open={open} onClose={() => {}} disableEscapeKeyDown maxWidth="xs" fullWidth PaperProps={{
    sx: { background: "linear-gradient(180deg, #12121A 0%, #0A0A0F 100%)", border: "1px solid rgba(148,163,184,.15)", borderRadius: 3 },
  }}>
    <DialogTitle sx={{ textAlign: "center", fontWeight: 600, pt: 4 }}>Enter Your Name</DialogTitle>
    <DialogContent sx={{ px: 3 }}>
      {!allowRegistration ? <Alert severity="error" sx={{ mb: 2 }}>New registrations are currently disabled for this room.</Alert> : <>
        <TextField
          autoFocus margin="dense" label="Your Name" fullWidth value={username}
          onChange={(event) => { setUsername(event.target.value); clearError(); }}
          onKeyDown={(event) => { if (event.key === "Enter") onRegister(); }}
          error={Boolean(error)} helperText={error || "Names cannot contain [ or ] characters"} disabled={registering}
        />
        <FormControlLabel
          control={<Checkbox checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} sx={{ color: "text.secondary", "&.Mui-checked": { color: "#8B5CF6" } }} />}
          label="Remember me" sx={{ mt: 1, color: "text.secondary" }}
        />
      </>}
    </DialogContent>
    <DialogActions sx={{ justifyContent: "center", pb: 4 }}>
      <Button onClick={onRegister} variant="contained" disabled={!username.trim() || registering || !allowRegistration} sx={{ minWidth: 150 }}>
        {registering ? <><CircularProgress size={16} sx={{ color: "white", mr: 1 }} />Registering…</> : "Continue"}
      </Button>
    </DialogActions>
  </Dialog>
);

export default ControllerRegistrationDialog;
