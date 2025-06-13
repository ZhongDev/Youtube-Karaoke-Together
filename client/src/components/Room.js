import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Divider, Paper, Typography, List, ListItem, ListItemText, ListItemAvatar, Avatar, IconButton, Modal, TextField, Button } from '@mui/material';
import YouTube from 'react-youtube';
import io from 'socket.io-client';
import { useParams } from 'react-router-dom';
import SettingsIcon from '@mui/icons-material/Settings';

// Get the initial backend URL from localStorage or use default
const getInitialBackendUrl = () => {
    return localStorage.getItem('backendUrl') || 'http://localhost:5000';
};

const Room = () => {
    const { roomId } = useParams();
    const playerRef = useRef(null);
    const queueRef = useRef([]);
    const isConnectedRef = useRef(false);
    const [qrCode, setQrCode] = useState(null);
    const [, forceUpdate] = useState({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [backendUrl, setBackendUrl] = useState(getInitialBackendUrl());
    const [socket, setSocket] = useState(null);

    // Initialize socket connection
    useEffect(() => {
        const newSocket = io(backendUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });
        setSocket(newSocket);

        return () => {
            if (newSocket) {
                newSocket.disconnect();
            }
        };
    }, [backendUrl]);

    // Save backend URL to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('backendUrl', backendUrl);
    }, [backendUrl]);

    const handleSettingsOpen = () => setSettingsOpen(true);
    const handleSettingsClose = () => setSettingsOpen(false);

    const handleBackendUrlChange = (event) => {
        setBackendUrl(event.target.value);
    };

    const handleSaveSettings = () => {
        handleSettingsClose();
        // Socket will be recreated due to the useEffect dependency on backendUrl
        // Explicitly fetch new QR code after URL change
        fetchQRCode();
    };

    // Add effect to refetch QR code when backend URL changes
    useEffect(() => {
        if (roomId) {
            fetchQRCode();
        }
    }, [backendUrl, roomId]);

    // Update the fetchQRCode function to include roomId in its dependencies
    const fetchQRCode = useCallback(async () => {
        try {
            const API_URL = backendUrl;
            const response = await fetch(`${API_URL}/api/rooms/${roomId}/qr`, {
                method: 'GET',
                headers: {
                    'hostname': API_URL
                }
            });
            const data = await response.json();
            setQrCode(data.qrCode);
            console.log('[INFO] QR code fetched:', data.qrCode);
            console.log('[INFO] API_URL:', API_URL);
        } catch (error) {
            console.error('[ERR] Failed to fetch QR code:', error);
        }
    }, [backendUrl, roomId]);

    useEffect(() => {
        if (!roomId) {
            console.error('[ERR] No roomId provided');
            return;
        }

        console.log('[INFO] Room component mounted, roomId:', roomId);

        if (!socket) return;

        socket.on('connect', () => {
            console.log('[INFO] Socket connected');
            isConnectedRef.current = true;
            forceUpdate({});
            socket.emit('join-room', roomId);
        });

        socket.on('connect_error', (error) => {
            console.error('[ERR] Socket connection error:', error);
            isConnectedRef.current = false;
            forceUpdate({});
        });

        socket.on('disconnect', () => {
            console.log('[INFO] Socket disconnected');
            isConnectedRef.current = false;
            forceUpdate({});
        });

        socket.on('room-state', (room) => {
            console.log('[INFO] Received room state:', room);
            if (room.currentVideo && playerRef.current) {
                playerRef.current.loadVideoById({
                    videoId: room.currentVideo.id,
                    startSeconds: 0
                });
                playerRef.current.playVideo();
            }
            queueRef.current = room.queue;
            forceUpdate({});
        });

        socket.on('video-changed', (video) => {
            console.log('[INFO] Video changed:', video);
            if (video === null) {
                if (playerRef.current) {
                    playerRef.current.pauseVideo();
                    playerRef.current.clearVideo();
                }
            } else if (playerRef.current) {
                console.log('[INFO] Loading new video in player');
                playerRef.current.loadVideoById({
                    videoId: video.id,
                    startSeconds: 0
                });
                playerRef.current.playVideo();
            }
            forceUpdate({});
        });

        socket.on('queue-updated', (newQueue) => {
            console.log('[INFO] Queue updated:', newQueue);
            queueRef.current = newQueue;
            forceUpdate({});
        });

        return () => {
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
            socket.off('room-state');
            socket.off('video-changed');
            socket.off('queue-updated');
        };
    }, [roomId, socket, backendUrl]);

    const onPlayerReady = (event) => {
        console.log('[INFO] Player ready');
        playerRef.current = event.target;
    };

    const onVideoEnd = () => {
        console.log('[INFO] Video ended, requesting next video');
        if (socket) {
            socket.emit('play-next', roomId);
        }
    };

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            mute: 0,
            enablejsapi: 1
        },
    };

    return (
        <Box sx={{
            display: 'flex',
            height: '100vh',
            p: 2,
            gap: 2,
            bgcolor: 'background.default',
            color: 'text.primary'
        }}>
            <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper
                    elevation={3}
                    sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        bgcolor: 'background.paper'
                    }}
                >
                    {!isConnectedRef.current ? (
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'black'
                        }}>
                            <Typography variant="h5">Connecting...</Typography>
                        </Box>
                    ) : (
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            bgcolor: 'black',
                            position: 'relative'
                        }}>
                            <Box sx={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}>
                                <YouTube
                                    videoId=""
                                    opts={opts}
                                    onReady={onPlayerReady}
                                    onEnd={onVideoEnd}
                                    onError={(error) => {
                                        console.error('[ERR] YouTube player error:', error);
                                        socket.emit('play-next', roomId);
                                    }}
                                    style={{
                                        width: '100%',
                                        height: '100%'
                                    }}
                                    iframeClassName="youtube-player"
                                    allow="autoplay"
                                />
                            </Box>
                        </Box>
                    )}
                </Paper>
            </Box>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper
                    elevation={3}
                    sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        bgcolor: 'background.paper'
                    }}
                >
                    <Typography variant="h6" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                        Queue {!isConnectedRef.current && '(Disconnected)'}
                    </Typography>
                    <List sx={{ flex: 1, overflow: 'auto' }}>
                        {queueRef.current.map((video, index) => (
                            <ListItem key={index} divider>
                                <ListItemAvatar>
                                    <Avatar
                                        variant="rounded"
                                        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                                        alt={video.title}
                                    />
                                </ListItemAvatar>
                                <ListItemText
                                    primary={video.title}
                                    secondary={`Added by: ${video.addedBy}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
                <Paper
                    elevation={3}
                    sx={{
                        p: 2,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bgcolor: 'background.paper'
                    }}
                >
                    <Box
                        component="a"
                        href={`${backendUrl}/control/${roomId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            flex: 3,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        {qrCode && (
                            <img
                                src={qrCode}
                                alt="Room QR Code"
                                style={{ maxWidth: '100%', justifyContent: 'center', alignItems: 'center' }}
                            />
                        )}
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
                    <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <IconButton onClick={handleSettingsOpen} color="primary">
                            <SettingsIcon />
                        </IconButton>
                    </Box>
                </Paper>
            </Box>

            <Modal
                open={settingsOpen}
                onClose={handleSettingsClose}
                aria-labelledby="settings-modal-title"
            >
                <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 400,
                    bgcolor: 'background.paper',
                    boxShadow: 24,
                    p: 4,
                    borderRadius: 1,
                }}>
                    <Typography id="settings-modal-title" variant="h6" component="h2" gutterBottom>
                        Backend Settings
                    </Typography>
                    <TextField
                        fullWidth
                        label="Backend URL"
                        value={backendUrl}
                        onChange={handleBackendUrlChange}
                        margin="normal"
                        helperText="Enter the backend URL (e.g., http://localhost:5000)"
                    />
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button onClick={handleSettingsClose}>Cancel</Button>
                        <Button onClick={handleSaveSettings} variant="contained">Save</Button>
                    </Box>
                </Box>
            </Modal>
        </Box>
    );
};

export default Room; 