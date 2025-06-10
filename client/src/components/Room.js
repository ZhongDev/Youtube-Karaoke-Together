import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText } from '@mui/material';
import YouTube from 'react-youtube';
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket', 'polling']
});

const Room = ({ roomId }) => {
    const [currentVideo, setCurrentVideo] = useState(null);
    const [queue, setQueue] = useState([]);
    const [player, setPlayer] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        console.log('[INFO] Room component mounted, roomId:', roomId);

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

        socket.on('room-state', (room) => {
            console.log('[INFO] Received room state:', room);
            setCurrentVideo(room.currentVideo);
            setQueue(room.queue);
        });

        socket.on('video-changed', (video) => {
            console.log('[INFO] Video changed:', video);
            setCurrentVideo(video);
            if (player) {
                console.log('[INFO] Loading new video in player');
                player.loadVideoById(video.id);
            }
        });

        socket.on('queue-updated', (newQueue) => {
            console.log('[INFO] Queue updated:', newQueue);
            setQueue(newQueue);
        });

        return () => {
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
            socket.off('room-state');
            socket.off('video-changed');
            socket.off('queue-updated');
        };
    }, [roomId, player]);

    const onPlayerReady = (event) => {
        console.log('[INFO] Player ready');
        setPlayer(event.target);
        if (currentVideo) {
            console.log('[INFO] Loading initial video:', currentVideo);
            event.target.loadVideoById(currentVideo.id);
        }
    };

    const onVideoEnd = () => {
        console.log('[INFO] Video ended, requesting next video');
        socket.emit('play-next', roomId);
    };

    const opts = {
        height: '390',
        width: '640',
        playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0
        },
    };

    // Debug render
    console.log('[INFO] Rendering Room component:', {
        isConnected,
        currentVideo,
        queueLength: queue.length,
        hasPlayer: !!player
    });

    return (
        <Box sx={{ display: 'flex', height: '100vh', p: 2 }}>
            <Box sx={{ flex: 2, mr: 2 }}>
                <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                    {!isConnected ? (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h5">Connecting...</Typography>
                        </Box>
                    ) : currentVideo ? (
                        <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <YouTube
                                videoId={currentVideo.id}
                                opts={opts}
                                onReady={onPlayerReady}
                                onEnd={onVideoEnd}
                                onError={(error) => console.error('[ERR] YouTube player error:', error)}
                                style={{ width: '100%', height: '100%' }}
                                iframeClassName="youtube-player"
                            />
                        </Box>
                    ) : (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h5">No video playing</Typography>
                        </Box>
                    )}
                </Paper>
            </Box>
            <Box sx={{ flex: 1 }}>
                <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" gutterBottom>
                        Queue {!isConnected && '(Disconnected)'}
                    </Typography>
                    <List>
                        {queue.map((video, index) => (
                            <ListItem key={index}>
                                <ListItemText
                                    primary={video.title}
                                    secondary={`Added by: ${video.addedBy}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </Box>
        </Box>
    );
};

export default Room; 