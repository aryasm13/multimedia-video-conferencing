/**
 * Controls.jsx
 * ------------
 * Camera, microphone toggle buttons and Leave Room button.
 *
 * Member 1 — Audio/Video and WebRTC
 *
 * Camera/mic state is NOT faked.
 * Toggling calls track.enabled = true/false on the actual MediaStream tracks.
 * This is done in App.jsx; Controls.jsx only shows the current state
 * and calls the handlers.
 */

export default function Controls({ camEnabled, micEnabled, onToggleCamera, onToggleMic, onLeave }) {
  return (
    <div className="controls-bar">
      {/* Camera toggle */}
      <button
        id="toggle-camera"
        className={`btn-control ${!camEnabled ? 'off' : ''}`}
        onClick={onToggleCamera}
        title="Toggle Camera"
      >
        Camera {camEnabled ? 'ON' : 'OFF'}
      </button>

      {/* Microphone toggle */}
      <button
        id="toggle-mic"
        className={`btn-control ${!micEnabled ? 'off' : ''}`}
        onClick={onToggleMic}
        title="Toggle Microphone"
      >
        Mic {micEnabled ? 'ON' : 'OFF'}
      </button>

      {/* Leave room */}
      <button
        id="leave-room"
        className="btn-leave"
        onClick={onLeave}
        title="Leave Room"
      >
        Leave Room
      </button>
    </div>
  );
}
