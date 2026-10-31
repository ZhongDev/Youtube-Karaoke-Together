# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added opt-in time-synced lyrics. A controller turns on **Lyrics on the room screen** from Controls, optionally **Only for singers who turn lyrics on**, so a song shows lyrics only when the controller that queued it has enabled lyrics for their own songs
- Added a Joysound-style two-lane lyrics overlay over the room video: lines fade in ahead of time and are wiped from white to red as they are sung, word-accurately for enhanced LRC. The overlay is hidden from assistive technology and passes every click and touch through to the YouTube player
- Added reading aids over CJK lyrics on by default: romaji for Japanese (kuromoji), Revised Romanization for Korean, and pinyin for Chinese (pinyin-pro). Room Admin can switch the room screen to furigana for Japanese or turn reading aids off
- Added a controller Lyrics tab that mirrors the room screen line by line with the sung line kept centred, or as a plain list with time sync off. It selects the room's lyrics source (LRCLIB, NetEase, or YKT administrator lyrics) and sets the offset with ±100/±500 ms buttons or an exact whole number
- Added server-side lyrics lookup from LRCLIB and NetEase Cloud Music. It parses the video title together with the channel name, weighing the channel as the artist by its kind (Topic, VEVO, official, label). It rejects provider results whose title does not resemble the song, keeps a SQLite cache of every hit, remembers misses, uses retry windows, and shares concurrent lookups
- Added a lyrics match screen to the controller Lyrics tab. It shows the YouTube title (selectable, with a copy button) beside each source's matched track, artist, length, and confidence, and the searches that were run. Any controller can search again with a corrected artist and title; lyrics are replaced only when that search finds something, and the correction is kept for the video
- Added retention protection for curated lyrics. Songs an administrator added, edited, refetched, or pasted lyrics for lose only their YouTube title, channel, and duration when that snapshot can no longer be kept, rather than being deleted; the snapshot returns when a room plays the video again
- Added lyrics prefetching: the next five queued songs are looked up, with their reading aids prepared, whenever the room shows their lyrics or someone in the room reads lyrics on a controller
- Added a Lyrics tab to the administrator dashboard: a searchable, sortable, paginated table of cached songs and a per-song view to set the default source and delay, override search terms, refetch, add a video by URL or ID, paste YKT lyrics, preview reading aids, and delete entries
- Added `time-sync` clock probing. The room stamps each playback report with the server-clock time its position was true, plus its playback rate and measured latency, so controllers extrapolate the same position whatever their own network delay
- Added the `LYRICS_PROVIDERS` setting to choose providers or turn provider lookups off
- Added server, Socket.IO, administrator API, retention, and client tests for lyrics lookup, caching, display rules, timing, and the controller and administrator interfaces

### Changed

- The room player now smooths the embed's coarse time reports and reports playback state changes immediately as well as once per second
- `update-settings` accepts partial room settings and acknowledges the resulting settings
- YouTube video lookups also request `contentDetails` for the track length, which costs no additional quota
- Controller navigation gained a Lyrics tab between Queue and Controls
- Administrator dashboard tabs are identified by name, so owner-only tabs stay gated as tabs are added
- Japanese reading aids load their ~350 MB dictionary in an on-demand child process that exits when idle, isolating its memory and any failure from the server

### Security

- Lyrics documents are served only to authenticated room players and controllers of the room playing the song; lyrics edits require the `admin` role and a CSRF token and are audited
- Updated server dependencies within their existing version ranges to resolve the high and critical `npm audit` advisories:
  - `proxy-addr` 2.0.8: IP spoofing through IPv4-mapped IPv6 trust subnets, critical (GHSA-jqcg-44mw-7w3h)
  - `body-parser` 1.20.9 (GHSA-27r3-jxmh-p828)
  - `engine.io` 6.6.11 (GHSA-2gc4-cqfq-p2gv)
  - `socket.io-parser` 4.2.7 (GHSA-2m8v-j782-fhvr)
  - `ip-address` 10.7.5 via `express-rate-limit` (GHSA-mwp4-54f8-5fhr and seven related advisories)
  - `brace-expansion` (GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p)
  - development-only `shell-quote` 1.12.0 via `concurrently` 9.2.5: command injection, critical (GHSA-pqg4-j6r4-53mv)
  - `express` 4.22.3, which moves `qs` to 6.16.2 for three moderate advisories
