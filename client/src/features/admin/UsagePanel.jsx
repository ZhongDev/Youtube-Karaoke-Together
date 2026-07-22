import React, { useEffect, useState } from "react";
import { Alert, Button, Chip, LinearProgress, Paper, Stack, TextField, Typography } from "@mui/material";
import { adminApi } from "./adminApi";

const UsagePanel = ({ usage, canEdit = false, onUsageChanged }) => {
  const [limits, setLimits] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLimits(Object.fromEntries((usage?.quotaLimits || []).map((entry) => [entry.bucket, String(entry.effectiveDailyLimit)])));
  }, [usage]);

  if (!usage) return null;

  const save = async (restoreDefaults = false) => {
    const updates = {};
    for (const entry of usage.quotaLimits) {
      const value = Number(limits[entry.bucket]);
      if (!restoreDefaults && (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000)) {
        setError(`${entry.bucket} must be a whole number from 1 to 1,000,000,000.`);
        return;
      }
      updates[entry.bucket] = restoreDefaults ? null : value;
    }
    setSaving(true); setError("");
    try { onUsageChanged?.(await adminApi.updateQuotaLimits(updates)); }
    catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        These are locally metered estimates using Google&apos;s granular quota model ({usage.catalogVersion}). Configured limits change dashboard comparisons only; they do not change the quota enforced by Google. The Google Cloud Console remains authoritative. Days reset in {usage.resetTimezone}.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Daily quota limits</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Match these values to any quota increases shown in Google Cloud Console. Defaults remain visible for reference.
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} gap={2}>
          {usage.quotaLimits.map((entry) => <TextField
            key={entry.bucket}
            label={entry.bucket}
            type="number"
            value={limits[entry.bucket] ?? ""}
            onChange={(event) => setLimits((current) => ({ ...current, [entry.bucket]: event.target.value }))}
            disabled={!canEdit || saving}
            helperText={`Default: ${entry.defaultDailyLimit.toLocaleString()}${entry.isCustom ? " · custom" : ""}`}
            slotProps={{ htmlInput: { min: 1, max: 1_000_000_000, step: 1 } }}
            fullWidth
          />)}
        </Stack>
        {canEdit && <Stack direction="row" gap={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save limits"}</Button>
          <Button onClick={() => save(true)} disabled={saving}>Restore defaults</Button>
        </Stack>}
      </Paper>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {usage.catalog.map((entry) => <Chip key={entry.method} variant="outlined" label={`${entry.method}: ${entry.cost}/call · ${entry.effectiveDailyLimit}/day${entry.effectiveDailyLimit !== entry.defaultDailyLimit ? ` (default ${entry.defaultDailyLimit})` : ""}${entry.usedByApplication === false ? " · not used" : ""}`} />)}
      </Stack>
      {usage.buckets.map((bucket) => {
        const percent = bucket.effectiveDailyLimit ? Math.min(100, bucket.cost / bucket.effectiveDailyLimit * 100) : 0;
        const methods = usage.rows.filter((row) => row.day === bucket.day && row.bucket === bucket.bucket);
        return (
          <Paper key={`${bucket.day}-${bucket.bucket}`} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
              <Typography fontWeight={600}>{bucket.day} · {bucket.bucket}</Typography>
              <Typography color="text.secondary">{bucket.requests} requests · {bucket.cost}/{bucket.effectiveDailyLimit} · {bucket.failures} failed</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={percent} sx={{ mt: 1.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {methods.map((row) => `${row.method}: ${row.requests} call${row.requests === 1 ? "" : "s"}`).join(" · ")}
            </Typography>
          </Paper>
        );
      })}
      {usage.buckets.length === 0 && <Typography color="text.secondary">No YouTube API requests have been metered yet.</Typography>}
    </Stack>
  );
};

export default UsagePanel;
