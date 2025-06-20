import React from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Link,
    List,
    ListItem
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowBack, Email } from '@mui/icons-material';

const Contact = () => {
    const navigate = useNavigate();

    const ContactCard = ({ icon, title, description }) => (
        <Paper elevation={2} sx={{ p: 3, mb: 2, borderLeft: 4, borderColor: 'primary.main' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                {icon}
                <Typography variant="h6" component="h3">
                    {title}
                </Typography>
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                Email: <Link href="mailto:karaoke@zhong.au">karaoke@zhong.au</Link>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {description}
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'primary.main' }}>
                We will get back to you as soon as possible.
            </Typography>
        </Paper>
    );



    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ArrowBack
                    sx={{ cursor: 'pointer', color: 'primary.main' }}
                    onClick={() => navigate('/')}
                />
                <Typography variant="h3" component="h1" sx={{ color: 'primary.main' }}>
                    Contact Us
                </Typography>
            </Box>

            <Typography variant="body1" paragraph>
                We're here to help! Please don't hesitate to reach out with any questions, concerns,
                or feedback about YouTube Karaoke Together.
            </Typography>

            <Paper elevation={1} sx={{ p: 2, mb: 4, bgcolor: 'info.light' }}>
                <Typography variant="body2" sx={{ color: 'black' }}>
                    <strong>Quick Note:</strong> For issues related to YouTube content, please refer to{' '}
                    <Link href="https://support.google.com/youtube" target="_blank" rel="noopener noreferrer" sx={{ color: '#1565c0' }}>
                        YouTube Support
                    </Link> as content policies and availability are managed by YouTube.
                </Typography>
            </Paper>

            <Typography variant="h4" component="h2" gutterBottom sx={{ color: 'primary.main' }}>
                Contact Information
            </Typography>

            <ContactCard
                icon={<Email sx={{ color: 'primary.main' }} />}
                title="All Inquiries"
                description="For all questions, including general inquiries, technical support, privacy & legal matters, terms of service questions, feature requests, and feedback about the service."
            />



            <Typography variant="h4" component="h2" gutterBottom sx={{ color: 'primary.main' }}>
                Additional Resources
            </Typography>

            <List>
                <ListItem>
                    <Link onClick={() => navigate('/privacy-policy')} sx={{ cursor: 'pointer' }}>
                        Privacy Policy
                    </Link> - How we handle your data
                </ListItem>
                <ListItem>
                    <Link onClick={() => navigate('/terms-of-service')} sx={{ cursor: 'pointer' }}>
                        Terms of Service
                    </Link> - User agreement and terms
                </ListItem>
                <ListItem>
                    <Link href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
                        YouTube Terms of Service
                    </Link>
                </ListItem>
                <ListItem>
                    <Link href="https://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer">
                        Google Privacy Policy
                    </Link>
                </ListItem>
                <ListItem>
                    <Link href="https://support.google.com/youtube" target="_blank" rel="noopener noreferrer">
                        YouTube Support
                    </Link>
                </ListItem>
            </List>



            <Paper elevation={1} sx={{ p: 2, mt: 3, bgcolor: 'info.light' }}>
                <Typography variant="body2" sx={{ color: 'black' }}>
                    <strong>Important:</strong> By contacting us, you acknowledge that you have read our{' '}
                    <Link onClick={() => navigate('/privacy-policy')} sx={{ cursor: 'pointer', color: '#1565c0' }}>
                        Privacy Policy
                    </Link>{' '}
                    and understand how we handle your information. All communications are subject to our{' '}
                    <Link onClick={() => navigate('/terms-of-service')} sx={{ cursor: 'pointer', color: '#1565c0' }}>
                        Terms of Service
                    </Link>.
                </Typography>
            </Paper>
        </Container>
    );
};

export default Contact; 