/**
 * App.jsx
 * -------
 * Root component for the Real-Time Multimedia Communication
 * and Video Conferencing System.
 *
 * Responsibilities split across members:
 *   Member 1 — WebRTC: getUserMedia, RTCPeerConnection, tracks, remote video
 *   Member 2 — Signaling: Socket.IO events, room management, join/leave
 *   Member 3 — QoS: passes peerConnections to QoSPanel for getStats()
 *
 * WebRTC Media Flow:
 *   Camera/Microphone
 *       ↓
 *   getUserMedia()
 *       ↓
 *   MediaStream (localStream)
 *       ↓
 *   RTCPeerConnection.addTrack()
 *       ↓
 *   WebRTC (offer/answer/ICE via Socket.IO)
 *       ↓
 *   Remote MediaStream (via ontrack)
 *       ↓
 *   Video Element
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import VideoGrid from './components/VideoGrid.jsx';
import Controls from './components/Controls.jsx';
import Chat from './components/Chat.jsx';
import QoSPanel from './components/QoSPanel.jsx';

// ─── ICE Server Configuration ─────────────────────────────────────────────────
// Using Google's public STUN servers.
// STUN helps peers discover their public IP addresses for WebRTC.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

export default function App() {
  // ── Page state ──────────────────────────────────────────────────────────────
  const [page, setPage] = useState('home'); // 'home' | 'room'

  // ── Form state (home page) ───────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // ── Room state ───────────────────────────────────────────────────────────────
  const [myName, setMyName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomStatus, setRoomStatus] = useState('Connecting...');

  // ── Media state ──────────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState(null);
  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  // ── Remote streams: Map<socketId, { stream, name }> ─────────────────────────
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  // ── Refs (don't need re-renders) ─────────────────────────────────────────────
  const socketRef = useRef(null);

  // peerConnections: Map<socketId, RTCPeerConnection>
  const peerConnectionsRef = useRef(new Map());

  // localStream ref (so event handlers always see latest value)
  const localStreamRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER: Create RTCPeerConnection for a peer
  // Member 1 responsibility
  // ═══════════════════════════════════════════════════════════════════════════

  const createPeerConnection = useCallback((targetSocketId, targetName) => {
    // Create a new peer connection using STUN servers
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ── Add local tracks to the peer connection ──────────────────────────────
    // This is how our camera/mic goes to the remote peer via WebRTC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ── Handle incoming ICE candidates ───────────────────────────────────────
    // ICE candidates are network paths WebRTC tries to use
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          to: targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // ── Handle remote media arriving ─────────────────────────────────────────
    // This fires when the remote peer's audio/video arrives over WebRTC
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.set(targetSocketId, { stream: remoteStream, name: targetName });
        return updated;
      });
    };

    // ── Connection state logging ─────────────────────────────────────────────
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${targetName} connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setRoomStatus('Connected');
      }
    };

    peerConnectionsRef.current.set(targetSocketId, pc);
    return pc;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN ROOM
  // Member 2 responsibility — Socket.IO room management
  // Member 1 responsibility — getUserMedia
  // ═══════════════════════════════════════════════════════════════════════════

  const joinRoom = async () => {
    const name = nameInput.trim();
    const room = roomInput.trim();

    if (!name) { setJoinError('Please enter your name.'); return; }
    if (!room) { setJoinError('Please enter a Room ID.'); return; }

    setJoinError('');
    setJoining(true);

    // ── Step 1: Get camera and microphone (getUserMedia) ─────────────────────
    // This is the entry point for all media in the system.
    let stream;
    if (!window.isSecureContext) {
      setJoinError('Camera and microphone access requires HTTPS or localhost. Open this app at http://localhost:5173 or use HTTPS.');
      setJoining(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setJoinError('This browser does not support camera or microphone access. Try the latest version of Chrome or Edge.');
      setJoining(false);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err) {
      const errorName = err?.name || '';
      const errorMessages = {
        NotAllowedError: 'Camera/microphone permission was blocked. Allow access for this site using the lock/tune icon beside the address bar, then reload.',
        NotFoundError: 'No camera or microphone was found. Connect a device and check that Windows can see it.',
        NotReadableError: 'The camera or microphone is busy or unavailable. Close other apps using it, then try again.',
        OverconstrainedError: 'The camera or microphone could not satisfy the requested settings. Check your device and browser settings.',
        SecurityError: 'The browser blocked camera/microphone access. Use HTTPS or localhost and check site permissions.',
        AbortError: 'The camera or microphone could not start. Check that the device is connected, then try again.',
      };
      const message = errorMessages[errorName] ||
        `Could not access camera/microphone${errorName ? ` (${errorName})` : ''}. Check browser and Windows privacy permissions, then try again.`;
      console.error('[Media] getUserMedia failed:', err);
      setJoinError(message);
      setJoining(false);
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);
    setCamEnabled(true);
    setMicEnabled(true);

    // ── Step 2: Connect to Socket.IO server ──────────────────────────────────
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    // ── Step 3: Set up signaling event listeners ──────────────────────────────
    // (Member 2 — session management)

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      // Join the room after socket is connected
      socket.emit('join-room', { roomId: room, name });
    });

    socket.on('connect_error', () => {
      setJoinError('Cannot connect to server. Is the backend running?');
      setJoining(false);
      stream.getTracks().forEach((t) => t.stop());
    });

    // Server sends us the list of users already in the room
    // We must initiate WebRTC offers to each of them
    socket.on('room-users', async ({ users }) => {
      console.log('[Socket] Existing users in room:', users);
      setMyName(name);
      setRoomId(room);
      setPage('room');
      setJoining(false);
      setRoomStatus(users.length > 0 ? 'Connecting...' : 'Waiting for others...');

      // Create a peer connection and send an offer to each existing user
      for (const user of users) {
        const pc = createPeerConnection(user.socketId, user.name);

        // Create WebRTC offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('offer', { to: user.socketId, offer, name });
      }
    });

    // A new user joined — they will send us an offer, nothing to do yet
    socket.on('user-joined', ({ socketId, name: joinedName }) => {
      console.log('[Socket] User joined:', joinedName, socketId);
    });

    // Received an offer from a new peer — create answer
    socket.on('offer', async ({ from, offer, name: callerName }) => {
      console.log('[Socket] Received offer from:', callerName);
      const pc = createPeerConnection(from, callerName);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer', { to: from, answer });
    });

    // Received an answer to our offer
    socket.on('answer', async ({ from, answer }) => {
      console.log('[Socket] Received answer from:', from);
      const pc = peerConnectionsRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Received an ICE candidate from a peer
    socket.on('ice-candidate', async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[ICE] Error adding candidate:', e);
        }
      }
    });

    // A user left — clean up their peer connection and stream
    socket.on('user-left', ({ socketId, name: leftName }) => {
      console.log('[Socket] User left:', leftName, socketId);

      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(socketId);
      }

      setRemoteStreams((prev) => {
        const updated = new Map(prev);
        updated.delete(socketId);
        return updated;
      });

      // Update status if no peers remain
      if (peerConnectionsRef.current.size === 0) {
        setRoomStatus('Waiting for others...');
      }
    });

    socket.on('room-full', ({ roomId: fullRoom }) => {
      setJoinError(`Room "${fullRoom}" is full (max 3 participants).`);
      setJoining(false);
      stream.getTracks().forEach((t) => t.stop());
      socket.disconnect();
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE ROOM
  // Member 2 responsibility — clean up everything properly
  // ═══════════════════════════════════════════════════════════════════════════

  const leaveRoom = useCallback(() => {
    // 1. Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // 2. Stop all local media tracks (releases camera/mic)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    // 3. Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 4. Reset state
    setLocalStream(null);
    setRemoteStreams(new Map());
    setMyName('');
    setRoomId('');
    setRoomStatus('Connecting...');
    setPage('home');
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA TOGGLE
  // Member 1 responsibility — actual MediaStream track manipulation
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCamEnabled((prev) => !prev);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // MICROPHONE TOGGLE
  // Member 1 responsibility
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicEnabled((prev) => !prev);
  }, []);

  // ── Clean up on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (page === 'home') {
    return (
      <div className="home-page">
        <div className="home-card">
          <h1>Real-Time Multimedia Communication and Video Conferencing System</h1>
          <p className="subtitle">Multimedia Systems Course Project</p>

          <div className="form-group">
            <label htmlFor="name-input">Name</label>
            <input
              id="name-input"
              type="text"
              placeholder="Enter your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            />
          </div>

          <div className="form-group">
            <label htmlFor="room-input">Room ID</label>
            <input
              id="room-input"
              type="text"
              placeholder="e.g. multimedia101"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            />
          </div>

          <button
            id="join-button"
            className="btn-join"
            onClick={joinRoom}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join Room'}
          </button>

          {joinError && <div className="error-msg">{joinError}</div>}
        </div>
      </div>
    );
  }

  // Room page
  return (
    <div className="room-page">
      {/* Header */}
      <div className="room-header">
        <div className="room-info">
          <h2>Room: {roomId}</h2>
          <div className={`status ${roomStatus !== 'Connected' ? 'connecting' : ''}`}>
            ● {roomStatus}
          </div>
        </div>
        <div style={{ fontSize: '13px', color: '#888' }}>
          Logged in as: <strong style={{ color: '#e0e0e0' }}>{myName}</strong>
        </div>
      </div>

      {/* Main body */}
      <div className="room-body">
        {/* Video area */}
        <div className="video-area">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            myName={myName}
            camEnabled={camEnabled}
          />
        </div>

        {/* Side panels: Chat + QoS */}
        <div className="side-panels">
          <Chat
            socketRef={socketRef}
            roomId={roomId}
            myName={myName}
            serverUrl={SERVER_URL}
            micEnabled={micEnabled}
          />
          <QoSPanel peerConnectionsRef={peerConnectionsRef} />
        </div>
      </div>

      {/* Controls */}
      <Controls
        camEnabled={camEnabled}
        micEnabled={micEnabled}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onLeave={leaveRoom}
      />
    </div>
  );
}
