# Tastytrade 20-Delta Skew Calculator

A React application that calculates the Open Interest Skew (Put OI / Call OI) for 10-30 delta options, with a secure backend proxy to protect API credentials.

## Architecture

```
┌─────────────────┐     SSE      ┌─────────────────┐            ┌─────────────────┐
│    Frontend     │ ◄──────────► │  Backend Proxy  │ ◄────────► │  Tastytrade API │
│   (React/Vite)  │              │   (Express.js)  │            │  + DxFeed WS    │
└─────────────────┘              └─────────────────┘            └─────────────────┘
   Port 5173                        Port 3001
                                    - Credentials stored here
                                    - 1-hour result caching
```

## Features

- **Secure** — Credentials stored on backend only, never exposed to browser
- **Real-time streaming** — SSE (Server-Sent Events) for live calculation progress
- **Caching** — Results cached for 1 hour to reduce API calls
- **Futures support** — Works with `/ES`, `/CL`, and other futures symbols
- **~30 DTE** — Auto-selects closest monthly expiration

## Quick Start

### 1. Install Dependencies

```bash
# Frontend
npm install

# Backend
cd server && npm install
```

### 2. Configure Backend Credentials

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your Tastytrade credentials:
```env
TASTY_CLIENT_SECRET=your_client_secret
TASTY_REFRESH_TOKEN=your_refresh_token
TASTY_IS_SANDBOX=false
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 3. Run Both Servers

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + cache stats |
| GET | `/api/option-chain/:symbol` | Fetch option chain |
| GET | `/api/stream-skew/:symbol` | SSE stream for skew calculation |
| GET | `/api/skew/:symbol` | Get cached result (if exists) |
| DELETE | `/api/cache/:symbol?` | Clear cache |

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Backend**: Express.js, TypeScript, `@tastytrade/api`
- **Streaming**: Server-Sent Events (SSE)
- **Caching**: In-memory with 1-hour TTL

## Deployment (PM2 + Caddy)

### 1. Install PM2

```bash
npm install -g pm2
```

### 2. Build Frontend

```bash
npm run build
```

### 3. Create PM2 Ecosystem File

Create `ecosystem.config.cjs` in the project root:

```javascript
module.exports = {
  apps: [{
    name: 'tasty-api',
    cwd: './server',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### 4. Start with PM2

```bash
# Start the backend
pm2 start ecosystem.config.cjs

# Save PM2 config for auto-restart on reboot
pm2 save
pm2 startup
```

### 5. Configure Caddy

Add to your `Caddyfile`:

```caddy
skew.yourdomain.com {
    # Serve frontend static files
    root * /path/to/tasty/dist
    file_server

    # Proxy API requests to backend
    handle /api/* {
        reverse_proxy localhost:3001
    }

    # SPA fallback for client-side routing
    try_files {path} /index.html
}
```

### 6. Update Environment Variables

Update `server/.env` for production:
```env
PORT=3001
CORS_ORIGIN=https://skew.yourdomain.com
```

Update `.env` before building frontend:
```env
VITE_API_BASE_URL=https://skew.yourdomain.com
```

### 7. Reload Caddy

```bash
sudo systemctl reload caddy
```

### PM2 Useful Commands

```bash
pm2 logs tasty-api     # View logs
pm2 restart tasty-api  # Restart backend
pm2 status             # Check status
pm2 monit              # Real-time monitoring
```

## Project Structure

```
tasty/
├── src/                    # Frontend React app
│   ├── App.tsx
│   └── services/tasty.ts   # API client (calls backend)
├── server/                 # Backend Express server
│   ├── src/
│   │   ├── index.ts        # Server entry
│   │   ├── routes/api.ts   # API routes + SSE
│   │   └── services/
│   │       ├── tastytrade.ts  # Tastytrade SDK wrapper
│   │       └── cache.ts       # In-memory cache
│   └── .env                # Credentials (gitignored)
└── .env                    # Frontend config (API URL only)
```
