# Sec Messenger Front End

React + Vite frontend that renders the public posts feed and comment threads from the Sec Messenger backend API. It supports infinite scroll for posts, media previews, and comment trees.

## Features
- Public posts feed with pagination and infinite scroll
- Comment tree rendering per post
- Media link and image preview support
- Configurable API base URL via environment variable

## Tech Stack
- React 18
- Vite 5

## Getting Started

### Prerequisites
- Node.js 18+ recommended

### Install
```bash
npm install
```

### Configure
```bash
cp .env.example .env
```
Set `VITE_API_BASE_URL` in `.env` if your backend is not running at the default.

### Run (Dev)
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Environment Variables
- `VITE_API_BASE_URL`: Base URL for the backend API. Default is `https://dinosocial.ir` if not set.

## API Dependencies
This frontend expects the backend to expose:
- `GET /api/posts` for paginated posts
- `GET /api/posts/{post_id}/comments` for comments

See `API_DOC.txt` for the backend API reference.

## Project Structure
- `src/App.jsx` main UI and data loading
- `src/services/api.js` API client
- `src/styles/` global styles

## Notes
- The feed is read-only; authentication is not required for the public posts endpoint.
- If you run the backend locally, use `http://127.0.0.1:5000` as the API base URL.
