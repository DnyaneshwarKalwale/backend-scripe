# YouTube Transcript Integration

This project enables fetching YouTube transcripts using the `youtube-transcript-api` Python library and integrates with a Node.js backend.

## Setup for Local Development

### Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Install Node.js Dependencies

```bash
cd backend
npm install
```

## Running the Application Locally

### Start the Backend Server

```bash
cd backend
npm start
```

## Deployment on Render.com

This application is designed to work seamlessly on Render.com. To deploy:

1. Connect your GitHub repository to Render
2. Create a new Web Service with the following settings:
   - **Environment**: Node.js
   - **Build Command**: `chmod +x build.sh && ./build.sh`
   - **Start Command**: `cd backend && npm start`

### Environment Variables for Render

Make sure to set these environment variables in your Render dashboard:

- `NODE_ENV`: `production`
- `PORT`: `5000` (or your preferred port)
- `OPENAI_API_KEY`: Your OpenAI API key (if using OpenAI features)

### Important Notes for Render Deployment

- The `build.sh` script will automatically install both Python and Node.js dependencies
- Make sure Python 3 is available in your Render instance
- The application will try to use `python3` command on Render to run the transcript fetcher script
- If the Python script fails, the system will automatically fall back to a direct method of fetching transcripts

## How it Works

1. The Python script `transcript_fetcher.py` uses the YouTube Transcript API to fetch transcripts for videos.
2. The Node.js backend provides API endpoints at:
   - `/api/youtube/channel` - Fetch YouTube channel videos
   - `/api/youtube/transcript` - Fetch transcript for a video
   - `/api/youtube/analyze` - Generate LinkedIn content from a transcript
3. All APIs are public (no authentication required)

## Workflow

1. User enters a YouTube channel URL or name
2. The application fetches videos from the channel
3. User can click "Get Transcript" on any video to fetch its transcript
4. User can save a video with its transcript
5. On the RequestCarouselPage, the user can select saved videos and see their transcripts

## Troubleshooting

- If the Python transcript fetcher fails, a backup method using direct YouTube API calls will be used
- Check the server logs on Render for any errors
- Make sure your `requirements.txt` file contains the correct version of `youtube-transcript-api` 