/**
 * server.js
 * -----------
 * Backend for the Real-Time Multimedia Communication and Video Conferencing System.
 *
 * Responsibilities (Member 2 - Communication and Session Management):
 *   - HTTP server with Express
 *   - Socket.IO signaling (offer / answer / ICE candidates)
 *   - Room management (join / leave / user tracking)
 *   - Text chat relay
 *
 * NOTE: This server never carries audio/video.
 *       Audio/video travels peer-to-peer via WebRTC.
 *       This server only handles signaling (session negotiation) and chat.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',          // In production, restrict this to your frontend domain
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MMS Video Conferencing Server is running',
    rooms: Object.fromEntries(
      [...rooms.entries()].map(([id, users]) => [id, users.map((u) => u.name)])
    ),
  });
});

// ─── Room State ───────────────────────────────────────────────────────────────
// rooms: Map<roomId, Array<{ socketId, name }>>

const rooms = new Map();
const MAX_ROOM_SIZE = 3;

// ─── Socket.IO Events ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── join-room ──────────────────────────────────────────────────────────────
  // Client sends: { roomId, name }
  // Server:
  //   1. Rejects if room is full
  //   2. Adds user to room
  //   3. Sends existing users list to the new joiner
  //   4. Notifies existing users about the new joiner

  socket.on('join-room', ({ roomId, name }) => {
    if (!roomId || !name) return;

    // Get or create room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, []);
    }
    const room = rooms.get(roomId);

    // Check capacity
    if (room.length >= MAX_ROOM_SIZE) {
      socket.emit('room-full', { roomId });
      console.log(`[FULL] Room ${roomId} rejected ${name}`);
      return;
    }

    // Add user to room
    const user = { socketId: socket.id, name };
    room.push(user);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;

    console.log(`[JOIN] ${name} (${socket.id}) → Room: ${roomId} (${room.length}/${MAX_ROOM_SIZE})`);

    // Send existing users to the new joiner (so they can initiate WebRTC offers)
    const existingUsers = room.filter((u) => u.socketId !== socket.id);
    socket.emit('room-users', { users: existingUsers });

    // Notify existing users that someone new joined
    socket.to(roomId).emit('user-joined', { socketId: socket.id, name });
  });

  // ── WebRTC Signaling: Offer ────────────────────────────────────────────────
  // Relay offer from one peer to another
  // Client sends: { to: targetSocketId, offer: RTCSessionDescriptionInit, name }

  socket.on('offer', ({ to, offer, name }) => {
    console.log(`[OFFER] ${socket.id} → ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer, name });
  });

  // ── WebRTC Signaling: Answer ───────────────────────────────────────────────
  // Client sends: { to: targetSocketId, answer: RTCSessionDescriptionInit }

  socket.on('answer', ({ to, answer }) => {
    console.log(`[ANSWER] ${socket.id} → ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  // ── WebRTC Signaling: ICE Candidate ───────────────────────────────────────
  // Client sends: { to: targetSocketId, candidate: RTCIceCandidateInit }

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  // Client sends: { roomId, name, message }
  // Server broadcasts to everyone in the room (including sender for consistency)

  socket.on('chat-message', ({ roomId, name, message }) => {
    if (!roomId || !name || !message) return;
    console.log(`[CHAT] ${name}: ${message}`);
    io.to(roomId).emit('chat-message', {
      name,
      message,
      timestamp: Date.now(),
    });
  });

  // ── leave-room ────────────────────────────────────────────────────────────
  // Client sends: { roomId }

  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  // ── disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      handleLeave(socket, roomId);
    }
    console.log(`[DISCONNECT] ${socket.id}`);
  });
});

// ─── Helper: Handle User Leaving ──────────────────────────────────────────────

function handleLeave(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const name = socket.data.name || 'Unknown';
  const updatedRoom = room.filter((u) => u.socketId !== socket.id);

  if (updatedRoom.length === 0) {
    rooms.delete(roomId);
    console.log(`[ROOM DELETED] ${roomId}`);
  } else {
    rooms.set(roomId, updatedRoom);
  }

  socket.leave(roomId);

  // Notify remaining users
  socket.to(roomId).emit('user-left', { socketId: socket.id, name });
  console.log(`[LEAVE] ${name} (${socket.id}) left Room: ${roomId}`);
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MMS Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
});
