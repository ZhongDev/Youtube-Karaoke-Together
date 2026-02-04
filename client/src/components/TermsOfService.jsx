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
import { ArrowBack, Warning } from "@mui/icons-material";

const TermsOfService = () => {
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

  const WarningBox = ({ children }) => (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        my: 3,
        background: "rgba(245, 158, 11, 0.1)",
        border: "1px solid rgba(245, 158, 11, 0.2)",
        borderLeft: "4px solid #F59E0B",
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Warning sx={{ color: "#F59E0B", mt: 0.5 }} />
        <Box>{children}</Box>
      </Box>
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
          left: "10%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)",
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
            Terms of Service
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
            YouTube Terms of Service Binding: By using YouTube Karaoke Together,
            you agree to be bound by the{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#60A5FA" }}
            >
              YouTube Terms of Service
            </Link>
            . This application uses YouTube API Services and all YouTube content
            accessed through our service is subject to YouTube's terms.
          </Typography>
        </HighlightBox>

        <Section title="1. Acceptance of Terms">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            By accessing or using YouTube Karaoke Together ("the Service"), you
            agree to be bound by these Terms of Service ("Terms"). If you do not
            agree to these Terms, please do not use the Service.
          </Typography>
        </Section>

        <Section title="2. YouTube API Services">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Our Service uses YouTube API Services to provide video search and
            playback functionality. By using our Service:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>
              • You acknowledge and agree to be bound by the{" "}
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                YouTube Terms of Service
              </Link>
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • You understand that YouTube content accessed through our Service
              is subject to YouTube's policies
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • You agree to comply with YouTube's Community Guidelines
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • You acknowledge that YouTube may modify or discontinue API access
              at any time
            </ListItem>
          </List>
        </Section>

        <Section title="3. Service Description">
          <Typography paragraph sx={{ color: "text.secondary" }}>YouTube Karaoke Together provides:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Synchronized video viewing rooms</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Collaborative video queue management</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• YouTube video search functionality</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Multi-device control capabilities</ListItem>
          </List>
        </Section>

        <Section title="4. User Responsibilities">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            As a user of our Service, you agree to:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Use the Service only for lawful purposes</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Respect the rights of other users</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Not attempt to disrupt or damage the Service</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Not use automated systems to access the Service</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Comply with YouTube's Terms of Service and Community Guidelines
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Not share inappropriate or harmful content</ListItem>
          </List>
        </Section>

        <Section title="5. Prohibited Uses">
          <Typography paragraph sx={{ color: "text.secondary" }}>You may not use our Service to:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Violate any applicable laws or regulations</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Infringe on intellectual property rights</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Harass, abuse, or harm other users</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Distribute malware or malicious content</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>
              • Attempt to gain unauthorized access to our systems
            </ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Circumvent any security measures</ListItem>
          </List>
        </Section>

        <Section title="6. Privacy and Data">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            Your privacy is important to us. Please review our{" "}
            <Link
              onClick={() => navigate("/privacy-policy")}
              sx={{ cursor: "pointer", color: "#8B5CF6" }}
            >
              Privacy Policy
            </Link>
            , which explains how we collect, use, and protect your information. By
            using the Service, you also consent to Google's data practices as
            outlined in the{" "}
            <Link
              href="https://www.google.com/policies/privacy"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#8B5CF6" }}
            >
              Google Privacy Policy
            </Link>
            .
          </Typography>
        </Section>

        <Section title="7. Intellectual Property">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            The Service and its original content, features, and functionality are
            owned by YouTube Karaoke Together and are protected by copyright,
            trademark, and other intellectual property laws. YouTube content
            accessed through our Service remains the property of YouTube and its
            licensors.
          </Typography>
        </Section>

        <Section title="8. Disclaimers">
          <WarningBox>
            <Typography variant="body1" sx={{ fontWeight: 600, color: "text.primary" }}>
              Important: The Service is provided "as is" without warranties of any
              kind. We do not guarantee:
            </Typography>
            <List sx={{ mt: 1 }}>
              <ListItem sx={{ color: "text.secondary" }}>• Continuous or error-free operation</ListItem>
              <ListItem sx={{ color: "text.secondary" }}>• Availability of YouTube content</ListItem>
              <ListItem sx={{ color: "text.secondary" }}>• Compatibility with all devices</ListItem>
              <ListItem sx={{ color: "text.secondary" }}>• Security of user data</ListItem>
            </List>
          </WarningBox>
        </Section>

        <Section title="9. Limitation of Liability">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            To the maximum extent permitted by law, YouTube Karaoke Together shall
            not be liable for any direct, indirect, incidental, special, or
            consequential damages resulting from:
          </Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Use or inability to use the Service</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Loss of data or content</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Service interruptions</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Third-party actions or content</ListItem>
          </List>
        </Section>

        <Section title="10. Service Modifications">
          <Typography paragraph sx={{ color: "text.secondary" }}>We reserve the right to:</Typography>
          <List sx={{ pl: 2 }}>
            <ListItem sx={{ color: "text.secondary" }}>• Modify or discontinue the Service at any time</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Update features and functionality</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Change usage limitations</ListItem>
            <ListItem sx={{ color: "text.secondary" }}>• Suspend or terminate user access</ListItem>
          </List>
        </Section>

        <Section title="11. Contact Information">
          <Typography paragraph sx={{ color: "text.secondary" }}>
            For questions about these Terms of Service, please contact us:
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
            External Terms and Policies:
          </Typography>
          <List>
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
              <strong style={{ color: "#F1F5F9" }}>Our Privacy Policy:</strong>{" "}
              <Link
                onClick={() => navigate("/privacy-policy")}
                sx={{ cursor: "pointer", color: "#8B5CF6" }}
              >
                Privacy Policy
              </Link>
            </ListItem>
          </List>
        </HighlightBox>

        <WarningBox>
          <Typography variant="body1" sx={{ fontWeight: 600, color: "text.primary" }}>
            Acknowledgment: By using YouTube Karaoke Together, you acknowledge
            that you have read, understood, and agree to be bound by these Terms
            of Service and the YouTube Terms of Service.
          </Typography>
        </WarningBox>
      </Container>
    </Box>
  );
};

export default TermsOfService;
