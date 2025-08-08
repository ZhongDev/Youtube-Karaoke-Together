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

## Prerequisites

- Node.js 18+
- npm 9+
- YouTube Data API key

## Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/youtube-karaoke-together.git
cd youtube-karaoke-together
```

2. Install root/server dependencies:

```bash
npm install
```

3. Install client dependencies:

```bash
cd client
npm install
```

4. Configure environment variables at repo root:

```bash
cp env.example .env
```

Edit `.env` and set:

```bash
YOUTUBE_API_KEY=your_api_key
PORT=5000
```

5. Get a YouTube Data API key:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Enable YouTube Data API v3
   - Create credentials (API key)
   - Paste it into `.env`

## Running the Application

1. Start the server (root):

```bash
npm run dev
```

2. Start the client (Vite):

```bash
cd client
npm run dev
```

3. Open `http://localhost:3000`

Notes:

- The server reads configuration from `client/src/ytkt-config.json`.
- CORS is automatically configured to the frontend origin defined in that file.

## Usage

1. Visit the homepage and accept the Terms of Service
2. Create a new room (a unique `roomId` will be generated)
3. Share the displayed QR code; mobile users can open `/control/:roomId`
4. Use the control panel to search and queue videos (YouTube API v3)
5. The main room plays the current video; queue updates in real time

## Legal & Compliance

This application is fully compliant with YouTube API Terms of Service:

- ✅ **Terms of Service Binding**: Users explicitly agree to YouTube ToS
- ✅ **Privacy Policy**: Comprehensive privacy protection disclosure
- ✅ **Contact Information**: Multiple ways to reach us for support
- ✅ **Data Transparency**: Clear explanation of data usage
- ✅ **Google Privacy Policy**: Referenced and linked appropriately

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

## License

GPL-3.0-only. See `LICENSE` for full text.
