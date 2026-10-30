# YouTube Karaoke Together client

React 19/Vite 7 frontend for the shared room, mobile controller, legal pages, and authenticated administrator dashboard.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

The Vite server uses port 3000. Development variables:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_DEV` | Use an explicit development backend | `false` |
| `VITE_BACKEND_URL` | Development API/Socket.IO origin | `http://localhost:8080` when development mode is enabled |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services web client ID for `/admin` | none |

Production API and Socket.IO connections use `window.location.origin`; Socket.IO uses `/ws/`. `VITE_GOOGLE_CLIENT_ID` is still required at build time when administrator sign-in is enabled.

## Scripts

```bash
npm run dev       # Vite development server
npm run build     # production bundle in dist/
npm run preview   # preview the production bundle
npm test          # Vitest watch mode
npm run test:run  # one complete client test run
```

## Structure

- `App.jsx`: theme, error boundary, lazy route composition
- `components/`: public room/controller composition and legal/contact pages
- `features/controller/`: YouTube search, playback controls, the Lyrics tab, registration dialog, route navigation, and queue-ordering helpers
- `features/room/`: stable player identity plus playback-command and saved-volume adapters
- `features/lyrics/`: Joysound-style two-track overlay and scheduler, per-line phone view, server-clock synchronisation, the room player's smoothed clock, remote playback estimation, and the shared lyrics state/document hook
- `features/admin/`: Google login, protected dashboard, room/history/quota/lyrics/admin panels
- `features/consent/`: versioned Terms/privacy local-storage migration
- `hooks/useSocket.js`: shared connection plus precisely scoped request/listener helpers
- `config.js`: runtime connection and storage-key helpers

The room, controller, legal, and admin routes are lazy loaded. `Control.jsx` is a route-level composer rather than the former all-in-one controller. Search pagination ignores stale responses, and the search panel stays mounted so its query and results survive controller tab changes. Controller mutations use request-correlated Socket.IO acknowledgements. Room playback identity is based on stable queue-item IDs, preventing controller metadata and queue updates from restarting the active video while still allowing the same YouTube video to be queued consecutively.

Search results provide adjacent confirmed “add to top” and standard add actions. The Queue tab uses `@dnd-kit` mouse, touch, and keyboard sensors on a left-side handle, applies an optimistic local reorder, and restores authoritative room state if the server rejects a stale order. Normal mode reorders all pending items. Round-robin mode exposes handles only for the authenticated controller’s items and sends only that personal order, leaving inter-controller turn fairness to the server.

The Controls tab provides an accessible playback timeline, exact `(hh:)mm:ss(.000)` entry by tapping the current time, −15/+15 second seeking, play/pause, and a 0–100 room-volume slider. Exact entry validates both syntax and the current video duration. Seek and volume sliders update locally while being dragged and send one server command when committed. The room player applies acknowledged commands without changing video identity, reports the resulting playback snapshot, restores paused checkpoints correctly, releases restore enforcement so its native pause/play controls remain usable, and reapplies persisted volume on every video load.

The controller's bottom navigation is Search, Queue, Lyrics, Controls, and Settings. The Controls tab turns lyrics on for the room (and optionally only for singers who opt in). The Lyrics tab shows the current song line by line, keeps the sung line centred, and can switch to a plain list. It also chooses the room's lyrics source and sets the offset with ±100/±500 ms buttons or an exact whole number (positive delays the lyrics), toggles romaji or pinyin, and holds the singer's own "show lyrics for songs I add" preference. Its **Match** screen (`features/controller/LyricsMatchDialog.jsx`) shows the YouTube title beside what each source matched (`lyrics-match`) and sends corrected searches (`lyrics-search`). Small `lyrics-updated` states arrive over Socket.IO; the lyrics text is fetched with `lyrics-get` only when its revision or reading mode changes.

The room renders lyrics in an `aria-hidden`, `pointer-events: none` overlay above the YouTube iframe, so every click and touch reaches the player. A `SyncClock` anchors to the moments the embed's coarse `getCurrentTime()` value changes and extrapolates between them; the overlay reads it every animation frame and writes opacity and wipe clip-paths straight to the DOM. Room and controllers both synchronise to the server clock (`serverClock.js`), the room stamps each playback report with the server time its position was true, and controllers extrapolate from that stamp (`playbackEstimate.js`). Room Admin chooses romaji/romanization/pinyin, furigana, or no reading aid for the room screen. Lyrics rendering sits behind its own error boundary so a failure cannot interrupt playback or the controller.

The API Usage dashboard shows Google&apos;s catalog defaults alongside persisted local limits. `admin` and `owner` roles can edit or restore those limits; `viewer` access remains read-only. Local limits change dashboard comparisons only and do not alter Google&apos;s enforced quota.

The Lyrics dashboard tab searches, sorts, and pages through the server's lyrics cache. Opening a song shows its provider lookups, the automatic search terms derived from the title and channel, and stored sources, and offers a reading-aid preview. `admin` and `owner` roles can set the default source and delay, override search terms, refetch, paste YKT lyrics, add a video by URL or ID, or delete the entry; `viewer` access is read-only. Songs an administrator touched are marked "Curated · kept past retention", and a song whose YouTube details expired says so and shows the provider's title instead.

See the [main README](../README.md) for server configuration, administrator onboarding, persistence, deployment, and privacy/retention behavior.
