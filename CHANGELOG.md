# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added controller playback controls for timeline seeking, exact `(hh:)mm:ss(.000)` time entry with duration validation, −15/+15 second jumps, play/pause, and room volume
- Added authenticated, stale-item-safe playback commands that are acknowledged by the server and forwarded only to the room player
- Added room-level volume persistence across video changes, reconnects, and SQLite-backed server restarts
- Added service, Socket.IO, controller UI, and player-adapter tests for playback commands and persistence

### Changed

- Room players now restore paused playback intent and saved volume instead of always forcing resumed videos to play
- Bumped the root and client application versions to 3.2.0

### Fixed

- Released paused-checkpoint enforcement after restoration so the room player’s native controls can resume playback normally
- Enlarged controller queue reorder handles to a 48×48-pixel touch target for more reliable mobile dragging

### Documentation

- Updated the root and client READMEs with controller playback controls and persistent-volume behavior

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
