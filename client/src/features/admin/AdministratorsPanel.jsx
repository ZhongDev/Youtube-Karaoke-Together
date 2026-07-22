import React, { useState } from "react";
import {
  Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { adminApi } from "./adminApi";

const AdministratorsPanel = ({ users, onRefresh }) => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");

  const createInvite = async () => {
    setError("");
    try {
      setInvite(await adminApi.invite({ email, role }));
      setEmail("");
    } catch (requestError) { setError(requestError.message); }
  };

  const update = async (userId, patch) => {
    setError("");
    try { await adminApi.updateUser(userId, patch); await onRefresh(); }
    catch (requestError) { setError(requestError.message); }
  };

  const revokeSessions = async (userId) => {
    setError("");
    try { await adminApi.revokeSessions(userId); }
    catch (requestError) { setError(requestError.message); }
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {invite && (
        <Alert severity="success">
          Invitation for {invite.email}: <Typography component="span" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{invite.code}</Typography>
          <br />It expires {new Date(invite.expiresAt).toLocaleString()} and is shown only now.
        </Alert>
      )}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Invite an administrator</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
          <TextField label="Google account email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
          <FormControl sx={{ minWidth: 130 }}><InputLabel>Role</InputLabel><Select label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
            <MenuItem value="viewer">Viewer</MenuItem><MenuItem value="admin">Admin</MenuItem><MenuItem value="owner">Owner</MenuItem>
          </Select></FormControl>
          <Button variant="contained" onClick={createInvite} disabled={!email}>Create invite</Button>
        </Stack>
      </Paper>
      {users.map((user) => (
        <Paper key={user.id} sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={2}>
            <Box sx={{ flex: 1 }}><Typography fontWeight={600}>{user.displayName || user.email}</Typography><Typography variant="body2" color="text.secondary">{user.email} · Last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "never"}</Typography></Box>
            <FormControl size="small" sx={{ minWidth: 120 }}><Select value={user.role} onChange={(event) => update(user.id, { role: event.target.value })}>
              <MenuItem value="viewer">Viewer</MenuItem><MenuItem value="admin">Admin</MenuItem><MenuItem value="owner">Owner</MenuItem>
            </Select></FormControl>
            <Stack direction="row" alignItems="center"><Typography variant="body2">Enabled</Typography><Switch checked={user.enabled} onChange={(event) => update(user.id, { enabled: event.target.checked })} /></Stack>
            <Button size="small" onClick={() => revokeSessions(user.id)}>Revoke sessions</Button>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
};

export default AdministratorsPanel;
