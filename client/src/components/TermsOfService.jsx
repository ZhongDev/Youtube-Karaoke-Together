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

  const WarningBox = ({ children }) => (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        my: 2,
        bgcolor: "warning.light",
        borderLeft: 4,
        borderColor: "warning.main",
        color: "black",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Warning sx={{ color: "warning.main", mt: 0.5 }} />
        <Box>{children}</Box>
      </Box>
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
          Terms of Service
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
          YouTube Terms of Service Binding: By using YouTube Karaoke Together,
          you agree to be bound by the{" "}
          <Link
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: "#1565c0" }}
          >
            YouTube Terms of Service
          </Link>
          . This application uses YouTube API Services and all YouTube content
          accessed through our service is subject to YouTube's terms.
        </Typography>
      </HighlightBox>

      <Section title="1. Acceptance of Terms">
        <Typography paragraph>
          By accessing or using YouTube Karaoke Together ("the Service"), you
          agree to be bound by these Terms of Service ("Terms"). If you do not
          agree to these Terms, please do not use the Service.
        </Typography>
      </Section>

      <Section title="2. YouTube API Services">
        <Typography paragraph>
          Our Service uses YouTube API Services to provide video search and
          playback functionality. By using our Service:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>
            • You acknowledge and agree to be bound by the{" "}
            <Link
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#1565c0" }}
            >
              YouTube Terms of Service
            </Link>
          </ListItem>
          <ListItem>
            • You understand that YouTube content accessed through our Service
            is subject to YouTube's policies
          </ListItem>
          <ListItem>
            • You agree to comply with YouTube's Community Guidelines
          </ListItem>
          <ListItem>
            • You acknowledge that YouTube may modify or discontinue API access
            at any time
          </ListItem>
        </List>
      </Section>

      <Section title="3. Service Description">
        <Typography paragraph>YouTube Karaoke Together provides:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Synchronized video viewing rooms</ListItem>
          <ListItem>• Collaborative video queue management</ListItem>
          <ListItem>• YouTube video search functionality</ListItem>
          <ListItem>• Multi-device control capabilities</ListItem>
        </List>
      </Section>

      <Section title="4. User Responsibilities">
        <Typography paragraph>
          As a user of our Service, you agree to:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Use the Service only for lawful purposes</ListItem>
          <ListItem>• Respect the rights of other users</ListItem>
          <ListItem>• Not attempt to disrupt or damage the Service</ListItem>
          <ListItem>• Not use automated systems to access the Service</ListItem>
          <ListItem>
            • Comply with YouTube's Terms of Service and Community Guidelines
          </ListItem>
          <ListItem>• Not share inappropriate or harmful content</ListItem>
        </List>
      </Section>

      <Section title="5. Prohibited Uses">
        <Typography paragraph>You may not use our Service to:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Violate any applicable laws or regulations</ListItem>
          <ListItem>• Infringe on intellectual property rights</ListItem>
          <ListItem>• Harass, abuse, or harm other users</ListItem>
          <ListItem>• Distribute malware or malicious content</ListItem>
          <ListItem>
            • Attempt to gain unauthorized access to our systems
          </ListItem>
          <ListItem>• Circumvent any security measures</ListItem>
        </List>
      </Section>

      <Section title="6. Privacy and Data">
        <Typography paragraph>
          Your privacy is important to us. Please review our{" "}
          <Link
            onClick={() => navigate("/privacy-policy")}
            sx={{ cursor: "pointer", color: "#1565c0" }}
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
            sx={{ color: "#1565c0" }}
          >
            Google Privacy Policy
          </Link>
          .
        </Typography>
      </Section>

      <Section title="7. Intellectual Property">
        <Typography paragraph>
          The Service and its original content, features, and functionality are
          owned by YouTube Karaoke Together and are protected by copyright,
          trademark, and other intellectual property laws. YouTube content
          accessed through our Service remains the property of YouTube and its
          licensors.
        </Typography>
      </Section>

      <Section title="8. Disclaimers">
        <WarningBox>
          <Typography variant="body1" sx={{ fontWeight: "bold" }}>
            Important: The Service is provided "as is" without warranties of any
            kind. We do not guarantee:
          </Typography>
          <List sx={{ mt: 1 }}>
            <ListItem>• Continuous or error-free operation</ListItem>
            <ListItem>• Availability of YouTube content</ListItem>
            <ListItem>• Compatibility with all devices</ListItem>
            <ListItem>• Security of user data</ListItem>
          </List>
        </WarningBox>
      </Section>

      <Section title="9. Limitation of Liability">
        <Typography paragraph>
          To the maximum extent permitted by law, YouTube Karaoke Together shall
          not be liable for any direct, indirect, incidental, special, or
          consequential damages resulting from:
        </Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Use or inability to use the Service</ListItem>
          <ListItem>• Loss of data or content</ListItem>
          <ListItem>• Service interruptions</ListItem>
          <ListItem>• Third-party actions or content</ListItem>
        </List>
      </Section>

      <Section title="10. Service Modifications">
        <Typography paragraph>We reserve the right to:</Typography>
        <List sx={{ pl: 4 }}>
          <ListItem>• Modify or discontinue the Service at any time</ListItem>
          <ListItem>• Update features and functionality</ListItem>
          <ListItem>• Change usage limitations</ListItem>
          <ListItem>• Suspend or terminate user access</ListItem>
        </List>
      </Section>

      <Section title="11. Contact Information">
        <Typography paragraph>
          For questions about these Terms of Service, please contact us:
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
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          External Terms and Policies:
        </Typography>
        <List sx={{ mt: 1 }}>
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
            <strong>Our Privacy Policy:</strong>{" "}
            <Link
              onClick={() => navigate("/privacy-policy")}
              sx={{ cursor: "pointer", color: "#1565c0" }}
            >
              Privacy Policy
            </Link>
          </ListItem>
        </List>
      </HighlightBox>

      <WarningBox>
        <Typography variant="body1" sx={{ fontWeight: "bold" }}>
          Acknowledgment: By using YouTube Karaoke Together, you acknowledge
          that you have read, understood, and agree to be bound by these Terms
          of Service and the YouTube Terms of Service.
        </Typography>
      </WarningBox>
    </Container>
  );
};

export default TermsOfService;
