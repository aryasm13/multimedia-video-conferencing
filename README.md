# Real-Time Multimedia Communication and Video Conferencing System

A Multimedia Systems course project demonstrating real-time audio/video communication using WebRTC, session management using Socket.IO, text chat, and Quality of Service monitoring.

---

## Abstract

This project implements a browser-based real-time multimedia communication system. Audio and video are transmitted directly between peers using the WebRTC protocol, which operates peer-to-peer without routing media through the server. A Node.js/Express/Socket.IO server handles signaling (session negotiation), room management, chat, live caption relay, and transcript persistence. Quality of Service metrics including latency, jitter, packet loss, bitrate, and video frame rate are collected from the browser's WebRTC statistics API (`RTCPeerConnection.getStats()`) and displayed in a live monitoring panel.

---

## Objectives

- Demonstrate real-time peer-to-peer audio/video communication using WebRTC
- Implement session management and signaling using Socket.IO
- Control camera and microphone through the browser MediaStream API
- Monitor network quality using WebRTC's built-in statistics
- Apply concepts from the Multimedia Systems course (RTP/RTCP statistics, jitter, latency, packet loss, bitrate, FPS)

---

## Features

- Join a room using a name and room ID
- Real-time video and audio communication (2–3 participants)
- Camera ON/OFF toggle (disables video track)
- Microphone ON/OFF toggle (disables audio track)
- Leave room (releases camera/mic, cleans up WebRTC connections)
- Text chat within the room, with messages persisted in SQLite
- Opt-in live speech captions shared with room participants
- Downloadable CSV export of room chat and captions
- QoS panel showing live: latency, jitter, packet loss, bitrate, FPS
- Connection quality indicator (Good / Average / Poor)
- Calls survive a signaling-server restart: media keeps flowing peer-to-peer and the room is rejoined automatically
- LAN mode (`npm run dev:lan`) for testing across phones and laptops on the same Wi-Fi
- Optional TURN relay configuration for restrictive networks
- No authentication

---

## Technologies

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Styling | Plain CSS |
| Backend | Node.js, Express |
| Real-time | Socket.IO (signaling, chat, captions) |
| Media | WebRTC (getUserMedia, RTCPeerConnection, getStats) |
| Database | SQLite (`better-sqlite3`) |

---

## Architecture

```
Browser A                        Browser B
   |                                  |
   |    Socket.IO (signaling)         |
   +-----------> Server <------------+
                  |
           Server coordination:
           - room management
           - offer / answer / ICE
           - chat/caption relay
           - transcript persistence and export

After signaling:

Browser A <=========WebRTC========> Browser B
              Audio + Video
           (peer-to-peer, no server)
```

**The server never carries or stores audio or video.** Media flows directly between browsers using WebRTC. The server handles signaling, relays text and final caption transcripts, and stores those transcripts in SQLite.

---

## Project Structure

```
multimedia-video-conferencing/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoGrid.jsx      ← local + remote video tiles
│   │   │   ├── Controls.jsx       ← camera/mic toggle, leave
│   │   │   ├── Chat.jsx           ← chat, live captions, transcript export
│   │   │   └── QoSPanel.jsx       ← WebRTC getStats() display
│   │   ├── App.jsx                ← routing, getUserMedia, WebRTC, signaling
│   │   ├── main.jsx
│   │   └── style.css
│   ├── .env.example
│   ├── .env.lan                   ← settings for LAN mode (npm run dev:lan)
│   ├── vite.config.js             ← dev server, backend proxy, LAN HTTPS
│   └── package.json
├── server/
│   ├── server.js                  ← Express + Socket.IO + transcript API
│   ├── database.js                ← SQLite transcript storage
│   └── package.json
├── .gitignore
└── README.md
```

---

## Three-Member Contribution

| Member | Area | Files |
|---|---|---|
| Member 1 | Audio/Video and WebRTC | `App.jsx` (getUserMedia, RTCPeerConnection, tracks), `VideoGrid.jsx`, camera/mic toggle |
| Member 2 | Communication and Session Management | `server.js` (rooms, signaling, chat/captions), `database.js`, `Chat.jsx` |
| Member 3 | QoS and Frontend | `QoSPanel.jsx` (getStats, calculations, quality indicator), `style.css`, README |

---

## How to Run

### Prerequisites

- Node.js v18 or higher
- npm
- Chrome or Edge for live captions (Web Speech API support)

### 1. Start the Backend

```bash
cd server
npm install
npm start
```

Server will run at: `http://localhost:3000`

Verify: open `http://localhost:3000/` in a browser — should show a JSON status message.

### 2. Start the Frontend

Open a new terminal:

```bash
cd client
npm install
npm run dev
```

