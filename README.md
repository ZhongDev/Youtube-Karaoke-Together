# [YouTube Karaoke Together](https://kae.zhg.au)

YouTube Karaoke Together is a collaborative YouTube queue with a shared room/player display and mobile controllers. Version 3 adds durable SQLite room recovery, bounded playlist expansion, an authenticated operations dashboard, quota metering, and versioned privacy consent.

## Features

- Shared YouTube player with realtime queue and playback state
- QR-based mobile controllers with optional round-robin ordering
- Confirmed “add to top” actions from controller search and drag/keyboard reordering on the controller queue page
- Controller timeline seeking, exact timestamp entry, −15/+15 second jumps, play/pause, and persistent room volume
- Opt-in, Joysound-style time-synced lyrics over the room video, with romaji, Korean romanization, or pinyin over Japanese, Korean, and Chinese lyrics, and a controller Lyrics tab that mirrors the room screen
- Server-side lyrics lookup from LRCLIB and NetEase Cloud Music with a SQLite cache, plus administrator-provided lyrics, default sources, and default delays
- Server-validated video and playlist additions (up to 50 playable playlist entries per add)
- Unfiltered YouTube search (`safeSearch=none`); YouTube availability, age, region, and embed restrictions still apply
- Stable queue-item IDs and duplicate-safe skip/auto-advance
- SQLite-backed room, queue, controller, settings, and playback recovery
- Inactivity-based room closure and minimized room/video history for no more than 30 days
- Google-authenticated administrator dashboard for active rooms, recent history, YouTube API usage and configurable quota limits, administrators, and security audit events
- Versioned Terms/privacy acceptance, including one-time migration for browsers that previously selected “Don’t ask me again”

## Requirements

