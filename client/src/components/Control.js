import React, { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Paper,
    Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import io from 'socket.io-client';

// Create socket instance with explicit configuration
const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const Control = ({ roomId }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [username, setUsername] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        console.log('[INFO] Control component mounted, roomId:', roomId);

        // Socket connection handlers
        socket.on('connect', () => {
            console.log('[INFO] Socket connected');
            setIsConnected(true);
            socket.emit('join-room', roomId);
        });

        socket.on('connect_error', (error) => {
            console.error('[ERR] Socket connection error:', error);
            setIsConnected(false);
        });

        socket.on('disconnect', () => {
            console.log('[INFO] Socket disconnected');
            setIsConnected(false);
        });

        // Cleanup on unmount
        return () => {
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
        };
    }, [roomId]);

    const searchVideos = async () => {
        try {
            console.log('[INFO] Searching for:', searchQuery);
            const response = await fetch(`http://localhost:5000/api/search?query=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            if (data.error) {
                console.error('[ERR] Search error:', data.error);
                return;
            }
            console.log('[INFO] Search results:', data.items.length, 'videos found');
            setSearchResults(data.items);
        } catch (error) {
            console.error('[ERR] Error searching videos:', error);
        }
    };

    const addToQueue = (video) => {
        if (!isConnected) {
            console.error('[ERR] Cannot add to queue: Socket not connected');
            return;
        }

        console.log('[INFO] Adding video to queue:', video);
        const videoData = {
            id: video.id.videoId,
            title: video.snippet.title,
            addedBy: username || 'Anonymous',
        };
        console.log('[INFO] Emitting add-to-queue event:', videoData);
        socket.emit('add-to-queue', { roomId, video: videoData });
    };

    return (
        <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Control Panel {!isConnected && '(Disconnected)'}
                </Typography>
                <TextField
                    fullWidth
                    label="Your Name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    margin="normal"
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <TextField
                        fullWidth
                        label="Search YouTube"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                searchVideos();
                            }
                        }}
                    />
                    <Button variant="contained" onClick={searchVideos}>
                        Search
                    </Button>
                </Box>
            </Paper>

            <Paper elevation={3} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Search Results
                </Typography>
                <List>
                    {searchResults.map((video) => (
                        <ListItem key={video.id.videoId}>
                            <ListItemText
                                primary={video.snippet.title}
                                secondary={video.snippet.channelTitle}
                            />
                            <ListItemSecondaryAction>
                                <IconButton
                                    edge="end"
                                    aria-label="add"
                                    onClick={() => addToQueue(video)}
                                    disabled={!isConnected}
                                >
                                    <AddIcon />
                                </IconButton>
                            </ListItemSecondaryAction>
                        </ListItem>
                    ))}
                </List>
            </Paper>
        </Box>
    );
};

export default Control; 