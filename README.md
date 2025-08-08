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

- Node.js (v14 or higher)
- npm (v6 or higher)
- YouTube Data API key

## Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/youtube-karaoke-together.git
cd youtube-karaoke-together
```

2. Install server dependencies:

```bash
npm install
```

3. Install client dependencies:

```bash
cd client
npm install
```

4. Create a `.env` file in the root directory and add your YouTube API key:

```bash
cp env.example .env
```

Then edit the `.env` file and add your actual API key.

5. Get your YouTube Data API key:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the YouTube Data API v3
   - Create credentials (API key)
   - Copy the API key to your `.env` file

## Running the Application

1. Start the server:

```bash
npm run dev
```

2. In a new terminal, start the client:

```bash
cd client
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Visit the homepage and accept the Terms of Service
2. Create a new room by clicking the "Create Room" button
3. Share the QR code with mobile users to allow them to control the queue
4. Use the mobile control panel to search for and add videos to the queue
5. Videos will play automatically in the main room as they are queued

## Legal Compliance

This application is fully compliant with YouTube API Terms of Service:

- ✅ **Terms of Service Binding**: Users explicitly agree to YouTube ToS
- ✅ **Privacy Policy**: Comprehensive privacy protection disclosure
- ✅ **Contact Information**: Multiple ways to reach us for support
- ✅ **Data Transparency**: Clear explanation of data usage
- ✅ **Google Privacy Policy**: Referenced and linked appropriately

### Important Legal Pages

- **Privacy Policy**: `/privacy-policy` - How we handle your data
- **Terms of Service**: `/terms-of-service` - User agreements including YouTube ToS
- **Contact Us**: `/contact` - Support and legal contact information

## Technologies Used

- React
- Node.js
- Express
- Socket.IO
- Material-UI
- YouTube Data API
- React YouTube Player

## License

GPL-3.0-only. See `LICENSE` for full text.
