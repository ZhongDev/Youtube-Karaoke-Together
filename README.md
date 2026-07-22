# [YouTube Karaoke Together](https://kae.zhg.au)

YouTube Karaoke Together is a collaborative YouTube queue with a shared room/player display and mobile controllers. Version 3 adds durable SQLite room recovery, bounded playlist expansion, an authenticated operations dashboard, quota metering, and versioned privacy consent.

## Features

- Shared YouTube player with realtime queue and playback state
- QR-based mobile controllers with optional round-robin ordering
- Confirmed “add to top” actions from controller search and drag/keyboard reordering on the controller queue page
- Server-validated video and playlist additions (up to 50 playable playlist entries per add)
- Unfiltered YouTube search (`safeSearch=none`); YouTube availability, age, region, and embed restrictions still apply
- Stable queue-item IDs and duplicate-safe skip/auto-advance
- SQLite-backed room, queue, controller, settings, and playback recovery
- Inactivity-based room closure and minimized room/video history for no more than 30 days
- Google-authenticated administrator dashboard for active rooms, recent history, YouTube API usage and configurable quota limits, administrators, and security audit events
- Versioned Terms/privacy acceptance, including one-time migration for browsers that previously selected “Don’t ask me again”

## Requirements

- Node.js 22 LTS (minimum supported by the current toolchain: Node 20.19 or 22.12)
- npm 10+
- A YouTube Data API v3 key
- A Google OAuth web client ID if the administrator dashboard is enabled
- One writable application instance for the SQLite deployment

## Install and configure

```bash
git clone https://github.com/ZhongDev/Youtube-Karaoke-Together.git
cd Youtube-Karaoke-Together
npm install
npm --prefix client install
cp env.example .env
cp client/.env.example client/.env
```

Required server settings in `.env`:

```dotenv
NODE_ENV=development
PORT=8080
PUBLIC_FRONTEND_ORIGIN=http://localhost:3000
YOUTUBE_API_KEY=replace_me
TOKEN_PEPPER=replace_with_at_least_32_random_characters
GOOGLE_CLIENT_ID=replace_me.apps.googleusercontent.com
```

For local administrator sign-in, put the same web client ID in `client/.env`:

```dotenv
VITE_DEV=true
VITE_BACKEND_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=replace_me.apps.googleusercontent.com
```

`TOKEN_PEPPER` is mandatory and must contain at least 32 characters in production. Preserve it across restarts or persisted room/controller credentials will no longer validate.

See [env.example](env.example) and [server-limits.json](server-limits.json) for all runtime and capacity settings.

## Run and verify

```bash
# Server and Vite client together
npm run dev:full

# Complete automated checks
npm run check

# Individual commands
npm test
npm run test:client
npm --prefix client run build
npm audit --omit=dev
npm --prefix client audit --omit=dev
```

The same install, test, build, and high-severity audit gate runs in GitHub Actions on Node 22.

The development UI runs at `http://localhost:3000`; the API and Socket.IO server default to `http://localhost:8080`.

## Administrator onboarding

