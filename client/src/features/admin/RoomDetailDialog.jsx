import React from "react";
import {
  Chip, Dialog, DialogActions, DialogContent, DialogTitle, Button, List, ListItem, ListItemText, Stack, Typography,
} from "@mui/material";
import { decodeHtmlEntities } from "../../config";
import { formatDate } from "./RoomTable";

const RoomDetailDialog = ({ room, open, onClose, timeZone }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>Room {room?.id}</DialogTitle>
    <DialogContent dividers>
      {room && <>
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip label={room.status} />
          {room.status === "active" && <Chip label={`${room.connected?.total || 0} current clients`} />}
          {room.status === "active" && <Chip label={`${room.controllers?.enabled || 0}/${room.controllers?.registered || 0} enabled controllers`} />}
          <Chip label={`${room.peakConnectedSockets || 0} peak clients`} />
          <Chip label={`${room.videosPlayed || 0} played`} /><Chip label={`${room.videosSkipped || 0} skipped`} />
        </Stack>
        <Typography color="text.secondary">Created {formatDate(room.createdAt, timeZone)} · Last active {formatDate(room.lastActivityAt, timeZone)}</Typography>
        {room.closedAt && <Typography color="text.secondary">Closed {formatDate(room.closedAt, timeZone)} ({room.closeReason})</Typography>}
        <Typography variant="h6" sx={{ mt: 3 }}>Video history</Typography>
        <List dense>{room.videos?.map((video) => <ListItem key={video.queueId} divider>
          <ListItemText primary={decodeHtmlEntities(video.title)} secondary={`${decodeHtmlEntities(video.channelTitle) || "Unknown channel"} · ${video.videoId} · ${video.status} · ${formatDate(video.queuedAt, timeZone)}`} />
        </ListItem>)}</List>
        {!room.videos?.length && <Typography color="text.secondary">No selected videos were recorded.</Typography>}
      </>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>
);

export default RoomDetailDialog;
