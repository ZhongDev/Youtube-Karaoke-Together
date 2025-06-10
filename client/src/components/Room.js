import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText, ListItemAvatar, Avatar } from '@mui/material';
import YouTube from 'react-youtube';
import io from 'socket.io-client';
import { useParams } from 'react-router-dom';

const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const Room = () => {
    const { roomId } = useParams();
    const playerRef = useRef(null);
    const queueRef = useRef([]);
    const isConnectedRef = useRef(false);
    const qrCodeRef = useRef(null);
    const [, forceUpdate] = useState({});

    useEffect(() => {
        if (!roomId) {
            console.error('[ERR] No roomId provided');
            return;
        }

        // Fetch QR code
        const fetchQRCode = async () => {
            try {
                const response = await fetch(`http://localhost:5000/api/rooms/${roomId}/qr`);
                const data = await response.json();
                qrCodeRef.current = data.qrCode;
                forceUpdate({});
            } catch (error) {
                console.error('[ERR] Failed to fetch QR code:', error);
            }
        };

        fetchQRCode();

        console.log('[INFO] Room component mounted, roomId:', roomId);

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
    }, [roomId]);

    const onPlayerReady = (event) => {
        console.log('[INFO] Player ready');
        playerRef.current = event.target;
    };

    const onVideoEnd = () => {
        console.log('[INFO] Video ended, requesting next video');
        socket.emit('play-next', roomId);
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
                        bgcolor: 'background.paper'
                    }}
                >
                    <Box
                        component="a"
                        href={`/control/${roomId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer',
                            '&:hover': {
                                opacity: 0.8
                            }
                        }}
                    >
                        <img
                            src={qrCodeRef.current}
                            alt="Room QR Code"
                            style={{
                                width: '200px',
                                height: '200px',
                                objectFit: 'contain'
                            }}
                        />
                    </Box>
                </Paper>
            </Box>
        </Box>
    );
};

export default Room; 