- Updated client dependencies within their existing version ranges:
  - `vite` 7.3.7 (GHSA-587h-7wmj-h5pm and four lower-severity advisories)
  - `browserslist` 4.29.5 (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g)
  - `nanoid` 3.3.20 (GHSA-2v37-7h3g-55p8)
  - `socket.io-parser` 4.2.7 (GHSA-2m8v-j782-fhvr)
  - `source-map-js` 1.2.2 (GHSA-68fv-2mgg-jv7q)
  - `vitest` 4.1.12 for moderate test-tooling advisories
- Controller lyrics-search corrections require the controller's key and the current queue item. They are limited per controller by `maxLyricsSearchesPerMinute` and recorded in the security audit log. A correction that finds nothing changes nothing

### Documentation

- Updated the Privacy Policy to version `2026-10-31`: it discloses the lyrics providers and the search terms they receive, the lyrics cache and its refresh-or-delete retention, room lyrics settings and controller preferences, and playback timing data. Browsers that accepted an earlier version are asked to accept the update
- Updated the Terms of Service with the optional lyrics feature, its third-party sources, and lyrics rights
- Documented lyrics behavior, configuration, retention, quota use, memory needs, and outbound network requirements in the README and client README

## [3.3.0] - 2026-08-02 - Reliability and Maintenance

### Changed

- Replaced `react-router-dom` 7 with `react-router` 8, which now provides the DOM router exports directly
- Raised the minimum supported Node.js version to 22.22.0, as required by React Router 8
- Moved the current Privacy Policy version into `policy.json`, which the server and the client bundle both read, so a version bump can no longer land on one side only
- Bumped the root and client application versions to 3.3.0

### Security

- Keyed the per-minute playlist and video addition budgets on the registered controller and moved them out of the socket connection, so reconnecting no longer resets the allowance that protects the shared YouTube API quota
- Updated `brace-expansion` to resolve a high-severity denial-of-service advisory (GHSA-mh99-v99m-4gvg)
- Updated `postcss` to resolve a high-severity source-map path-traversal advisory (GHSA-r28c-9q8g-f849)
- Moved to `react-router` 8 to resolve a high-severity advisory (GHSA-qwww-vcr4-c8h2) that has no fixed release on the `react-router-dom` 7 line

### Fixed

- Fixed round-robin skipping singers: the rotation restarted at the earliest-registered controller whenever the current singer had no pending videos of their own, pushing whoever's turn it was back a full cycle
- Round-robin now hands the rotation to the departing controller's predecessor when the last served controller leaves the room, instead of resetting it
- Queue reorders that resolve to no change are now persisted and broadcast, so a controller applying reorders optimistically cannot keep a diverged queue
- Queue items whose controller record is gone are kept out of the persisted round-robin participant list and can no longer be dropped from the queue
- Stopped room players rewriting the whole room once per second while paused or ended; playback is now checkpointed when its state changes or its position advances
- Paused, ended, and idle room players no longer count as room activity, so a forgotten browser tab can no longer hold a room open past the inactivity window
- Fixed automatic backups never running on a host that restarts more often than the backup interval: the schedule now follows the time since the last backup instead of process uptime, and an overdue backup is taken during startup
- Stopped the controller Settings display name from clearing itself after a successful save when “Remember me” was off
- Controller screens now show the display name the room actually assigned, including the collision suffix added when the chosen name is already taken
- Queue lists now show the stored, periodically refreshed YouTube thumbnail instead of always rebuilding a URL from the video ID

### Documentation

- Recorded the Node.js 22.22.0 minimum in the README requirements
- Corrected Privacy Policy section 7, which implied the Made for Kids designation configures playback; the designation is recorded as video metadata and playback protections apply uniformly to every video. No data collection changed, so the policy version is unchanged
- Aligned the documented audit commands with the ones CI runs, and added the hooks and room feature directories to the README architecture map

## [3.2.0] - Playback Controls

### Added

- Added controller playback controls for timeline seeking, exact `(hh:)mm:ss(.000)` time entry with duration validation, −15/+15 second jumps, play/pause, and room volume
- Added authenticated, stale-item-safe playback commands that are acknowledged by the server and forwarded only to the room player
- Added room-level volume persistence across video changes, reconnects, and SQLite-backed server restarts
- Added service, Socket.IO, controller UI, and player-adapter tests for playback commands and persistence
- Added a checked-in PM2 ecosystem configuration for a single restartable production process with graceful shutdown

### Changed

- Room players now restore paused playback intent and saved volume instead of always forcing resumed videos to play
- Bumped the root and client application versions to 3.2.0

### Fixed

- Released paused-checkpoint enforcement after restoration so the room player’s native controls can resume playback normally
- Enlarged controller queue reorder handles to a 48×48-pixel touch target for more reliable mobile dragging

### Documentation

