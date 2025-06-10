import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
} from '@mui/material';
import Room from './components/Room';
import Control from './components/Control';

const CreateRoom = () => {
  const [roomData, setRoomData] = useState(null);

  const createRoom = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/rooms', {
        method: 'POST',
      });
      const data = await response.json();
      setRoomData(data);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  if (roomData) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            Room Created!
          </Typography>
          <Typography variant="body1" gutterBottom>
            Room ID: {roomData.roomId}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <img src={roomData.qrCode} alt="Room QR Code" style={{ maxWidth: '200px' }} />
          </Box>
          <Button
            variant="contained"
            color="primary"
            href={`/room/${roomData.roomId}`}
            sx={{ mt: 2 }}
          >
            Enter Room
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          YouTube Karaoke Together
        </Typography>
        <Typography variant="body1" gutterBottom>
          Create a room to start watching YouTube videos together!
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={createRoom}
          sx={{ mt: 2 }}
        >
          Create Room
        </Button>
      </Paper>
    </Container>
  );
};

const RoomRoute = () => {
  const { roomId } = useParams();
  return <Room roomId={roomId} />;
};

const ControlRoute = () => {
  const { roomId } = useParams();
  return <Control roomId={roomId} />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CreateRoom />} />
        <Route path="/room/:roomId" element={<RoomRoute />} />
        <Route path="/control/:roomId" element={<ControlRoute />} />
      </Routes>
    </Router>
  );
}

export default App;
