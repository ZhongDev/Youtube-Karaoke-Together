import React, { useCallback, useEffect, useState } from "react";
import {
  Alert, AppBar, Box, Button, CircularProgress, Container, FormControl, InputLabel, MenuItem,
  Paper, Select, Stack, Tab, Tabs, Toolbar, Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { adminApi } from "./adminApi";
import AdministratorsPanel from "./AdministratorsPanel";
import RoomDetailDialog from "./RoomDetailDialog";
import RoomTable, { formatDate } from "./RoomTable";
import UsagePanel from "./UsagePanel";

const sections = ["Overview", "Active Rooms", "30-Day History", "API Usage", "Administrators", "Audit"];
const PAGE_SIZE = 50;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState(0);
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTotal, setActiveTotal] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [usage, setUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const session = await adminApi.session();
      setUser(session.user);
      const [activeData, historyData, usageData] = await Promise.all([
        adminApi.activeRooms({ offset: activePage * PAGE_SIZE, limit: PAGE_SIZE }),
        adminApi.history({ offset: historyPage * PAGE_SIZE, limit: PAGE_SIZE }),
        adminApi.usage(),
      ]);
      setActive(activeData.rows); setActiveTotal(activeData.total);
      setHistory(historyData.rows); setHistoryTotal(historyData.total); setUsage(usageData);
      if (session.user.role === "owner") {
        const [userData, auditData] = await Promise.all([adminApi.users(), adminApi.audit()]);
        setUsers(userData.users); setAudit(auditData.rows);
      }
    } catch (requestError) {
      if (requestError.status === 401) navigate("/admin/login", { replace: true });
      else setError(requestError.message);
    } finally { setLoading(false); }
  }, [activePage, historyPage, navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const data = await adminApi.activeRooms({ offset: activePage * PAGE_SIZE, limit: PAGE_SIZE });
        setActive(data.rows); setActiveTotal(data.total);
      } catch { /* main refresh reports errors */ }
    }, 10_000);
    return () => clearInterval(timer);
  }, [activePage]);

  const openRoom = async (roomId) => {
    try { setDetail(await adminApi.room(roomId)); } catch (requestError) { setError(requestError.message); }
  };
  const logout = async () => { try { await adminApi.logout(); } finally { navigate("/admin/login", { replace: true }); } };
  const refreshUsers = async () => setUsers((await adminApi.users()).users);

  if (loading && !user) return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  return <Box sx={{ minHeight: "100vh" }}>
    <AppBar position="sticky" color="transparent" elevation={0}><Toolbar>
      <Typography variant="h6" sx={{ flex: 1 }}>YTKT Administration</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>{user?.email} · {user?.role}</Typography>
      <Button onClick={logout}>Sign out</Button>
    </Toolbar></AppBar>
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(event, value) => setTab(value)} variant="scrollable">{sections.map((section, index) => (
          <Tab key={section} label={section} disabled={index >= 4 && user?.role !== "owner"} />
        ))}</Tabs>
        <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Display timezone</InputLabel><Select value={timeZone} label="Display timezone" onChange={(event) => setTimeZone(event.target.value)}>
          <MenuItem value={Intl.DateTimeFormat().resolvedOptions().timeZone}>Browser local</MenuItem><MenuItem value="UTC">UTC</MenuItem><MenuItem value="Australia/Sydney">Australia/Sydney</MenuItem>
        </Select></FormControl>
      </Stack>

      {tab === 0 && <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        {[['Active rooms', activeTotal], ['Rooms closed in 30 days', historyTotal], ['API requests metered', usage?.rows.reduce((sum, row) => sum + row.requests, 0) || 0]].map(([label, value]) => (
          <Paper key={label} sx={{ p: 3, flex: 1 }}><Typography color="text.secondary">{label}</Typography><Typography variant="h3">{value}</Typography></Paper>
        ))}
      </Stack>}
      {tab === 1 && <RoomTable rooms={active} total={activeTotal} page={activePage} pageSize={PAGE_SIZE} onPageChange={setActivePage} timeZone={timeZone} onOpen={openRoom} />}
      {tab === 2 && <RoomTable rooms={history} total={historyTotal} page={historyPage} pageSize={PAGE_SIZE} onPageChange={setHistoryPage} timeZone={timeZone} onOpen={openRoom} historical />}
      {tab === 3 && <UsagePanel usage={usage} canEdit={["owner", "admin"].includes(user?.role)} onUsageChanged={setUsage} />}
      {tab === 4 && user?.role === "owner" && <AdministratorsPanel users={users} onRefresh={refreshUsers} />}
      {tab === 5 && user?.role === "owner" && <Stack spacing={1}>{audit.map((entry) => <Paper key={entry.id} sx={{ p: 2 }}>
        <Typography fontWeight={600}>{entry.action}</Typography><Typography variant="body2" color="text.secondary">{entry.actorEmail || "system"} · {formatDate(entry.occurredAt, timeZone)} · {entry.targetType || "—"} {entry.targetId || ""}</Typography>
      </Paper>)}</Stack>}
      <Button onClick={() => load()} sx={{ mt: 3 }}>Refresh all data</Button>
    </Container>
    <RoomDetailDialog open={Boolean(detail)} room={detail} onClose={() => setDetail(null)} timeZone={timeZone} />
  </Box>;
};

export default AdminDashboard;