Frontend will run at: `http://localhost:5173`

If joining reports a camera/microphone error, use `http://localhost:5173` or
HTTPS, allow camera and microphone access for the site in your browser's address
bar permissions, and close other apps that may be using the devices. On Windows,
also check **Settings → Privacy & security → Camera/Microphone** and allow
desktop apps to access them.

### 3. Configure Environment (optional)

By default the frontend talks to the backend through the Vite dev server's
proxy (`/socket.io` and `/api` are forwarded to `http://localhost:3000`).

To change it, create `client/.env` from the example:

```bash
cp client/.env.example client/.env
```

| Variable (client/.env) | Purpose |
|---|---|
| `VITE_SERVER_URL` | Backend URL. Leave empty locally (uses the proxy); set it to the deployed backend for production builds |
| `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | Optional TURN relay for networks that block direct peer-to-peer connections |

| Variable (server) | Purpose |
|---|---|
| `PORT` | Port to listen on (default `3000`) |
| `DB_PATH` | SQLite file location (default `server/data/conversations.sqlite`) |
| `CLIENT_ORIGIN` | Allowed frontend origin(s) for CORS, comma-separated (default: any origin) |

The server creates `server/data/conversations.sqlite` automatically. Set the
server's `DB_PATH` environment variable to use a different persistent SQLite
file, and make sure its parent directory is writable. Chat messages and final
caption transcripts are stored by room; raw audio and video are never stored.
Use **Start captions** in the room chat panel to opt in to browser speech
recognition. Browsers that support on-device speech recognition use the local
English speech pack when available; the browser may ask to download it first.
Otherwise, speech recognition may require an internet connection. Use **Export
CSV** to download that room's chat and caption history.

### 4. Testing on Multiple Devices (same Wi-Fi)

Browsers only allow camera/microphone on HTTPS or `localhost`, so opening
`http://<laptop-ip>:5173` from a phone fails. LAN mode serves the app over
HTTPS (self-signed certificate) and proxies the backend through the same origin:

```bash
cd server && npm start          # terminal 1
cd client && npm run dev:lan    # terminal 2
```

1. Vite prints one or more `Network: https://<ip>:5173` URLs. Use the IP of the
   laptop's **Wi-Fi** adapter (`ipconfig` → "Wireless LAN adapter Wi-Fi").
2. On each device, open that URL and accept the certificate warning
   (Advanced → Proceed).
3. If Windows Firewall asks, allow Node.js on the network.
4. Campus/office Wi-Fi often blocks device-to-device traffic. If devices cannot
   connect, use a mobile hotspot for all devices.

---

## Testing

### Testing Two Users (same machine)

1. Start the backend and frontend as above
2. Open `http://localhost:5173` in **Browser Window A**
3. Enter Name: `User1`, Room ID: `mms101` → Click **Join Room**
4. Allow camera and microphone when prompted
5. Open `http://localhost:5173` in **Browser Window B** (or a different browser / incognito)
6. Enter Name: `User2`, Room ID: `mms101` → Click **Join Room**
7. Allow camera and microphone
8. Both windows should now show each other's video and audio

### What to verify

- [ ] Local camera video is visible in your own window
- [ ] Remote user's video appears in the other window
- [ ] Remote audio is audible
- [ ] Camera OFF button disables local video (remote sees black)
- [ ] Mic OFF button mutes audio
- [ ] Chat messages appear in both windows
- [ ] Starting captions displays interim speech and shares final captions with the room
- [ ] Refreshing/rejoining the room restores saved chat and caption history
- [ ] Export CSV downloads the room's chat and captions
- [ ] QoS panel shows real values (latency, jitter, etc.) after ~2 seconds
- [ ] Connection quality shows Good/Average/Poor
- [ ] Leave Room returns to home page and releases camera/mic
- [ ] Stopping the backend mid-call: video continues and the header shows "Reconnecting to server..."; restarting it restores "Connected"
- [ ] A phone on the same Wi-Fi can join using LAN mode

---

## Multimedia Concepts

### Real-Time Multimedia

This system transmits live audio and video with minimal delay. Real-time multimedia requires strict timing constraints — packets must arrive within milliseconds to prevent noticeable degradation.

### Audio Transmission

The browser captures microphone input using `getUserMedia()`. The resulting audio track is added to the `RTCPeerConnection` via `addTrack()`, encoded (typically with Opus codec), packetized, and transmitted to the remote peer over WebRTC.

### Video Transmission

Camera input is similarly captured, encoded (typically VP8 or H.264), and transmitted. The receiver decodes it and renders it in a `<video>` element.

### WebRTC (Web Real-Time Communication)

