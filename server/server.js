/**
 * server.js
 * -----------
 * Backend for the Real-Time Multimedia Communication and Video Conferencing System.
 *
 * Responsibilities (Member 2 - Communication and Session Management):
 *   - HTTP server with Express
 *   - Socket.IO signaling (offer / answer / ICE candidates)
 *   - Room management (join / leave / user tracking)
 *   - Text chat and live caption relay with SQLite persistence
 *
 * NOTE: This server never carries audio/video.
 *       Audio/video travels peer-to-peer via WebRTC.
 *       This server handles signaling and text transcripts only.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { getRoomMessages, saveMessage } = require('./database');

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

app.get('/api/rooms/:roomId/messages', (req, res) => {
  try {
    res.json({ messages: getRoomMessages(req.params.roomId) });
  } catch (error) {
    console.error('[DATABASE] Failed to load room messages:', error);
    res.status(500).json({ error: 'Could not load room messages.' });
  }
});

app.get('/api/rooms/:roomId/export', (req, res) => {
  if (req.query.format && req.query.format !== 'csv') {
    return res.status(400).json({ error: 'Unsupported export format. Use csv.' });
  }

  try {
    const messages = getRoomMessages(req.params.roomId);
    const escapeCsv = (value) => {
      const text = String(value);
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['type', 'roomId', 'name', 'message', 'timestamp'],
      ...messages.map((entry) => [
        entry.type,
        entry.roomId,
        entry.name,
        entry.message,
        new Date(entry.timestamp).toISOString(),
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');

    res
      .type('text/csv')
      .attachment('room-conversation.csv')
      .send(csv);
  } catch (error) {
    console.error('[DATABASE] Failed to export room messages:', error);
    res.status(500).json({ error: 'Could not export room messages.' });
  }
});

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
  // Client sends: { roomId, message }; the name comes from the joined socket.
  // Server broadcasts to everyone in the room (including sender for consistency)

  socket.on('chat-message', (payload, acknowledge) => {
    persistRoomMessage(socket, payload, 'chat', acknowledge);
  });

  socket.on('caption-message', (payload, acknowledge) => {
    persistRoomMessage(socket, payload, 'caption', acknowledge);
  });

  // ── leave-room ────────────────────────────────────────────────────────────
  // Client sends: { roomId }

  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  function persistRoomMessage(socket, payload, type, acknowledge) {
    const roomId = payload?.roomId;
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';

    if (!roomId || roomId !== socket.data.roomId) {
      acknowledge?.({ error: 'Join the room before sending messages.' });
      return;
    }
    if (!message || message.length > 2000) {
      acknowledge?.({ error: 'Messages must contain 1 to 2000 characters.' });
      return;
    }

    try {
      const entry = saveMessage({
        roomId,
        type,
        name: socket.data.name,
        message,
      });
      io.to(roomId).emit(type === 'chat' ? 'chat-message' : 'caption-message', entry);
      acknowledge?.({ ok: true, id: entry.id });
    } catch (error) {
      console.error(`[DATABASE] Failed to save ${type} for room ${roomId}:`, error);
      acknowledge?.({ error: 'Message could not be saved. Please try again.' });
    }
  }

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
