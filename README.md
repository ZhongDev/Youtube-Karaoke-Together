# YouTube Karaoke Together

A collaborative YouTube video queuing system that allows multiple users to watch and queue videos together. The system consists of a main room with a YouTube player and a queue display, and a mobile-friendly control panel for searching and adding videos to the queue.

## Features

- Create unique rooms for watching YouTube videos together
- Real-time video queue management
- Mobile-friendly control panel accessible via QR code
- YouTube video search and queue functionality
- Synchronized video playback across all users
- **YouTube API Compliant** - Full legal compliance with YouTube ToS
- **Privacy-First Design** - Comprehensive privacy protection
- **Terms of Service Protection** - Clear user agreements
- **Round-Robin Queueing (Optional)** - Fair turn rotation between participants, toggleable from the Controls tab
- **Secure Room Control** - Token-based authentication for room management

## Security Model

The application uses a token-based authentication system:

- **Player Key**: Generated when a room is created. Used by the room screen for admin actions and playback updates. Stored in the room URL and localStorage.
- **Control Master Key**: Embedded in the QR code URL. Required to register new controllers.
- **Controller Keys**: Issued to each user when they scan the QR code and enter their name. Required for all queue operations.

Room admins (the room screen) can:
- View all registered controllers
- Enable/disable individual controllers
- Remove controllers
- Toggle whether new controller registrations are allowed
- Rename controllers (updates existing queue entries)

## Prerequisites

- Node.js 18+
- npm 9+
- YouTube Data API key

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/youtube-karaoke-together.git
cd youtube-karaoke-together
```

### 2. Install dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 3. Configure environment variables

#### Server (.env)

```bash
cp env.example .env
```

Edit `.env` and set:

```bash
PORT=8080
NODE_ENV=development
PUBLIC_FRONTEND_ORIGIN=http://localhost:3000
YOUTUBE_API_KEY=your_api_key_here

### 3a. Configure limits (optional)

The server uses `server-limits.json` for capacity and payload bounds. Defaults are generous but finite.

```json
{
  "maxRooms": 5000,
  "maxControllersPerRoom": 500,
  "maxQueueLengthPerRoom": 1000,
  "maxUsernameLength": 50,
  "maxVideoTitleLength": 200,
  "maxVideoIdLength": 64,
  "maxSearchQueryLength": 200,
  "maxHttpBufferSize": 65536
}
```

To override the path:

```bash
LIMITS_CONFIG_PATH=/path/to/server-limits.json
```
```

#### Client (client/.env) - Development only

```bash
cd client
cp .env.example .env
```

Edit `client/.env`:

```bash
VITE_DEV=true
VITE_BACKEND_URL=http://localhost:8080
```

### 4. Get a YouTube Data API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable YouTube Data API v3
4. Create credentials (API key)
5. Paste it into your `.env` file

## Running the Application

### Development

```bash
# Terminal 1: Start the server
npm run dev

# Terminal 2: Start the client
cd client
npm run dev
```

Or run both concurrently:

```bash
npm run dev:full
```

Open `http://localhost:3000` in your browser.

### Production

#### Server

```bash
NODE_ENV=production npm start
```

#### Client

Build the static files:

```bash
cd client
npm run build
```

The built files will be in `client/dist/`. Serve these with nginx or another web server.

## Production Deployment with Nginx

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name karaoke.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Serve static client files
    root /var/www/youtube-karaoke-together/client/dist;
    index index.html;

    # Client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Production Environment Variables

```bash
PORT=8080
NODE_ENV=production
PUBLIC_FRONTEND_ORIGIN=https://karaoke.example.com
YOUTUBE_API_KEY=your_api_key_here
```

**Important**: In production, the client does NOT need any environment variables. It automatically:
- Uses `window.location.origin` for API calls
- Uses `/ws/` path for Socket.IO connections

## Usage

1. Visit the homepage and accept the Terms of Service
2. Click "Create Room" - this generates a unique room with secure keys
3. The room screen displays a QR code for mobile users
4. Mobile users scan the QR code, enter their name, and can then search/queue videos
5. The room admin can manage controllers from the settings panel (gear icon)
6. Use the control panel to search and queue videos (YouTube API v3)
7. The main room plays the current video; queue updates in real time

## Legal & Compliance

This application is fully compliant with YouTube API Terms of Service:

- **Terms of Service Binding**: Users explicitly agree to YouTube ToS
- **Privacy Policy**: Comprehensive privacy protection disclosure
- **Contact Information**: Multiple ways to reach us for support
- **Data Transparency**: Clear explanation of data usage
- **Google Privacy Policy**: Referenced and linked appropriately

### Important Legal Pages

- **Privacy Policy**: `/privacy-policy`
- **Terms of Service**: `/terms-of-service`
- **Contact Us**: `/contact`

## Technologies Used

- React 19 + Vite 7
- Node.js + Express
- Socket.IO (client/server)
- Material UI (MUI)
- YouTube Data API v3
- react-youtube
- express-rate-limit

## API Rate Limits

The server implements rate limiting to prevent abuse:

- **Search API**: 30 requests per minute per IP
- **Room Creation**: 10 rooms per minute per IP

## Capacity Limits

These are enforced on the server to prevent unbounded growth:

- Max rooms: `server-limits.json` (`maxRooms`)
- Max controllers per room: `maxControllersPerRoom`
- Max queue length per room: `maxQueueLengthPerRoom`
- Payload limits: `maxHttpBufferSize` and per-field length limits

## License

GPL-3.0-only. See `LICENSE` for full text.
