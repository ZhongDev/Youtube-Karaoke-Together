import React from "react";
import {
  Container,
  Typography,
  Box,
  Paper,
  Link,
  List,
  ListItem,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { ArrowBack } from "@mui/icons-material";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  const HighlightBox = ({ children, color = "info.light" }) => (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        my: 2,
        bgcolor: color,
        borderLeft: 4,
        borderColor: "primary.main",
        color: "black",
      }}
    >
      {children}
    </Paper>
  );

  const Section = ({ title, children }) => (
    <Box sx={{ mb: 4 }}>
      <Typography
        variant="h5"
        component="h2"
        gutterBottom
        sx={{ color: "primary.main" }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <ArrowBack
          sx={{ cursor: "pointer", color: "primary.main" }}
          onClick={() => navigate("/")}
        />
        <Typography variant="h3" component="h1" sx={{ color: "primary.main" }}>
          Privacy Policy
        </Typography>
      </Box>

      <Typography
        variant="body2"
        sx={{ fontStyle: "italic", color: "text.secondary", mb: 4 }}
      >
        Last updated: June 20, 2025
      </Typography>

      <HighlightBox>
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Important Notice: This application uses YouTube API Services. By using
          YouTube Karaoke Together, you agree to be bound by the{" "}
          <Link
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: "#1565c0" }}
          >
            YouTube Terms of Service
          </Link>{" "}
          and the{" "}
          <Link
            href="https://www.google.com/policies/privacy"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: "#1565c0" }}
          >
            Google Privacy Policy
          </Link>
          .
        </Typography>
      </HighlightBox>

      <Section title="1. Information We Collect">
        <Typography paragraph>
          YouTube Karaoke Together ("we," "our," or "us") collects and processes
          the following types of information:
        </Typography>

        <Typography variant="h6" gutterBottom>
          1.1 YouTube API Data
        </Typography>
        <Typography paragraph>
          When you use our service, we access YouTube API Services to:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Search for videos based on your queries</ListItem>
          <ListItem>
            • Retrieve video metadata (titles, descriptions, thumbnails)
          </ListItem>
          <ListItem>• Display video content in embedded players</ListItem>
        </List>

        <Typography variant="h6" gutterBottom>
          1.2 User-Provided Information
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Display names you choose for karaoke sessions</ListItem>
          <ListItem>• Room preferences and settings</ListItem>
          <ListItem>• Video search queries</ListItem>
        </List>

        <Typography variant="h6" gutterBottom>
          1.3 Automatically Collected Information
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>
            • Device information (browser type, operating system)
          </ListItem>
          <ListItem>• IP addresses and location data</ListItem>
          <ListItem>• Usage patterns and session data</ListItem>
          <ListItem>• Cookies and similar tracking technologies</ListItem>
        </List>
      </Section>

      <Section title="2. How We Use Your Information">
        <Typography paragraph>We use the collected information to:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Provide synchronized video playback services</ListItem>
          <ListItem>• Manage karaoke room sessions and queues</ListItem>
          <ListItem>
            • Search and display YouTube content via API Services
          </ListItem>
          <ListItem>
            • Improve our service performance and user experience
          </ListItem>
          <ListItem>• Ensure technical functionality and security</ListItem>
        </List>
      </Section>

      <Section title="3. Information Sharing and Disclosure">
        <Typography paragraph>
          We share information in the following ways:
        </Typography>

        <Typography variant="h6" gutterBottom>
          3.1 With Google/YouTube
        </Typography>
        <Typography paragraph>
          Your use of YouTube content through our service is governed by
          YouTube's Terms of Service and Google's Privacy Policy. Video viewing
          data and API usage data are processed by Google.
        </Typography>

        <Typography variant="h6" gutterBottom>
          3.2 Within Karaoke Sessions
        </Typography>
        <Typography paragraph>
          Information you share in karaoke rooms (display names, video
          selections) is visible to other participants in the same room.
        </Typography>

        <Typography variant="h6" gutterBottom>
          3.3 Service Providers
        </Typography>
        <Typography paragraph>
          We may share data with third-party service providers who assist in:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Hosting and technical infrastructure</ListItem>
          <ListItem>• Analytics and performance monitoring</ListItem>
          <ListItem>• Security and fraud prevention</ListItem>
        </List>
      </Section>

      <Section title="4. Cookies and Tracking Technologies">
        <Typography paragraph>
          Our service stores, accesses, and collects information on your devices
          through:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>
            <strong>Essential Cookies:</strong> Required for basic
            functionality, room management, and user preferences
          </ListItem>
          <ListItem>
            <strong>Performance Cookies:</strong> Help us understand how you use
            our service
          </ListItem>
          <ListItem>
            <strong>YouTube Cookies:</strong> Placed by YouTube's embedded
            players and API services
          </ListItem>
          <ListItem>
            <strong>Local Storage:</strong> Stores your preferences and session
            data locally
          </ListItem>
        </List>
        <Typography paragraph>
          You can control cookies through your browser settings, but disabling
          them may affect service functionality.
        </Typography>
      </Section>

      <Section title="5. Data Retention">
        <List sx={{ pl: 4 }}>
          <ListItem>
            • Room data is automatically deleted after 24 hours of inactivity
          </ListItem>
          <ListItem>
            • User preferences are stored locally on your device
          </ListItem>
          <ListItem>• Search queries are not permanently stored</ListItem>
          <ListItem>
            • Log data is retained for up to 30 days for security purposes
          </ListItem>
        </List>
      </Section>

      <Section title="6. Your Rights and Choices">
        <Typography paragraph>You have the right to:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>
            • Access, update, or delete your personal information
          </ListItem>
          <ListItem>• Opt out of non-essential cookies</ListItem>
          <ListItem>• Request information about data we hold</ListItem>
          <ListItem>
            • Lodge complaints with data protection authorities
          </ListItem>
        </List>
      </Section>

      <Section title="7. Third-Party Services">
        <Typography paragraph>Our service integrates with:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>
            <strong>YouTube API Services:</strong> Governed by{" "}
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#1565c0" }}
            >
              Google's Privacy Policy
            </Link>
          </ListItem>
          <ListItem>
            <strong>YouTube Terms of Service:</strong>{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#1565c0" }}
            >
              https://www.youtube.com/t/terms
            </Link>
          </ListItem>
        </List>
      </Section>

      <Section title="8. Children's Privacy">
        <Typography paragraph>
          Our service is not intended for children under 13. We do not knowingly
          collect personal information from children under 13. If you believe we
          have collected such information, please contact us immediately.
        </Typography>
      </Section>

      <Section title="9. Security">
        <Typography paragraph>
          We implement appropriate technical and organizational measures to
          protect your information, including:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Encryption of data in transit</ListItem>
          <ListItem>• Regular security assessments</ListItem>
          <ListItem>• Access controls and authentication</ListItem>
          <ListItem>• Incident response procedures</ListItem>
        </List>
      </Section>

      <Section title="10. Contact Information">
        <Typography paragraph>
          If you have any questions about this Privacy Policy, please contact
          us:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Email: karaoke@zhong.au</ListItem>
          <ListItem>
            • Contact Form:{" "}
            <Link
              onClick={() => navigate("/contact")}
              sx={{ cursor: "pointer", color: "#1565c0" }}
            >
              Contact Us
            </Link>
          </ListItem>
        </List>
      </Section>

      <HighlightBox>
        <Typography variant="body1">
          <strong>External References:</strong>
        </Typography>
        <List>
          <ListItem>
            <strong>Google Privacy Policy:</strong>{" "}
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#1565c0" }}
            >
              https://www.google.com/policies/privacy
            </Link>
          </ListItem>
          <ListItem>
            <strong>YouTube Terms of Service:</strong>{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#1565c0" }}
            >
              https://www.youtube.com/t/terms
            </Link>
          </ListItem>
        </List>
      </HighlightBox>
    </Container>
  );
};

export default PrivacyPolicy;
