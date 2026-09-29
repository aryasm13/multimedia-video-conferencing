# Real-Time Multimedia Communication and Video Conferencing System

A Multimedia Systems course project demonstrating real-time audio/video communication using WebRTC, session management using Socket.IO, text chat, and Quality of Service monitoring.

---

## Abstract

This project implements a browser-based real-time multimedia communication system. Audio and video are transmitted directly between peers using the WebRTC protocol, which operates peer-to-peer without routing media through the server. A Node.js/Express/Socket.IO server handles signaling (session negotiation), room management, and text chat. Quality of Service metrics including latency, jitter, packet loss, bitrate, and video frame rate are collected from the browser's WebRTC statistics API (`RTCPeerConnection.getStats()`) and displayed in a live monitoring panel.

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
- Text chat within the room (Socket.IO, no database)
- QoS panel showing live: latency, jitter, packet loss, bitrate, FPS
- Connection quality indicator (Good / Average / Poor)
- No authentication, no database

---

## Technologies

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Styling | Plain CSS |
| Backend | Node.js, Express |
| Real-time | Socket.IO (signaling + chat) |
| Media | WebRTC (getUserMedia, RTCPeerConnection, getStats) |
| Database | None |

---

## Architecture

```
Browser A                        Browser B
   |                                  |
   |    Socket.IO (signaling)         |
   +-----------> Server <------------+
                  |
           Signaling only:
           - room management
           - offer / answer / ICE
           - chat relay

After signaling:

Browser A <=========WebRTC========> Browser B
              Audio + Video
           (peer-to-peer, no server)
```

**The server never carries audio or video.** Media flows directly between browsers using WebRTC. The server only facilitates the initial session negotiation (signaling).

---

## Project Structure

```
multimedia-video-conferencing/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoGrid.jsx      ← local + remote video tiles
│   │   │   ├── Controls.jsx       ← camera/mic toggle, leave
│   │   │   ├── Chat.jsx           ← Socket.IO text chat
│   │   │   └── QoSPanel.jsx       ← WebRTC getStats() display
│   │   ├── App.jsx                ← routing, getUserMedia, WebRTC, signaling
│   │   ├── main.jsx
│   │   └── style.css
│   ├── .env.example
│   └── package.json
├── server/
│   ├── server.js                  ← Express + Socket.IO
│   └── package.json
├── .gitignore
└── README.md
```

---

## Three-Member Contribution

| Member | Area | Files |
|---|---|---|
| Member 1 | Audio/Video and WebRTC | `App.jsx` (getUserMedia, RTCPeerConnection, tracks), `VideoGrid.jsx`, camera/mic toggle |
| Member 2 | Communication and Session Management | `server.js` (rooms, signaling, chat), Socket.IO events in `App.jsx`, `Chat.jsx` |
| Member 3 | QoS and Frontend | `QoSPanel.jsx` (getStats, calculations, quality indicator), `style.css`, README |

---

## How to Run

### Prerequisites

- Node.js v18 or higher
- npm

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

### 3. Configure Environment (optional)

The default backend URL is `http://localhost:3000`.

To change it, create `client/.env` from the example:

```bash
cp client/.env.example client/.env
```

Edit `VITE_SERVER_URL` if your server is on a different address.

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
- [ ] QoS panel shows real values (latency, jitter, etc.) after ~2 seconds
- [ ] Connection quality shows Good/Average/Poor
- [ ] Leave Room returns to home page and releases camera/mic

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

After signaling completes, media flows **directly between peers** — the server is no longer involved.

### Session Management

The server maintains rooms in memory. When a user joins, existing users are notified and initiate WebRTC offers. When a user leaves, remaining users clean up their peer connections.

### QoS (Quality of Service)

QoS measures network quality and its impact on the user experience. We collect these metrics using `RTCPeerConnection.getStats()`:

| Metric | Description | Source |
|---|---|---|
| Latency | Round-trip time between peers | `remote-inbound-rtp.roundTripTime` |
| Jitter | Variation in packet arrival times | `inbound-rtp.jitter` |
| Packet Loss | % of packets that did not arrive | `inbound-rtp.packetsLost` / total |
| Bitrate | Data rate of received media | Δ `bytesReceived` × 8 / Δt |
| FPS | Video frames rendered per second | `inbound-rtp.framesPerSecond` |

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
- **Configuration**: Set `VITE_SERVER_URL` in the frontend environment to point to the deployed backend
- **No database, no filesystem storage, no machine-specific paths**

The backend binds to `0.0.0.0` and reads port from `process.env.PORT || 3000`.

---

## Known Limitations

- Rooms are stored in server memory — they reset if the server restarts
- Maximum 3 participants per room (mesh WebRTC)
- TURN servers are not configured — may not work across certain NATs/firewalls (works fine on local network or with STUN reachability)
- No persistent chat history

---

## Future Work

- Live video captioning feature
- Database integration to eport the caption and chat