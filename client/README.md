# YouTube Karaoke Together - Client

React frontend for YouTube Karaoke Together.

## Development

```bash
# Install dependencies
npm install

# Create environment file for development
cp .env.example .env

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## Production Build

```bash
npm run build
```

Builds the app for production to the `dist` folder. The build is minified and optimized for best performance.

**Note**: In production, the client automatically uses `window.location.origin` for API calls and `/ws/` for Socket.IO connections. No environment variables are needed.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm test` - Run tests

## Environment Variables

Only needed for development:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DEV` | Enable development mode | `false` |
| `VITE_BACKEND_URL` | Backend server URL | Uses same origin |

## Learn More

See the main [README.md](../README.md) for full documentation.
