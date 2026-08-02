import React from "react";
import { ArrowBack } from "@mui/icons-material";
import { Box, Container, Link, List, ListItem, Paper, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../config";

const Section = ({ title, children }) => (
  <Box component="section" sx={{ mb: 5 }}>
    <Typography variant="h5" component="h2" sx={{ color: "#8B5CF6", fontWeight: 600, mb: 2 }}>{title}</Typography>
    {children}
  </Box>
);

const Item = ({ children }) => <ListItem sx={{ color: "text.secondary", alignItems: "flex-start" }}>•&nbsp;{children}</ListItem>;

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: "100vh", background: "linear-gradient(180deg, #0A0A0F 0%, #12121A 50%, #0A0A0F 100%)" }}>
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 2 }}>
          <Box onClick={() => navigate("/")} role="button" aria-label="Return home" sx={{ cursor: "pointer", p: 1, display: "grid", placeItems: "center", borderRadius: 2, background: "rgba(139,92,246,.1)" }}><ArrowBack sx={{ color: "#8B5CF6" }} /></Box>
          <Typography variant="h3" component="h1" sx={{ fontWeight: 700 }}>Privacy Policy</Typography>
        </Box>

        <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary", mb: 3 }}>
          Effective July 21, 2026 · Version {CURRENT_PRIVACY_POLICY_VERSION}
        </Typography>
        <Paper sx={{ p: 3, mb: 5, borderLeft: "4px solid #3B82F6", background: "rgba(59,130,246,.1)" }}>
          <Typography>
            YouTube Karaoke Together uses YouTube API Services. By using the service, you also agree to the{" "}
            <Link href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</Link>{" "}
            and acknowledge the <Link href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</Link>.
          </Typography>
        </Paper>

        <Section title="1. Information we process">
          <List disablePadding>
            <Item><strong>Active rooms:</strong>&nbsp;room identifiers, creation/activity times, room settings, playback checkpoints, selected YouTube video IDs and metadata, queue order, temporary controller display names/colors, and hashed room credentials.</Item>
            <Item><strong>Closed-room history:</strong>&nbsp;a minimized room summary, timestamps, client-count statistics, and selected-video history. Controller names, search queries, IP-address histories, user-agent histories, and raw credentials are excluded.</Item>
            <Item><strong>YouTube API operations:</strong>&nbsp;API method, quota bucket/cost, time, result status, latency, and optional room correlation. API keys are never displayed in the dashboard or usage records.</Item>
            <Item><strong>Administrator accounts:</strong>&nbsp;Google account subject identifier, email/name snapshot, role, sessions, invitations, and security audit events. Google sign-in is separate from YouTube account authorization.</Item>
            <Item><strong>Local browser data:</strong>&nbsp;policy/Terms acceptance version, room/controller credentials, display-name preference, and interface settings.</Item>
          </List>
          <Typography color="text.secondary">
            Search text is sent to YouTube to perform the requested search but is not persisted in room history. We do not download or store YouTube audiovisual content.
          </Typography>
        </Section>

        <Section title="2. How and why we use information">
          <List disablePadding>
            <Item>Operate synchronized rooms, controller registration, queues, playback recovery, and abuse/capacity controls.</Item>
            <Item>Restore active room state after a graceful or unexpected server restart.</Item>
            <Item>Allow authorized administrators to diagnose rooms, review minimized recent history, manage administrator access, and monitor API quota usage.</Item>
            <Item>Protect the service, investigate failures, satisfy deletion requests, and demonstrate retention-policy operation.</Item>
          </List>
          <Typography color="text.secondary">We do not sell personal information or use YouTube API Data to create advertising profiles or undisclosed derived YouTube metrics.</Typography>
        </Section>

        <Section title="3. Storage and retention">
          <List disablePadding>
            <Item>Active room state remains available while the room is active and is closed after 24 hours without authenticated room activity.</Item>
            <Item>When a room closes, controller identity/display-name records and room credentials are removed or revoked; remaining minimized room and selected-video history is retained in the live database for at most 28 days and never beyond 30 calendar days.</Item>
            <Item>Locally metered YouTube API usage records are retained in the live database for at most 28 days and never beyond 30 calendar days.</Item>
            <Item>Stored non-authorized YouTube API metadata is deleted before the 30-calendar-day boundary. Historical displays identify the time and context of the record.</Item>
            <Item>Application-managed operational backups rotate within 24 hours so they do not extend API-data age beyond the disclosed limit. A deletion may remain only in that short-lived recovery copy until rotation completes.</Item>
            <Item>Expired sessions and invitations are automatically removed. Browser-local preferences remain until you clear site data.</Item>
          </List>
        </Section>

        <Section title="4. Sharing and service providers">
          <Typography color="text.secondary" paragraph>Information is shared only as necessary with:</Typography>
          <List disablePadding>
            <Item><strong>YouTube and Google:</strong>&nbsp;for searches, video metadata, embedded playback, Google administrator sign-in, and related security/abuse processing.</Item>
            <Item><strong>Hosting and infrastructure providers:</strong>&nbsp;to run the application, encrypted transport, storage, logging, and backups.</Item>
            <Item><strong>Legal or security recipients:</strong>&nbsp;when reasonably required to comply with law or protect users and the service.</Item>
          </List>
          <Typography color="text.secondary">Embedded YouTube players may collect device, playback, cookie, and interaction information under Google’s policies. Playback is provided directly by YouTube.</Typography>
        </Section>

        <Section title="5. Your choices and deletion requests">
          <List disablePadding>
            <Item>You may decline an updated policy, but functionality covered by that update will not be available.</Item>
            <Item>You may clear browser-local preferences and room credentials through your browser’s site-data controls.</Item>
            <Item>A room creator can permanently delete the active room and correlated stored data from Room Admin by confirming the full room ID.</Item>
            <Item>You may also request access to or deletion of data related to you. We will remove applicable stored data as soon as reasonably possible and within seven calendar days.</Item>
            <Item>Deleting data from this application does not delete information held by YouTube. Use YouTube or an authorized YouTube client to manage YouTube-held data.</Item>
          </List>
          <Typography color="text.secondary">Send privacy and deletion requests through the <Link onClick={() => navigate("/contact")} sx={{ cursor: "pointer" }}>Contact page</Link>.</Typography>
        </Section>

        <Section title="6. Security">
          <Typography color="text.secondary">
            We use HTTPS in production, restricted administrative access, hashed bearer credentials, short-lived invitations, revocable server-side sessions, role-based access controls, CSRF protection, database access controls, and audited retention jobs. No internet service can guarantee absolute security.
          </Typography>
        </Section>

        <Section title="7. Children and international use">
          <Typography color="text.secondary" paragraph>The service is not directed to children under 13. YouTube content may have its own age or regional restrictions. We record the Made for Kids designation returned for a selected video as part of the video metadata described in section 1. Playback protections, including the privacy-enhanced YouTube embed domain, are applied uniformly to every video rather than varying by that designation.</Typography>
          <Typography color="text.secondary">Information may be processed where the service and its providers operate. Users are responsible for ensuring their use complies with applicable local law.</Typography>
        </Section>

        <Section title="8. Policy changes and contact">
          <Typography color="text.secondary">
            Material changes receive a new effective-date version. Browsers that previously selected “Don’t ask me again” are prompted once to accept the new current version before affected functionality is available. Questions: <Link href="mailto:karaoke@zhong.au">karaoke@zhong.au</Link>.
          </Typography>
        </Section>
      </Container>
    </Box>
  );
};

export default PrivacyPolicy;
