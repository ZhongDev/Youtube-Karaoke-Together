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

  const HighlightBox = ({ children, color = "info" }) => (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        my: 3,
        background: color === "info" 
          ? "rgba(59, 130, 246, 0.1)" 
          : "rgba(139, 92, 246, 0.1)",
        border: `1px solid ${color === "info" 
          ? "rgba(59, 130, 246, 0.2)" 
          : "rgba(139, 92, 246, 0.2)"}`,
        borderLeft: `4px solid ${color === "info" ? "#3B82F6" : "#8B5CF6"}`,
        borderRadius: 2,
      }}
    >
      {children}
    </Paper>
  );

  const Section = ({ title, children }) => (
    <Box sx={{ mb: 5 }}>
      <Typography
        variant="h5"
        component="h2"
        gutterBottom
        sx={{ 
          color: "#8B5CF6", 
          fontWeight: 600,
          mb: 2,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0A0A0F 0%, #12121A 50%, #0A0A0F 100%)",
        position: "relative",
      }}
    >
      {/* Background glow */}
      <Box
        sx={{
          position: "absolute",
          top: "5%",
          right: "10%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="md" sx={{ py: 6, position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Box
            onClick={() => navigate("/")}
            sx={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 2,
              background: "rgba(139, 92, 246, 0.1)",
              border: "1px solid rgba(139, 92, 246, 0.2)",
              transition: "all 0.2s",
              "&:hover": {
                background: "rgba(139, 92, 246, 0.2)",
              },
            }}
          >
            <ArrowBack sx={{ color: "#8B5CF6" }} />
          </Box>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Privacy Policy
          </Typography>
        </Box>

        <Typography
          variant="body2"
          sx={{ fontStyle: "italic", color: "text.secondary", mb: 4 }}
        >
          Last updated: June 20, 2025
        </Typography>

        <HighlightBox color="info">
          <Typography variant="body1" sx={{ fontWeight: 600, color: "text.primary" }}>
            Important Notice: This application uses YouTube API Services. By using
            YouTube Karaoke Together, you agree to be bound by the{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#60A5FA" }}
            >
              YouTube Terms of Service
            </Link>{" "}
            and the{" "}
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#60A5FA" }}
            >
              Google Privacy Policy
            </Link>
            .
          </Typography>
        </HighlightBox>

        <Section title="1. Information We Collect">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            YouTube Karaoke Together ("we," "our," or "us") collects and processes
            the following types of information:
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            1.1 YouTube API Data
          </Typography>
          <Typography paragraph sx={{ color: "text.secondary" }}>
            When you use our service, we access YouTube API Services to:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Search for videos based on your queries</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Retrieve video metadata (titles, descriptions, thumbnails)
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Display video content in embedded players</ListItem>
          </List>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            1.2 User-Provided Information
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Display names you choose for karaoke sessions</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Room preferences and settings</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Video search queries</ListItem>
          </List>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            1.3 Automatically Collected Information
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              • Device information (browser type, operating system)
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• IP addresses and location data</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Usage patterns and session data</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Cookies and similar tracking technologies</ListItem>
          </List>
        </Section>

        <Section title="2. How We Use Your Information">
          <Typography paragraph sx={{ color: "text.secondary" }}>We use the collected information to:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Provide synchronized video playback services</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Manage karaoke room sessions and queues</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Search and display YouTube content via API Services
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Improve our service performance and user experience
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Ensure technical functionality and security</ListItem>
          </List>
        </Section>

        <Section title="3. Information Sharing and Disclosure">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            We share information in the following ways:
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            3.1 With Google/YouTube
          </Typography>
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Your use of YouTube content through our service is governed by
            YouTube's Terms of Service and Google's Privacy Policy. Video viewing
            data and API usage data are processed by Google.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            3.2 Within Karaoke Sessions
          </Typography>
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Information you share in karaoke rooms (display names, video
            selections) is visible to other participants in the same room.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
            3.3 Service Providers
          </Typography>
          <Typography paragraph sx={{ color: "text.secondary" }}>
            We may share data with third-party service providers who assist in:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Hosting and technical infrastructure</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Analytics and performance monitoring</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Security and fraud prevention</ListItem>
          </List>
        </Section>

        <Section title="4. Cookies and Tracking Technologies">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Our service stores, accesses, and collects information on your devices
            through:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>Essential Cookies:</strong> Required for basic
              functionality, room management, and user preferences
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>Performance Cookies:</strong> Help us understand how you use
              our service
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>YouTube Cookies:</strong> Placed by YouTube's embedded
              players and API services
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>Local Storage:</strong> Stores your preferences and session
              data locally
            </ListItem>
          </List>
          <Typography paragraph sx={{ color: "text.secondary" }}>
            You can control cookies through your browser settings, but disabling
            them may affect service functionality.
          </Typography>
        </Section>

        <Section title="5. Data Retention">
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              • Room data is automatically deleted after 24 hours of inactivity
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • User preferences are stored locally on your device
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Search queries are not permanently stored</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Log data is retained for up to 30 days for security purposes
            </ListItem>
          </List>
        </Section>

        <Section title="6. Your Rights and Choices">
          <Typography paragraph sx={{ color: "text.secondary" }}>You have the right to:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              • Access, update, or delete your personal information
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Opt out of non-essential cookies</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Request information about data we hold</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Lodge complaints with data protection authorities
            </ListItem>
          </List>
        </Section>

        <Section title="7. Third-Party Services">
          <Typography paragraph sx={{ color: "text.secondary" }}>Our service integrates with:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>YouTube API Services:</strong> Governed by{" "}
              <Link
                href="https://www.google.com/policies/privacy"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                Google's Privacy Policy
              </Link>
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>YouTube Terms of Service:</strong>{" "}
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                https://www.youtube.com/t/terms
              </Link>
            </ListItem>
          </List>
        </Section>

        <Section title="8. Children's Privacy">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Our service is not intended for children under 13. We do not knowingly
            collect personal information from children under 13. If you believe we
            have collected such information, please contact us immediately.
          </Typography>
        </Section>

        <Section title="9. Security">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            We implement appropriate technical and organizational measures to
            protect your information, including:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Encryption of data in transit</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Regular security assessments</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Access controls and authentication</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Incident response procedures</ListItem>
          </List>
        </Section>

        <Section title="10. Contact Information">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            If you have any questions about this Privacy Policy, please contact
            us:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Email: karaoke@zhong.au</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Contact Form:{" "}
              <Link
                onClick={() => navigate("/contact")}
                sx={{ cursor: "pointer", color: "#8B5CF6" }}
              >
                Contact Us
              </Link>
            </ListItem>
          </List>
        </Section>

        <HighlightBox>
          <Typography variant="body1" sx={{ fontWeight: 600, color: "text.primary", mb: 2 }}>
            External References:
          </Typography>
          <List>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>Google Privacy Policy:</strong>{" "}
              <Link
                href="https://www.google.com/policies/privacy"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                https://www.google.com/policies/privacy
              </Link>
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              <strong style={{ color: "#F1F5F9" }}>YouTube Terms of Service:</strong>{" "}
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                https://www.youtube.com/t/terms
              </Link>
            </ListItem>
          </List>
        </HighlightBox>
      </Container>
    </Box>
  );
};

export default PrivacyPolicy;
