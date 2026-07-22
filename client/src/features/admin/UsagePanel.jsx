import React from "react";
import { Alert, Chip, LinearProgress, Paper, Stack, Typography } from "@mui/material";

const UsagePanel = ({ usage }) => {
  if (!usage) return null;
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        These are locally metered estimates using Google&apos;s granular quota model ({usage.catalogVersion}). Search has its own default 100-call daily bucket; video lookup and playlist expansion share the default 10,000-unit general bucket. The Google Cloud Console remains authoritative. Days reset in {usage.resetTimezone}.
      </Alert>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {usage.catalog.map((entry) => <Chip key={entry.method} variant="outlined" label={`${entry.method}: ${entry.cost}/call · ${entry.defaultDailyLimit}/day${entry.usedByApplication === false ? " · not used" : ""}`} />)}
      </Stack>
      {usage.buckets.map((bucket) => {
        const percent = bucket.defaultDailyLimit ? Math.min(100, bucket.cost / bucket.defaultDailyLimit * 100) : 0;
        const methods = usage.rows.filter((row) => row.day === bucket.day && row.bucket === bucket.bucket);
        return (
          <Paper key={`${bucket.day}-${bucket.bucket}`} sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1}>
              <Typography fontWeight={600}>{bucket.day} · {bucket.bucket}</Typography>
              <Typography color="text.secondary">{bucket.requests} requests · {bucket.cost}/{bucket.defaultDailyLimit} · {bucket.failures} failed</Typography>
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
