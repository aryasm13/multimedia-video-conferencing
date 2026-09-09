/**
 * VideoGrid.jsx
 * -------------
 * Renders video tiles for local and all remote participants.
 *
 * Member 1 — Audio/Video and WebRTC
 *
 * Key WebRTC concept demonstrated here:
 *   - Local video: srcObject set to the MediaStream from getUserMedia()
 *   - Remote video: srcObject set to the MediaStream received via RTCPeerConnection.ontrack
 *   - Local video is muted to prevent audio feedback (echo)
 */

import { useRef, useEffect } from 'react';

// ─── LocalVideo ───────────────────────────────────────────────────────────────
// A dedicated component so we can useRef on the video element
// and assign srcObject properly (React does not support srcObject as a prop)

function LocalVideo({ stream, myName }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted   // IMPORTANT: mute local video to prevent audio echo
        id="local-video"
      />
      <span className="participant-name">{myName}</span>
      <span className="local-badge">You</span>
    </div>
  );
}

// ─── RemoteVideo ──────────────────────────────────────────────────────────────

function RemoteVideo({ stream, name, socketId }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        id={`remote-video-${socketId}`}
      />
      <span className="participant-name">{name}</span>
    </div>
  );
}

// ─── VideoGrid ────────────────────────────────────────────────────────────────

export default function VideoGrid({ localStream, remoteStreams, myName, camEnabled }) {
  const totalTiles = 1 + remoteStreams.size;

  return (
    <div className={`video-grid ${totalTiles === 1 ? 'single-tile' : ''}`}>
      {/* Local participant */}
      <LocalVideo stream={localStream} myName={myName} />

      {/* Remote participants */}
      {[...remoteStreams.entries()].map(([socketId, { stream, name }]) => (
        <RemoteVideo
          key={socketId}
          socketId={socketId}
          stream={stream}
          name={name}
        />
      ))}
    </div>
  );
}
