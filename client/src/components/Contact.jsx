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
import { ArrowBack, Email } from "@mui/icons-material";

const Contact = () => {
  const navigate = useNavigate();

  const ContactCard = ({ icon, title, description }) => (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        mb: 3,
        background: "rgba(18, 18, 26, 0.7)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(148, 163, 184, 0.1)",
        borderLeft: "4px solid #8B5CF6",
        borderRadius: 2,
        transition: "all 0.3s",
        "&:hover": {
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderLeft: "4px solid #8B5CF6",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 2,
            background: "rgba(139, 92, 246, 0.1)",
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Email:{" "}
        <Link
          href="mailto:karaoke@zhong.au"
          sx={{ color: "#8B5CF6" }}
        >
          karaoke@zhong.au
        </Link>
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        {description}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontStyle: "italic", color: "#8B5CF6" }}
      >
        We will get back to you as soon as possible.
      </Typography>
    </Paper>
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
          bottom: "20%",
          right: "15%",
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
            Contact Us
          </Typography>
        </Box>

        <Typography variant="body1" paragraph sx={{ color: "text.secondary", mb: 4 }}>
          We're here to help! Please don't hesitate to reach out with any
          questions, concerns, or feedback about YouTube Karaoke Together.
        </Typography>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 5,
            background: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            <strong style={{ color: "#60A5FA" }}>Quick Note:</strong> For issues related to YouTube content,
            please refer to{" "}
            <Link
              href="https://support.google.com/youtube"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "#60A5FA" }}
            >
              YouTube Support
            </Link>{" "}
            as content policies and availability are managed by YouTube.
          </Typography>
        </Paper>

        <Typography
          variant="h4"
          component="h2"
          gutterBottom
          sx={{ color: "#8B5CF6", fontWeight: 600, mb: 3 }}
        >
          Contact Information
        </Typography>

        <ContactCard
          icon={<Email sx={{ color: "#8B5CF6", fontSize: 24 }} />}
          title="All Inquiries"
          description="For all questions, including general inquiries, technical support, privacy & legal matters, terms of service questions, feature requests, and feedback about the service."
        />

        <Typography
          variant="h4"
          component="h2"
          gutterBottom
          sx={{ color: "#8B5CF6", fontWeight: 600, mb: 3, mt: 5 }}
        >
          Additional Resources
        </Typography>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            background: "rgba(18, 18, 26, 0.7)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(148, 163, 184, 0.1)",
            borderRadius: 2,
          }}
        >
          <List>
            <ListItem
              sx={{
                borderRadius: 1,
                mb: 1,
                "&:hover": { background: "rgba(139, 92, 246, 0.05)" },
              }}
            >
              <Link
                onClick={() => navigate("/privacy-policy")}
                sx={{ cursor: "pointer", color: "#8B5CF6" }}
              >
                Privacy Policy
              </Link>
              <Typography component="span" sx={{ color: "text.secondary", ml: 1 }}>
                - How we handle your data
              </Typography>
            </ListItem>
            <ListItem
              sx={{
                borderRadius: 1,
                mb: 1,
                "&:hover": { background: "rgba(139, 92, 246, 0.05)" },
              }}
            >
              <Link
                onClick={() => navigate("/terms-of-service")}
                sx={{ cursor: "pointer", color: "#8B5CF6" }}
              >
                Terms of Service
              </Link>
              <Typography component="span" sx={{ color: "text.secondary", ml: 1 }}>
                - User agreement and terms
              </Typography>
            </ListItem>
            <ListItem
              sx={{
                borderRadius: 1,
                mb: 1,
                "&:hover": { background: "rgba(139, 92, 246, 0.05)" },
              }}
            >
              <Link
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                YouTube Terms of Service
              </Link>
            </ListItem>
            <ListItem
              sx={{
                borderRadius: 1,
                mb: 1,
                "&:hover": { background: "rgba(139, 92, 246, 0.05)" },
              }}
            >
              <Link
                href="https://www.google.com/policies/privacy"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                Google Privacy Policy
              </Link>
            </ListItem>
            <ListItem
              sx={{
                borderRadius: 1,
                "&:hover": { background: "rgba(139, 92, 246, 0.05)" },
              }}
            >
              <Link
                href="https://support.google.com/youtube"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "#8B5CF6" }}
              >
                YouTube Support
              </Link>
            </ListItem>
          </List>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            p: 3,
            mt: 4,
            background: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            <strong style={{ color: "#60A5FA" }}>Important:</strong> By contacting us, you acknowledge that you
            have read our{" "}
            <Link
              onClick={() => navigate("/privacy-policy")}
              sx={{ cursor: "pointer", color: "#60A5FA" }}
            >
              Privacy Policy
            </Link>{" "}
            and understand how we handle your information. All communications are
            subject to our{" "}
            <Link
              onClick={() => navigate("/terms-of-service")}
              sx={{ cursor: "pointer", color: "#60A5FA" }}
            >
              Terms of Service
            </Link>
            .
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default Contact;