1. Configure a Google OAuth web application and add the deployed frontend URL as an authorized JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` on the server and `VITE_GOOGLE_CLIENT_ID` when building the client. Administrator sign-in requests identity only; it does not request YouTube account scopes.
3. While the database has no owner, generate a short-lived, single-use bootstrap code:

   ```bash
   npm run admin:bootstrap
   ```

4. Open `/admin/bootstrap`, enter the code, and complete Google sign-in. Subsequent administrators must use an owner-created invitation from the dashboard.

Roles are `owner`, `admin`, and `viewer`. Administrators and owners can align the locally displayed YouTube quota limits with Google-approved increases; viewers have read-only access. Owners additionally manage invitations, roles, account status, and sessions; the last enabled owner cannot be demoted or disabled. If all owner access is accidentally lost, an operator with server/database access can recover an existing linked identity:

```bash
npm run admin:recover -- owner@example.com
```

This recovery action revokes that user’s sessions and creates an audit event; it does not create a network login backdoor.

## Persistence, retention, and backups

The default database is `data/youtube-karaoke.sqlite`. SQLite WAL mode, foreign keys, schema migrations, hashed bearer credentials, transactional structural writes, and periodic playback checkpoints are enabled.

- Active rooms close after 24 hours without authenticated room activity.
- Active room state is restored after restart without advancing playback by server downtime.
- On closure, controller identity/display-name rows and registration credentials are deleted or revoked.
- Minimized room/video history and locally metered YouTube API usage are live for at most 28 days, leaving headroom below the 30-calendar-day API-data limit for operational backup rotation.
- Search queries, raw tokens, IP-address histories, user-agent histories, and controller names are not retained in closed-room history.
- Active YouTube metadata approaching the retention boundary is refreshed through the API or replaced with an unavailable marker.
- A room creator can permanently delete an active room and its correlated stored data from Room Admin by confirming the full room ID; contact-based privacy requests remain available for other cases.

Production enables daily backups by default in `backups/`; set `AUTO_BACKUPS=false` to use an external backup system. Application-managed backups older than 24 hours are removed after a successful replacement. External/manual backup systems must enforce equivalent data-age and deletion guarantees rather than adding another 30-day retention window. Operational commands:

```bash
npm run db:integrity
npm run db:backup
```

To restore, stop the server, preserve the current database and WAL files, replace the database with a tested backup using the same file permissions/owner, run `npm run db:integrity`, and then start the server. Startup runs retention/expiry maintenance before reporting ready. Practice this procedure against a copy before relying on it in production.

SQLite assumes a single writable Node process. The repository/service boundaries and portable schema are intended to make a later PostgreSQL migration possible; do not place the current SQLite file behind multiple writers.

## YouTube API quota dashboard

Every YouTube request is routed through the metered service and records method, quota bucket, configured cost, result, and latency—never the API key itself. The v3 catalog follows the current separate-bucket model:

- `search.list`: one call from the default 100-search-calls/day bucket
- `videos.list` and `playlistItems.list`: one unit per request from the default 10,000 general-units/day bucket
- `videos.insert`: separately modeled as one call from the default 100-video-uploads/day bucket, though this application does not upload videos
- Every page and failed/invalid request is counted
- Quota days use midnight Pacific Time

This catalog reflects Google's granular quota model documented by the [official YouTube Data API quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost). Dashboard values are local estimates. The Google Cloud Console remains authoritative, particularly for custom quota allocations or future Google policy changes.

Administrators and owners can edit the three daily bucket limits from the API Usage tab when Google grants a quota increase. Overrides are validated, audited, and stored in SQLite across restarts. They affect dashboard utilization percentages only: they neither modify per-method costs nor request quota from or enforce quota at Google. “Restore defaults” removes all local overrides.

## Architecture

```text
server.js                    startup and graceful shutdown
src/server/
  config.js                  environment, origins, and limits
  createServer.js            Express/Socket.IO composition and routes
  database.js                migrations, repositories, history, admin data
  roomService.js             room/queue/playback/controller invariants
  youtubeService.js          YouTube requests, playlists, refresh, quota meter
  adminService.js            Google identities, bootstrap, sessions, RBAC
  socketHandlers.js          validated realtime transport boundary
client/src/
  components/                public route/page composition
  features/controller/       search and playback-control features
  features/admin/            login, dashboard panels, API client
  features/consent/          versioned local consent migration
  pages/                     lazy-loaded route shells
```

The large room and controller routes are lazy loaded. `Control.jsx` now delegates search, queue, controls, settings, consent, and realtime helpers to feature-owned modules instead of owning the whole UI and network flow.

Pending queue items can be reordered from the controller Queue tab by dragging the left handle or using its keyboard controls. With round-robin disabled, a controller may reorder the shared pending queue. With round-robin enabled, each controller can reorder only videos it added; the server then rebuilds the interleaving without changing the fair turn sequence. Likewise, “add to top” places a confirmed search result at the top of the shared pending queue normally, or at the top of that controller’s personal order in round-robin mode. Neither operation changes or restarts the current video.

## Security and privacy notes

- Exact-origin CORS is used for HTTP and Socket.IO; lookalike domains are rejected.
- New QR registration capabilities travel in URL fragments (not HTTP requests or proxy logs) and are removed from the visible URL after session storage; the server stores only credential hashes. Legacy query credentials are also stripped immediately.
- Registration links are short-lived; controller and administrator sessions are revocable.
- Administrator cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`; mutations also require CSRF tokens and RBAC.
- Search, playlist/video additions, room creation, login, and realtime events are bounded or rate limited.
- The Privacy Policy is versioned `2026-07-21`; room creation and controller registration assert that version, and the server records only a bounded anonymous acceptance hash.

The implementation is designed to follow the current YouTube API Developer Policies, but deployment configuration and applicable local law remain operator responsibilities. Important routes: `/privacy-policy`, `/terms-of-service`, and `/contact`.

## Production deployment

Build the frontend:

```bash
npm --prefix client run build
NODE_ENV=production npm start
```

Serve `client/dist/` over HTTPS and proxy `/api/` and `/ws/` to the Node process. Start from [nginx.example.conf](nginx.example.conf), set the production origins and secrets, ensure the database/backup directories are writable only by the service account, and keep the Google OAuth origin configuration synchronized with the public URL.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