- Updated the root and client READMEs with controller playback controls and persistent-volume behavior
- Documented a simple PM2 and Nginx production setup, verification flow, reboot persistence, and update procedure

## [3.1.0] - Queue Ordering

### Added

- Added a confirmed “add to top” action beside the standard controller search-result add button
- Added accessible mouse, touch, and keyboard queue reordering from left-side handles on the controller Queue tab
- Added server-side queue-order validation, persistence, auditing, and realtime synchronization with optimistic client updates and stale-order recovery
- Added focused service and client tests for priority insertion, shared and round-robin reorder scopes, restart persistence, and confirmation behavior

### Changed

- In round-robin mode, priority additions now lead only the requesting controller’s personal order, and reordering is restricted to that same personal order before fair turn interleaving is rebuilt
- Derived server startup and health versions from the root package metadata and bumped the root/client packages to 3.1.0

### Documentation

- Updated the root and client READMEs with priority-add, drag/keyboard reorder, and round-robin behavior

## [3.0.0] - 2026-07-21 - Durable Rooms and Administration

### Added

- SQLite schema migrations, transactional room/queue/controller persistence, playback checkpoints, and active-room restart recovery
- Minimized administrator-visible room and selected-video history with automatic pre-30-day purge and metadata refresh boundaries
- Daily production SQLite backups with 24-hour rotation, integrity/backup commands, restore guidance, readiness checks, and graceful shutdown
- Google Identity Services administrator sign-in with one-time first-owner bootstrap, invitations, revocable sessions, CSRF protection, and owner/admin/viewer roles
- Lazy-loaded administrator dashboard for active rooms, recent history, room detail, connected/peak client counts, YouTube API usage, administrator access, and audit events
- Locally metered, versioned YouTube quota catalog with separate search, general, and video-upload buckets and Pacific-Time reporting
- SQLite-persisted, audited daily quota-limit overrides editable by administrator and owner roles, with one-click restoration to catalog defaults
- Bounded server-side playlist expansion and playable/public-video validation through the YouTube API
- Versioned privacy consent and a one-time updated-policy modal for browsers carrying the legacy `tosDoNotAsk` preference
- Creator-authenticated permanent deletion for active room data, including correlated API usage and anonymous policy records
- Executable Node and Vitest suites covering malformed socket events, CORS, queue identity, duplicate advance, recovery, retention, admin bootstrap/session/CSRF, quota metering, and consent migration
- Node 22 GitHub Actions gate for clean installs, server/client tests, production build, and dependency audits

### Changed

- Split the former server monolith into configuration, security, database, room, YouTube, admin, HTTP, and Socket.IO modules
- Reduced the controller route by moving search/pagination and playback controls into feature-owned components; lazy-loaded controller, room, admin, contact, and legal routes
- Changed queue removal from rendered indexes to stable queue-item IDs and required the expected current item for skip/auto-advance
- Changed room expiry from creation age to authenticated inactivity and added a visible room-closed event
- Changed permanent shared controller registration capabilities to short-lived registration invitations
- Moved new QR registration credentials into non-request URL fragments and removed registration/legacy player credentials from visible URLs immediately after local capability storage
- Limited live room/API history to 28 days and application-managed recovery backups to 24 hours so backup rotation does not silently extend the 30-day API-data boundary
- Updated the Privacy Policy and Terms effective July 21, 2026 to describe persistence, administrator access, retention, deletion, and policy-version acceptance
- Updated root/client packages and bumped the application and client versions to 3.0.0

### Fixed

- Prevented malformed or missing Socket.IO payloads from throwing before guarded validation and terminating the Node process
- Prevented lookalike origins from bypassing prefix-based CORS checks
- Prevented duplicate player/controller advance events from skipping multiple queued items
- Corrected round-robin continuation to track a stable last-served controller ID, including when idle participants are filtered from the queued set
- Preserved controller credentials across transient disconnects/timeouts while distinguishing disabled, removed, and invalid credentials
- Added precise socket listener cleanup, request-correlated acknowledgements, scoped room membership and search authorization, stale search-response protection, and playback validation/reset behavior
- Added visible retry/skip recovery for YouTube player failures and canonical display-boundary title decoding
- Prevented controller color/name metadata updates and additions behind the active item from restarting room playback; player transitions now follow stable queue-item identity
- Preserved controller search queries and results when switching between controller tabs

### Security