- Node.js 22.22.0 or newer (required by React Router 8; upgrade the deployment host before updating)
- npm 10+
- A YouTube Data API v3 key
- A Google OAuth web client ID if the administrator dashboard is enabled
- One writable application instance for the SQLite deployment
- Outbound HTTPS from the server to `lrclib.net` and `music.163.com` for lyrics lookups (optional; see `LYRICS_PROVIDERS`)
- About 400 MB of spare memory while Japanese reading aids are computed. The dictionary runs in a short-lived child process, described under [Lyrics](#lyrics)

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

Lyrics lookups need no key. `LYRICS_PROVIDERS` chooses the providers the server queries (`lrclib,netease` by default); set it to `none` to show only administrator-provided lyrics.

See [env.example](env.example) and [server-limits.json](server-limits.json) for all runtime and capacity settings. The current Privacy Policy version lives in [policy.json](policy.json), which both the server and the client bundle read so a bump cannot land on one side only.

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
npm audit --audit-level=high
npm --prefix client audit --audit-level=high
```

GitHub Actions runs exactly these install, test, build, and high-severity audit steps on Node 22.

The development UI runs at `http://localhost:3000`; the API and Socket.IO server default to `http://localhost:8080`.

## Administrator onboarding

1. Configure a Google OAuth web application and add the deployed frontend URL as an authorized JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` on the server and `VITE_GOOGLE_CLIENT_ID` when building the client. Administrator sign-in requests identity only; it does not request YouTube account scopes.
3. While the database has no owner, generate a short-lived, single-use bootstrap code:

   ```bash
   npm run admin:bootstrap
   ```

4. Open `/admin/bootstrap`, enter the code, and complete Google sign-in. Subsequent administrators must use an owner-created invitation from the dashboard.

Roles are `owner`, `admin`, and `viewer`. Administrators and owners can align the locally displayed YouTube quota limits with Google-approved increases and manage the lyrics cache; viewers have read-only access. Owners additionally manage invitations, roles, account status, and sessions; the last enabled owner cannot be demoted or disabled. If all owner access is accidentally lost, an operator with server/database access can recover an existing linked identity:

```bash
npm run admin:recover -- owner@example.com
```

This recovery action revokes that user’s sessions and creates an audit event; it does not create a network login backdoor.

## Persistence, retention, and backups

The default database is `data/youtube-karaoke.sqlite`. SQLite WAL mode, foreign keys, schema migrations, hashed bearer credentials, transactional structural writes, and periodic playback checkpoints are enabled.

- Active rooms close after 24 hours without authenticated room activity. A room player that is paused, ended, or idle is not activity, so a forgotten browser tab no longer holds a room open indefinitely.
- Playback checkpoints are written when playback changes state or its position advances, not on every snapshot the room player publishes.
- Active room state is restored after restart without advancing playback by server downtime.
- Playback volume is stored as room state, survives queue advances and restarts, and is reapplied whenever the player loads a video.
- On closure, controller identity/display-name rows and registration credentials are deleted or revoked.
- Minimized room/video history and locally metered YouTube API usage are live for at most 28 days, leaving headroom below the 30-calendar-day API-data limit for operational backup rotation.
- Search queries, raw tokens, IP-address histories, user-agent histories, and controller names are not retained in closed-room history.
- Active YouTube metadata approaching the retention boundary is refreshed through the API or replaced with an unavailable marker.
- A room creator can permanently delete an active room and its correlated stored data from Room Admin by confirming the full room ID; contact-based privacy requests remain available for other cases.
- The lyrics cache is keyed by YouTube video ID and holds a snapshot of the video's public title, channel, and duration. Maintenance refreshes that snapshot through the YouTube Data API after 21 days and deletes entries whose video is gone. An entry that cannot be refreshed within 28 days (for example, during a long API outage) is deleted together with its lyrics and reading aids.
  - **Curated songs.** Songs an administrator added, edited, refetched, or pasted lyrics for are never deleted by retention. When their snapshot cannot be kept, only the title, channel, and duration are removed; the video ID, administrator settings, search terms, and lyrics stay. The snapshot returns the next time a room plays the video. This mirrors how room queues replace expired YouTube metadata with an unavailable marker. The cache stores no room, controller, or personal identifier, so deleting a room does not touch it.
- Room lyrics settings, per-video source/offset adjustments, and each controller's lyrics preference are room state. Controller preferences are deleted with the controller records when a room closes, and adjustments are cleared.

Production enables daily backups by default in `backups/`; set `AUTO_BACKUPS=false` to use an external backup system. Application-managed backups older than 24 hours are removed after a successful replacement. External/manual backup systems must enforce equivalent data-age and deletion guarantees rather than adding another 30-day retention window.

Backups are scheduled by how long it has been since the last one, not by process uptime: the newest file in the backup directory is the reference point, the server takes an overdue backup during startup, and it re-checks periodically while running. A host that is redeployed or restarted more often than once a day therefore still produces daily backups, and a manual `npm run db:backup` counts toward the same schedule. Operational commands:

```bash
npm run db:integrity
npm run db:backup
```

To restore, stop the server, preserve the current database and WAL files, replace the database with a tested backup using the same file permissions/owner, run `npm run db:integrity`, and then start the server. Startup runs retention/expiry maintenance before reporting ready. Practice this procedure against a copy before relying on it in production.

SQLite assumes a single writable Node process. The repository/service boundaries and portable schema are intended to make a later PostgreSQL migration possible; do not place the current SQLite file behind multiple writers.

## YouTube API quota dashboard

Every YouTube request is routed through the metered service and records method, quota bucket, configured cost, result, and latency—never the API key itself. The v3 catalog follows the current separate-bucket model:

- `search.list`: one call from the default 100-search-calls/day bucket
- `videos.list` and `playlistItems.list`: one unit per request from the default 10,000 general-units/day bucket. Video lookups also request `contentDetails` for the track length lyrics providers use; that part costs nothing extra. Refreshing the lyrics cache spends one `videos.list` unit per 50 cached songs, at most 10 requests per hourly maintenance run
- `videos.insert`: separately modeled as one call from the default 100-video-uploads/day bucket, though this application does not upload videos
- Every page and failed/invalid request is counted
- Quota days use midnight Pacific Time

This catalog reflects Google's granular quota model documented by the [official YouTube Data API quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost). Dashboard values are local estimates. The Google Cloud Console remains authoritative, particularly for custom quota allocations or future Google policy changes.

Administrators and owners can edit the three daily bucket limits from the API Usage tab when Google grants a quota increase. Overrides are validated, audited, and stored in SQLite across restarts. They affect dashboard utilization percentages only: they neither modify per-method costs nor request quota from or enforce quota at Google. “Restore defaults” removes all local overrides.

## Lyrics

Lyrics are off until a controller turns on **Lyrics on the room screen** in its Controls tab. **Only for singers who turn lyrics on** narrows that to songs queued by controllers that switched on **Show lyrics on the room screen for songs I add** in their Lyrics tab.

- **Room display.** Two lanes in the lower part of the video, Joysound style: the first lane is anchored left and the second right, each line fades in before it is sung, is wiped from white to red as it is sung, then fades out. Word-synced (enhanced) LRC drives a word-accurate wipe. Over Japanese, Korean, and Chinese lyrics the room shows romaji, Revised Romanization, or pinyin above each word by default; Room Admin can switch that to furigana for Japanese or turn it off. The overlay is `aria-hidden` and passes every click and touch through to the YouTube player. A rendering failure is contained so it can never interrupt playback.
- **Controller Lyrics tab.** Mirrors the room screen line by line on a phone, keeping the sung line highlighted and centred, or as a plain scrolling list with time sync off. Controllers choose the source (LRCLIB, NetEase, or YKT for administrator lyrics, each only when it has lyrics for the song) and the offset, with −500/−100/+100/+500 ms buttons or an exact whole number. Positive offsets delay the lyrics. Source and offset apply to the whole room for that video and are remembered if it is queued again.
- **Lyrics match.** The Lyrics tab's **Match** button opens a screen with the YouTube title (selectable, with a copy button) next to what each source matched: track, artist, length (flagged when it is more than 5 seconds off the video's), and confidence, plus the searches that were run. If the match is wrong, any controller can search again with a corrected artist and title:
  - the lyrics are replaced only when the new search finds something, so a typo cannot erase them;
  - a correction is kept for the video and used in every room that plays it;
  - each controller gets 3 corrections a minute (`maxLyricsSearchesPerMinute` in [server-limits.json](server-limits.json));
  - every correction is recorded in the security audit log.
- **Lookup and cache.** The server parses the video title (including `Artist「Title」`, `Artist【Title】`, `Artist《Title》`, and mixed-script names) together with the channel name, and searches both providers, using the Data API track length to pick the right recording.
  - **Channel as artist.** How much the channel counts as the artist depends on what kind of channel it is:
    - auto-generated `Artist - Topic` channels are taken as the artist outright;
    - VEVO (`ArianaGrandeVevo` becomes "Ariana Grande") and "Official" channels are nearly as trusted;
    - for other channels, the channel is tried first when the title is just the song, and late when the title already names a different artist (re-upload and lyric channels);
    - labels, broadcasters, and karaoke or live-session series (HYBE LABELS, THE FIRST TAKE) are never treated as the artist, and their names are removed from the title.
  - **Matching.** A provider's title must resemble the song: artist and length agreeing cannot make a differently titled song (a cover, a remix, the same band's other song) a match. Traditional and Simplified Chinese are compared by their reading, and titles in different scripts (a romanized title against the Japanese one) are left to artist and length.
  - **Caching and retries.** Every hit is cached per source, and concurrent requests share one lookup. Misses are retried after a week. Failures are retried after 15 minutes, or after 2 minutes once the song is playing. A busy (503) LRCLIB search is retried once.
  - **When lookups start.** A lookup starts when the room screen is to show a song's lyrics or when a controller opens its Lyrics tab, which works even while the room screen has lyrics off.
  - **Prefetch.** The next five queued songs are looked up ahead of time whenever the room will show their lyrics, or someone in the room has read lyrics on the Lyrics tab in the last 30 minutes. Their reading aid (romaji, romanization, or pinyin) is prepared too, so lyrics appear as soon as each song starts. A song that starts playing jumps ahead of pending prefetches.
- **Reading aids.** Korean romanization is algorithmic and Chinese pinyin comes from `pinyin-pro`. Japanese needs the kuromoji dictionary, which occupies roughly 350 MB while loaded, so it runs in a child process that starts on demand and exits after two minutes idle; only ending the process returns that memory. Readings are stored with the lyrics, so each song is analysed once.
- **Timing across screens.** Every client estimates the server clock from `time-sync` round trips, keeping the fastest of its recent samples. The room smooths the player's coarse time reports, stamps each playback report with the server-clock time at which its position was true, and reports its latency. Controllers extrapolate from that stamp, so network delay in either direction does not shift their lyrics. Measured on one machine, the phone and room started each line a median of about 1 ms apart and never more than 30 ms; across real networks the remaining error is bounded by how unevenly the fastest round trip splits between its two directions. The Lyrics tab shows the measured room and controller latency.
- **Administration.** The dashboard's Lyrics tab lists cached songs with search, sorting, and pagination. Administrators and owners can add a video by URL or ID, set a default source and default delay, override the search artist/track, refetch from providers, paste LRC or plain lyrics (shown as the YKT source, up to 30,000 characters), preview with reading aids, or delete an entry. Every change is audited.

## Architecture

```text
server.js                    startup and graceful shutdown
src/server/
  config.js                  environment, origins, and limits
  createServer.js            Express/Socket.IO composition and routes
  database.js                migrations, repositories, history, admin data
  roomService.js             room/queue/playback/controller invariants
  youtubeService.js          YouTube requests, playlists, refresh, quota meter
  lyricsService.js           lyrics lookup queue, cache, source selection, documents, admin edits
  lyricsProviders.js         LRCLIB and NetEase Cloud Music clients
  lyricsTitle.js             YouTube title parser and fuzzy matching for searches
  lyricsText.js              LRC parser, provider-body cleanup, script detection
  lyricsReading.js           romaji, Korean romanization, pinyin; tokenizer process manager
  lyricsReadingWorker.js     on-demand kuromoji child process
  adminService.js            Google identities, bootstrap, sessions, RBAC
  socketHandlers.js          validated realtime transport boundary
client/src/
  components/                public route/page composition
  hooks/                     shared Socket.IO client lifecycle
  features/controller/       search, playback controls, display-name sync
  features/room/             room player identity and playback adapters
  features/lyrics/           two-track overlay, line view, server clock, playback estimate
  features/admin/            login, dashboard panels, API client
  features/consent/          versioned local consent migration
  pages/                     lazy-loaded route shells
```

The large room and controller routes are lazy loaded. `Control.jsx` now delegates search, queue, controls, settings, consent, and realtime helpers to feature-owned modules instead of owning the whole UI and network flow.

Pending queue items can be reordered from the controller Queue tab by dragging the left handle or using its keyboard controls. With round-robin disabled, a controller may reorder the shared pending queue. With round-robin enabled, each controller can reorder only videos it added; the server then rebuilds the interleaving without changing the fair turn sequence. Likewise, “add to top” places a confirmed search result at the top of the shared pending queue normally, or at the top of that controller’s personal order in round-robin mode. Neither operation changes or restarts the current video.

The controller Controls tab can seek with an interactive timeline or −15/+15 second buttons, pause or resume playback, and set the room volume. Tapping the displayed current time opens exact `(hh:)mm:ss(.000)` entry; malformed timestamps and times beyond the current video duration are rejected before any command is sent. Commands carry the expected queue-item ID so a delayed seek or play/pause action cannot affect a newly advanced video. The server validates and persists the desired state, forwards the command only to authenticated room-player connections, and reconciles it with the player’s regular playback snapshots. After a saved paused checkpoint is restored, the room player’s native pause/play controls continue to work normally and publish their resulting state.

## Security and privacy notes

- Exact-origin CORS is used for HTTP and Socket.IO; lookalike domains are rejected.
- New QR registration capabilities travel in URL fragments (not HTTP requests or proxy logs) and are removed from the visible URL after session storage; the server stores only credential hashes. Legacy query credentials are also stripped immediately.
- Registration links are short-lived; controller and administrator sessions are revocable.
- Administrator cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`; mutations also require CSRF tokens and RBAC.
- Search, playlist/video additions, room creation, login, and realtime events are bounded or rate limited.
- Playlist and video additions spend the shared YouTube API quota, so their per-minute budgets are keyed on the registered controller and held server-side. Reconnecting does not return a fresh allowance. The general realtime event ceiling stays per-connection, since it guards a single socket against flooding.
- Lyrics providers receive only search terms derived from a video's public title and channel, plus its duration, from the server. No room, controller, or browser identifier is sent and no provider cookies are kept. Lyrics documents are served only to authenticated room players and controllers of the room playing the song.
- The Privacy Policy is versioned `2026-10-31`; room creation and controller registration assert that version, and the server records only a bounded anonymous acceptance hash. Browsers that accepted an earlier version are asked to accept the update once.

The implementation is designed to follow the current YouTube API Developer Policies, but deployment configuration and applicable local law remain operator responsibilities. Important routes: `/privacy-policy`, `/terms-of-service`, and `/contact`.

## Production deployment

For a simple single-server deployment, use Nginx for HTTPS and static files and PM2 for the Node process. The checked-in [ecosystem.config.js](ecosystem.config.js) runs exactly one fork-mode instance, restarts it after failure, and allows 15 seconds for the server's graceful shutdown. Keep it at one instance: the current SQLite deployment does not support PM2 cluster mode or multiple writable workers.

Install dependencies, configure the application, and build the frontend:

```bash
npm ci
npm --prefix client ci
npm --prefix client run build
npm install --global pm2

mkdir -p data backups
chmod 700 data backups
chmod 600 .env
```

Set `NODE_ENV=production`, the public HTTPS origin, API credentials, and a stable `TOKEN_PEPPER` in the root `.env`. If administrator sign-in is enabled, set `VITE_GOOGLE_CLIENT_ID` in `client/.env.production.local` before building; it must match the server's `GOOGLE_CLIENT_ID` and the deployed URL must be an authorized Google OAuth JavaScript origin.

Start the backend as the unprivileged deployment user, then register PM2 with the server's startup system:

```bash
pm2 start ecosystem.config.js
pm2 startup
# Run the sudo command printed by `pm2 startup`, then save the process list:
pm2 save
```

Do not run `sudo pm2 start`: the PM2 process list and startup service belong to the user that runs the application. Verify the process, logs, and database readiness with:

```bash
pm2 status
pm2 logs youtube-karaoke-together
curl --fail http://127.0.0.1:8080/api/ready
```

Serve the contents of `client/dist/` over HTTPS and proxy `/api/` and `/ws/` to the Node process. Start from [nginx.example.conf](nginx.example.conf), set the Nginx document root to the deployed frontend files, and expose only ports 80 and 443 through the server firewall. Keep port 8080 private. Ensure the database and backup directories remain writable only by the deployment user. Production enables the application's daily, 24-hour-rotation backups by default.

For an update from the repository directory:

```bash
git pull --ff-only
npm ci
npm --prefix client ci
npm --prefix client run build
# Copy the new client/dist contents to the Nginx document root, if it is separate.
pm2 restart ecosystem.config.js --only youtube-karaoke-together --update-env
pm2 save
curl --fail http://127.0.0.1:8080/api/ready
```

Allow outbound HTTPS to `lrclib.net` and `music.163.com` if lyrics lookups are wanted, and leave headroom for the Japanese reading-aid process (about 400 MB while it runs). Configure PM2 or system log rotation so process logs cannot grow without bound. After changing the installed Node.js version, rerun `pm2 startup` and the command it prints so the boot service uses the new Node.js path. See the [PM2 startup documentation](https://pm2.keymetrics.io/docs/usage/startup/) for the platform-specific details.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
