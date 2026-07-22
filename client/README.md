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
- `features/controller/`: YouTube search, playback controls, registration dialog, route navigation, and queue-ordering helpers
- `features/admin/`: Google login, protected dashboard, room/history/quota/admin panels
- `features/consent/`: versioned Terms/privacy local-storage migration
- `hooks/useSocket.js`: shared connection plus precisely scoped request/listener helpers
- `config.js`: runtime connection and storage-key helpers

The room, controller, legal, and admin routes are lazy loaded. `Control.jsx` is a route-level composer rather than the former all-in-one controller. Search pagination ignores stale responses, and the search panel stays mounted so its query and results survive controller tab changes. Controller mutations use request-correlated Socket.IO acknowledgements. Room playback identity is based on stable queue-item IDs, preventing controller metadata and queue updates from restarting the active video while still allowing the same YouTube video to be queued consecutively.

Search results provide adjacent confirmed “add to top” and standard add actions. The Queue tab uses `@dnd-kit` mouse, touch, and keyboard sensors on a left-side handle, applies an optimistic local reorder, and restores authoritative room state if the server rejects a stale order. Normal mode reorders all pending items. Round-robin mode exposes handles only for the authenticated controller’s items and sends only that personal order, leaving inter-controller turn fairness to the server.

The API Usage dashboard shows Google&apos;s catalog defaults alongside persisted local limits. `admin` and `owner` roles can edit or restore those limits; `viewer` access remains read-only. Local limits change dashboard comparisons only and do not alter Google&apos;s enforced quota.

See the [main README](../README.md) for server configuration, administrator onboarding, persistence, deployment, and privacy/retention behavior.