- Store room/controller/player/invitation/administrator bearer credentials as hashes and keep raw credentials out of logs, history, and dashboard responses
- Added exact CORS, Helmet security headers, bounded payloads/events, rate limits, short-lived invitations, secure administrator cookies, RBAC, recent reauthentication, and last-owner protection
- Removed controller names, search queries, IP/user-agent histories, and credentials from closed-room history
- Updated vulnerable Engine.IO, `ws`, React Router, Express, and related dependency trees; production and development audits report zero known vulnerabilities at release verification

### Documentation

- Rebuilt the root and client READMEs for v3 setup, architecture, Google admin onboarding, SQLite operations, retention, quota accounting, testing, and deployment
- Added repository-wide `AGENTS.md` guidance requiring README/changelog reconciliation after every major build session

## [2.0.0] - 2026-02-05 - Security, Controls, and UI

### Added

- Room admin tools for controller management and in-place renaming (updates existing queue entries)
- Capacity limits via `server-limits.json` for rooms, controllers, queue size, and payload bounds
- Custom fullscreen player mode

### Fixed

- Playback sync on control pages and queue progress updates
- Auto-advance handling and restart behavior when the next queued video matches the current video

### Changed

- Major UI refresh and updated video listing presentation
- npm audit dependency fixes
- .gitignore updates

### Security

- Token-based room control with controller registration and player/admin separation
- Authenticated search API with rate limiting
- Tightened CORS and Socket.IO payload size enforcement

## [1.3.0] - 2024-01-15 - Enhanced User Experience & Error Handling

### Added

- **Skip Button** for "Now Playing" section in queue with confirmation modal
- **Comprehensive Error Message Handling** from server to client
- Error notifications displayed to users for all server-side operations
- Better feedback for failed operations (room joining, queue management, etc.)

### Fixed

- Username change functionality in Settings component when "Remember me" is unchecked
- Proper localStorage management for username persistence
- Cross-component communication for username updates
- Settings modal logic for name changes

### Improved

- Enhanced server-side error handling for all socket events
- Better user experience with immediate error feedback
- More robust queue management with proper error states

## [1.2.0] - 2024-01-15 - YouTube API Compliance & Legal

### Added - YouTube API Compliance

- **New Homepage/Landing Page** with Terms of Service modal
- **Comprehensive Privacy Policy** addressing all YouTube API requirements
- **Terms of Service** explicitly binding users to YouTube ToS
- **Contact Page** with multiple contact methods
- **ToS Confirmation Modal** with "Accept", "Don't ask again", and "Decline" options
- **YouTube API Notices** displayed prominently throughout the application
- **Legal compliance notifications** in all components using YouTube API Services

### Legal & Compliance

- ✅ Fixed: API Clients now state users agree to YouTube Terms of Service (III.A.1)
- ✅ Fixed: Added comprehensive Privacy Policy (III.A.2a)
- ✅ Fixed: Privacy Policy references Google Privacy Policy (III.A.2b)
- ✅ Fixed: Privacy Policy explains YouTube API Services usage (III.A.2c)
- ✅ Fixed: Privacy Policy details user information access/collection/storage (III.A.2d)
- ✅ Fixed: Privacy Policy explains information processing and sharing (III.A.2e)
- ✅ Fixed: Privacy Policy discloses cookie/device information collection (III.A.2g)
- ✅ Fixed: Added comprehensive contact information (III.A.2i)

## [1.1.0] - 2024-01-15 - Bug Fixes and Improvements

### Added

- Rate limiting middleware to prevent API abuse (10 requests per minute for room creation)
- Custom React hook `useSocket` for consistent socket connection management
- Error boundary component for graceful error handling
- Environment variables example file (`.env.example`)
- Better error messages and user feedback
- Proper request header handling for QR code generation

### Fixed

- **Critical**: Fixed multiple socket instance creation across components
- **Critical**: Fixed QR code generation to work with proxy servers and custom domains
- **Critical**: Added fallback configuration when config files are missing
- Fixed missing environment variables validation
- Fixed incomplete README instructions regarding API key setup
- Improved error handling in API calls with proper HTTP status checking

### Changed

- Enhanced server configuration loading with better error handling
- Improved QR code generation to use request headers for proper URL construction
- Better logging with environment information
- Socket connection now includes reconnection logic and timeout handling

### Security

- Added rate limiting to prevent abuse
- Improved request validation and error handling
- Added proper proxy trust configuration

### Performance

- Single socket instance shared across components reduces connection overhead
- Better memory management with proper event listener cleanup
- Optimized room cleanup process

## [1.0.0] - Initial Release

### Added

- Basic YouTube Karaoke Together functionality
- Room creation and management
- Real-time video queue synchronization
- Mobile-friendly control interface
- QR code generation for easy mobile access
- YouTube video search integration
