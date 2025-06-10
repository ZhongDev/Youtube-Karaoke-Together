import React, { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemAvatar,
    Avatar,
    IconButton,
    Paper,
    Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import io from 'socket.io-client';
import { useParams } from 'react-router-dom';

// Create socket instance with explicit configuration
const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const Control = () => {
    const { roomId } = useParams();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [username, setUsername] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!roomId) {
            console.error('[ERR] No roomId provided');
            return;
        }

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
            id: video.id.videoId || video.id.playlistId,
            title: video.snippet.title,
            addedBy: username || 'Anonymous',
            isPlaylist: video.isPlaylist || false
        };
        console.log('[INFO] Emitting add-to-queue event:', videoData);
        socket.emit('add-to-queue', { roomId, video: videoData });
    };

    return (
        <Box sx={{
            p: 2,
            maxWidth: 600,
            mx: 'auto',
            bgcolor: 'background.default',
            color: 'text.primary'
        }}>
            <Paper
                elevation={3}
                sx={{
                    p: 2,
                    mb: 2,
                    bgcolor: 'background.paper'
                }}
            >
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

            <Paper
                elevation={3}
                sx={{
                    p: 2,
                    bgcolor: 'background.paper'
                }}
            >
                <Typography variant="h6" gutterBottom>
                    Search Results
                </Typography>
                <List>
                    {searchResults.map((video) => (
                        <ListItem
                            key={video.id.videoId || video.id.playlistId}
                            divider
                            secondaryAction={
                                <IconButton
                                    edge="end"
                                    aria-label="add"
                                    onClick={() => addToQueue(video)}
                                    disabled={!isConnected}
                                >
                                    <AddIcon />
                                </IconButton>
                            }
                        >
                            <ListItemAvatar>
                                <Avatar
                                    variant="rounded"
                                    src={video.snippet.thumbnails.medium.url}
                                    alt={video.snippet.title}
                                />
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {video.snippet.title}
                                        {video.isPlaylist && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    bgcolor: 'primary.main',
                                                    color: 'primary.contrastText',
                                                    px: 1,
                                                    py: 0.5,
                                                    borderRadius: 1
                                                }}
                                            >
                                                Playlist
                                            </Typography>
                                        )}
                                    </Box>
                                }
                                secondary={video.snippet.channelTitle}
                            />
                        </ListItem>
                    ))}
                </List>
            </Paper>
        </Box>
    );
};

export default Control; 