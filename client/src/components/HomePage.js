import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Container,
    Link,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Checkbox,
    FormControlLabel,
    Divider
} from '@mui/material';
import { PlayCircleOutline, QueueMusic, Search, Settings } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const HomePage = () => {
    const navigate = useNavigate();
    const [tosDialogOpen, setTosDialogOpen] = useState(false);
    const [tosAccepted, setTosAccepted] = useState(false);
    const [dontAskAgain, setDontAskAgain] = useState(false);

    useEffect(() => {
        // Check if user chose "don't ask again"
        const dontAsk = localStorage.getItem('tosDoNotAsk');

        if (dontAsk === 'true') {
            // User chose "don't ask again", so accept automatically
            setTosAccepted(true);
        } else {
            // Always show ToS dialog unless user specifically chose "don't ask again"
            setTosDialogOpen(true);
        }
    }, []);

    const handleCreateRoom = () => {
        if (!tosAccepted) {
            setTosDialogOpen(true);
            return;
        }

        const roomId = uuidv4();
        navigate(`/room/${roomId}`);
    };

    const handleTosAccept = () => {
        setTosAccepted(true);

        // Only save to localStorage if user checked "don't ask again"
        if (dontAskAgain) {
            localStorage.setItem('tosDoNotAsk', 'true');
        }

        setTosDialogOpen(false);
    };

    const handleTosDecline = () => {
        setTosDialogOpen(false);
        // Return user to previous page or close tab if no history
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            window.close();
        }
    };

    const features = [
        {
            icon: <PlayCircleOutline sx={{ fontSize: 48, color: 'primary.main' }} />,
            title: 'Watch Together',
            description: 'Synchronized video playback across all connected devices'
        },
        {
            icon: <QueueMusic sx={{ fontSize: 48, color: 'primary.main' }} />,
            title: 'Queue Management',
            description: 'Collaboratively build and manage your video playlist'
        },
        {
            icon: <Search sx={{ fontSize: 48, color: 'primary.main' }} />,
            title: 'YouTube Search',
            description: 'Search and add videos directly from YouTube'
        },
        {
            icon: <Settings sx={{ fontSize: 48, color: 'primary.main' }} />,
            title: 'Mobile Control',
            description: 'Control the experience from any mobile device via QR code'
        }
    ];

    return (
        <Container maxWidth="lg">
            <Box sx={{ py: 4 }}>
                {/* Header */}
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Typography variant="h2" component="h1" gutterBottom>
                        YouTube Karaoke Together
                    </Typography>
                    <Typography variant="h5" color="text.secondary" paragraph>
                        Watch YouTube videos together in perfect sync
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                        Create shared viewing rooms, queue videos collaboratively, and enjoy synchronized playback across all devices.
                    </Typography>

                    <Button
                        variant="contained"
                        size="large"
                        onClick={handleCreateRoom}
                        sx={{
                            px: 4,
                            py: 2,
                            fontSize: '1.2rem',
                            backgroundColor: '#2196F3',
                            '&:hover': {
                                backgroundColor: '#1976D2'
                            }
                        }}
                    >
                        Create Room
                    </Button>
                </Box>

                {/* Features */}
                <Box sx={{ mb: 6 }}>
                    <Typography variant="h4" component="h2" textAlign="center" gutterBottom>
                        Features
                    </Typography>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                        gap: 3,
                        mt: 4
                    }}>
                        {features.map((feature, index) => (
                            <Paper key={index} elevation={2} sx={{ p: 3, textAlign: 'center' }}>
                                {feature.icon}
                                <Typography variant="h6" component="h3" gutterBottom>
                                    {feature.title}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {feature.description}
                                </Typography>
                            </Paper>
                        ))}
                    </Box>
                </Box>

                {/* YouTube API Notice */}
                <Paper elevation={1} sx={{ p: 3, mb: 4, bgcolor: 'info.light', color: 'info.contrastText' }}>
                    <Typography variant="body2" textAlign="center">
                        <strong>Notice:</strong> This application uses YouTube API Services.
                        By using this service, you agree to be bound by the{' '}
                        <Link
                            href="https://www.youtube.com/t/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: 'inherit', textDecoration: 'underline' }}
                        >
                            YouTube Terms of Service
                        </Link>.
                    </Typography>
                </Paper>

                {/* Footer Links */}
                <Box sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    pt: 3,
                    textAlign: 'center',
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 3,
                    flexWrap: 'wrap'
                }}>
                    <Link
                        onClick={() => navigate('/privacy-policy')}
                        sx={{ textDecoration: 'none', cursor: 'pointer' }}
                    >
                        Privacy Policy
                    </Link>
                    <Link
                        onClick={() => navigate('/terms-of-service')}
                        sx={{ textDecoration: 'none', cursor: 'pointer' }}
                    >
                        Terms of Service
                    </Link>
                    <Link
                        onClick={() => navigate('/contact')}
                        sx={{ textDecoration: 'none', cursor: 'pointer' }}
                    >
                        Contact Us
                    </Link>
                    <Link
                        href="https://www.google.com/policies/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ textDecoration: 'none' }}
                    >
                        Google Privacy Policy
                    </Link>
                </Box>
            </Box>

            {/* Terms of Service Dialog */}
            <Dialog
                open={tosDialogOpen}
                onClose={() => { }} // Prevent closing without action
                maxWidth="md"
                fullWidth
                disableEscapeKeyDown
            >
                <DialogTitle>
                    Terms of Service Agreement
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" paragraph>
                        Welcome to YouTube Karaoke Together. Before you can use our service, you must agree to our terms.
                    </Typography>

                    <Typography variant="h6" gutterBottom>
                        YouTube Terms of Service
                    </Typography>
                    <Typography variant="body2" paragraph>
                        By using YouTube Karaoke Together, you agree to be bound by the{' '}
                        <Link
                            href="https://www.youtube.com/t/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            YouTube Terms of Service
                        </Link>. This application uses YouTube API Services to search and display video content.
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6" gutterBottom>
                        Privacy & Data Usage
                    </Typography>
                    <Typography variant="body2" paragraph>
                        Our service processes video search queries and room management data. We do not store personal information permanently.
                        Please review our{' '}
                        <Link onClick={() => navigate('/privacy-policy')} sx={{ cursor: 'pointer' }}>Privacy Policy</Link>{' '}
                        and the{' '}
                        <Link
                            href="https://www.google.com/policies/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Google Privacy Policy
                        </Link>{' '}
                        for more information.
                    </Typography>

                    <Typography variant="h6" gutterBottom>
                        Service Agreement
                    </Typography>
                    <Typography variant="body2" paragraph>
                        By clicking "Accept", you acknowledge that you have read and agree to our{' '}
                        <Link onClick={() => navigate('/terms-of-service')} sx={{ cursor: 'pointer' }}>Terms of Service</Link>.
                    </Typography>

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={dontAskAgain}
                                onChange={(e) => setDontAskAgain(e.target.checked)}
                            />
                        }
                        label="Don't ask me again"
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleTosDecline} color="error">
                        Decline & Return
                    </Button>
                    <Button onClick={handleTosAccept} variant="contained">
                        Accept & Continue
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default HomePage; 