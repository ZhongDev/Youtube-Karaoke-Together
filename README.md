# YouTube Karaoke Together

A collaborative YouTube video queuing system that allows multiple users to watch and queue videos together. The system consists of a main room with a YouTube player and a queue display, and a mobile-friendly control panel for searching and adding videos to the queue.

## Features

- Create unique rooms for watching YouTube videos together
- Real-time video queue management
- Mobile-friendly control panel accessible via QR code
- YouTube video search and queue functionality
- Synchronized video playback across all users

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

```
YOUTUBE_API_KEY=your_api_key_here
```

5. Update the YouTube API key in `client/src/components/Control.js`:

```javascript
const response = await fetch(
  `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=YOUR_API_KEY`
);
```

Replace `YOUR_API_KEY` with your actual YouTube API key.

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

1. Create a new room by clicking the "Create Room" button on the home page
2. Share the QR code with mobile users to allow them to control the queue
3. Use the mobile control panel to search for and add videos to the queue
4. Videos will play automatically in the main room as they are queued

## Technologies Used

- React
- Node.js
- Express
- Socket.IO
- Material-UI
- YouTube Data API
- React YouTube Player

## License

MIT
