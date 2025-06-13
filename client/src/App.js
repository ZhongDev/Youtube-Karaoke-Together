import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import Room from './components/Room';
import Control from './components/Control';

// Create dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

function App() {
  const [roomId] = useState(() => {
    const newRoomId = uuidv4();
    return newRoomId;
  });

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to={`/room/${roomId}`} replace />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/control/:roomId" element={<Control />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