WebRTC is a browser API and protocol suite for peer-to-peer real-time communication. It handles:
- Media capture (`getUserMedia`)
- Codec negotiation (SDP)
- NAT traversal (STUN/ICE)
- Encryption (DTLS-SRTP)
- Adaptive bitrate and packet loss recovery

### Signaling

WebRTC does not define how peers find each other — that is the application's job. This project uses Socket.IO for signaling:
1. **Offer**: Peer A generates an SDP offer (codec capabilities, network info) and sends it to Peer B via the server
2. **Answer**: Peer B responds with an SDP answer
3. **ICE Candidates**: Both peers exchange network address candidates until a working path is found

After signaling completes, media flows **directly between peers** — the server is not in the audio/video path. It continues to relay chat and caption text.

### Session Management

The server maintains rooms in memory. When a user joins, the server sends the newcomer the list of existing users, and the newcomer sends a WebRTC offer to each of them; existing users are notified and answer those offers. When a user leaves, remaining users clean up their peer connections. If the signaling connection drops, Socket.IO reconnects automatically and the client rejoins the room, rebuilding its peer connections.

### QoS (Quality of Service)

QoS measures network quality and its impact on the user experience. We collect these metrics using `RTCPeerConnection.getStats()`:

| Metric | Description | Source |
|---|---|---|
| Latency | Round-trip time between peers | `remote-inbound-rtp.roundTripTime` (RTCP), else the active ICE candidate pair's `currentRoundTripTime` |
| Jitter | Variation in packet arrival times (audio stream) | `inbound-rtp.jitter` (`kind: audio`) |
| Packet Loss | % of packets that did not arrive, over the last ~5 s | Δ `packetsLost` / Δ(`packetsLost` + `packetsReceived`), audio + video |
| Bitrate | Data rate of received media | Δ `bytesReceived` × 8 / Δt |
| FPS | Video frames decoded per second | `inbound-rtp.framesPerSecond` (`kind: video`) |

The panel monitors the first connected peer; its name is shown in the panel title.

### Latency

Network round-trip time in milliseconds. Low latency is essential for natural conversation. Above ~300ms, communication feels unnatural.

### Jitter

Variation in the time between arriving packets. WebRTC uses a jitter buffer to smooth this out, but high jitter (above ~50ms) causes audio/video artifacts.

### Packet Loss

Percentage of data packets that do not reach the receiver. WebRTC uses Forward Error Correction (FEC) and retransmission (NACK) to recover lost packets, but above ~5% loss, quality degrades noticeably.

### Bitrate

The number of bits transmitted per second. Higher bitrate generally means better quality, but requires more bandwidth. WebRTC's congestion control algorithm automatically adjusts bitrate based on available bandwidth.

### FPS (Frames Per Second)

The number of video frames delivered per second. 25–30 FPS is smooth for a conference call.

### RTP/RTCP

**Important:** This project does not manually implement RTP or RTCP packet construction. WebRTC internally uses the RTP protocol for media transport and RTCP for control and statistics. The browser exposes statistics derived from RTCP (round-trip time, jitter, packet loss) through the `getStats()` API, which is what this project reads.

---

## Deployment Readiness

The project is designed for easy deployment:

- **Backend**: Can be deployed to any Node.js host (Render, Railway, etc.) using `process.env.PORT`
- **Frontend**: Built with Vite, deployable as a static site to Netlify, Vercel, etc.
- **Configuration**: Set `VITE_SERVER_URL` in the frontend's build environment to point to the deployed backend (Vite embeds it at build time), and set `CLIENT_ORIGIN` on the backend to the frontend's URL
- **SQLite transcript storage**: configure a durable writable `DB_PATH` when deploying (free hosting tiers often have an ephemeral disk that is wiped on restart)
- **TURN**: for participants on mobile data or strict networks, set the `VITE_TURN_*` variables

The backend binds to `0.0.0.0` and reads port from `process.env.PORT || 3000`.

---

## Known Limitations

- Rooms are stored in server memory — they reset if the server restarts (clients rejoin automatically when it comes back)
- Maximum 3 participants per room (mesh WebRTC)
- No TURN server is bundled — without `VITE_TURN_*` configured, calls may fail across symmetric NATs/strict firewalls (works fine on a local network or with STUN reachability)
- The QoS panel shows one peer at a time (the first connected peer)
- Anyone who knows a room ID can join it and read its transcript (no authentication)
- Browser speech recognition availability varies; Chrome/Edge are recommended
- Transcript history persists in SQLite and should be backed up with the configured database file

## Transcript API

- `GET /api/rooms/:roomId/messages` returns the persisted chat and caption
  transcript as JSON.
- `GET /api/rooms/:roomId/export?format=csv` downloads the same transcript as
  CSV. The `format` parameter may be omitted; unsupported formats return HTTP
  400.