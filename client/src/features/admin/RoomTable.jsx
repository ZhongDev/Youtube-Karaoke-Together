import React from "react";
import {
  Box, Button, Pagination, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";

export function formatDate(value, timeZone) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium", timeZone }).format(new Date(value));
}

const RoomTable = ({ rooms = [], timeZone, onOpen, historical = false, page = 0, pageSize = 50, total = 0, onPageChange }) => (
  <Paper>
    <TableContainer>
      <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Room</TableCell>
          <TableCell>{historical ? "Closed" : "Last active"}</TableCell>
          <TableCell>Clients</TableCell>
          <TableCell>Videos</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="right">Details</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id} hover>
            <TableCell><Typography variant="body2" sx={{ fontFamily: "monospace" }}>{room.id.slice(0, 12)}</Typography></TableCell>
            <TableCell>{formatDate(historical ? room.closedAt : room.lastActivityAt, timeZone)}</TableCell>
            <TableCell>{historical ? room.peakConnectedSockets : room.connected?.total || 0}</TableCell>
            <TableCell>{room.videosPlayed || 0} played / {room.queueLength || 0} queued</TableCell>
            <TableCell>{room.status}</TableCell>
            <TableCell align="right"><Button size="small" onClick={() => onOpen(room.id)}>View</Button></TableCell>
          </TableRow>
        ))}
        {rooms.length === 0 && <TableRow><TableCell colSpan={6} align="center">No rooms found.</TableCell></TableRow>}
      </TableBody>
      </Table>
    </TableContainer>
    {total > pageSize && <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
      <Pagination page={page + 1} count={Math.ceil(total / pageSize)} onChange={(event, value) => onPageChange(value - 1)} />
    </Box>}
  </Paper>
);

export default RoomTable;
