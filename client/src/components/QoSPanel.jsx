/**
 * QoSPanel.jsx
 * ------------
 * Quality of Service monitoring using WebRTC Statistics API.
 *
 * Member 3 — QoS and Frontend
 *
 * WebRTC internally uses RTP/RTCP mechanisms for media transport.
 * The browser exposes statistics collected from those mechanisms
 * through RTCPeerConnection.getStats().
 *
 * We use getStats() to read REAL values — no fake/random data.
 *
 * Stats are shown for one peer: the first peer connection that is currently
 * 'connected' (its name is shown in the panel title).
 *
 * Metrics collected:
 *   - Latency     → round-trip time (RTT): remote-inbound-rtp.roundTripTime,
 *                   computed from RTCP Sender/Receiver Reports; falls back to the
 *                   active ICE candidate pair's currentRoundTripTime (STUN checks)
 *   - Jitter      → inbound-rtp.jitter of the AUDIO stream (RFC 3550
 *                   inter-arrival jitter, measured by our RTP receiver)
 *   - Packet Loss → packets lost / packets expected across all incoming
 *                   audio+video RTP, over the last ~5 seconds (like the
 *                   "fraction lost" field of an RTCP Receiver Report)
 *   - Bitrate     → calculated from bytesReceived difference over time
 *   - FPS         → inbound-rtp.framesPerSecond of the VIDEO stream
 *
 * Connection quality (a metric that is not available yet is ignored):
 *   Good    → latency < 150ms AND jitter < 30ms AND loss < 1%
 *   Average → latency < 300ms AND jitter < 60ms AND loss < 5%
 *   Poor    → anything worse
 */

import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 1000;
const LOSS_WINDOW_SAMPLES = 5; // packet loss is measured over the last 5 polls

const EMPTY_STATS = {
  peerId: null,
  latency: null,
  jitter: null,
  packetLoss: null,
  bitrate: null,
  fps: null,
};

// Format a number to 1 decimal place, or return 'N/A'
function fmt(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(decimals);
}

// ─── Connection quality calculation ───────────────────────────────────────────
function getQuality(latency, jitter, packetLoss) {
  // Return 'waiting' if we don't have real data yet
  if (latency === null && jitter === null && packetLoss === null) {
    return 'waiting';
  }

  // A metric we could not measure yet does not count against the connection
  const below = (value, limit) => value === null || value < limit;

  if (below(latency, 150) && below(jitter, 30) && below(packetLoss, 1)) return 'good';
  if (below(latency, 300) && below(jitter, 60) && below(packetLoss, 5)) return 'average';
  return 'poor';
}

export default function QoSPanel({ peerConnectionsRef, remoteStreams }) {
  const [stats, setStats] = useState(EMPTY_STATS);

  // Previous sample of the monitored connection:
  //   bytesById   → byte counters per inbound stream (audio/video counters
  //                 start at different times), for the bitrate
  //   lossSamples → recent cumulative lost/received totals, for windowed loss
  const prevSampleRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Monitor the first peer connection that is actually connected
      const entry = [...(peerConnectionsRef?.current?.entries() || [])]
        .find(([, pc]) => pc.connectionState === 'connected');
      if (!entry) {
        // No live connection: clear the panel instead of freezing old numbers
        prevSampleRef.current = null;
        setStats(EMPTY_STATS);
        return;
      }
      const [peerId, pc] = entry;

      try {
        const statsReport = await pc.getStats();

        let rtcpRtt = null;       // ms, from RTCP reports
        let iceRtt = null;        // ms, from ICE/STUN connectivity checks
        let audioJitter = null;   // ms
        let videoJitter = null;   // ms
        let bitrate = null;       // kbps
        let fps = null;           // frames/sec
        let packetsLost = 0;      // cumulative, all inbound streams
        let packetsReceived = 0;  // cumulative, all inbound streams
        const currentInboundBytes = new Map();
        let sampleTimestamp = null;

        statsReport.forEach((report) => {
          // ── Inbound RTP: jitter, packet counters, bytes, FPS ──────────────
          if (report.type === 'inbound-rtp') {
            // Jitter is in seconds — convert to ms (audio and video separately)
            if (report.jitter !== undefined) {
              if (report.kind === 'audio') audioJitter = report.jitter * 1000;
              else videoJitter = report.jitter * 1000;
            }

            // Cumulative packet counters (packetsLost can briefly go negative
            // when duplicate packets arrive, so clamp it)
            packetsLost += Math.max(0, report.packetsLost || 0);
            packetsReceived += report.packetsReceived || 0;

            if (typeof report.bytesReceived === 'number') {
              currentInboundBytes.set(report.id, report.bytesReceived);
              if (typeof report.timestamp === 'number') {
                sampleTimestamp = Math.max(sampleTimestamp || 0, report.timestamp);
              }
            }

            // FPS (video only)
            if (report.kind === 'video' && report.framesPerSecond !== undefined) {
              fps = report.framesPerSecond;
            }
          }

          // ── Remote Inbound RTP: RTT (latency) ─────────────────────────────
          // The browser computes RTT when the peer's RTCP Receiver Report
          // echoes the timestamp of our last RTCP Sender Report
          if (report.type === 'remote-inbound-rtp' && report.roundTripTime !== undefined) {
            rtcpRtt = report.roundTripTime * 1000; // seconds → ms
          }

          // ── Active candidate pair: fallback RTT from STUN checks ──────────
          if (
            report.type === 'candidate-pair' &&
            report.state === 'succeeded' &&
            report.nominated &&
            report.currentRoundTripTime !== undefined
          ) {
            iceRtt = report.currentRoundTripTime * 1000;
          }
        });

        const previousSample = prevSampleRef.current?.pc === pc ? prevSampleRef.current : null;

        // ── Bitrate: bytes received since the previous poll ──────────────────
        if (previousSample && sampleTimestamp !== null) {
          let bytesDiff = 0;
          let hasComparableStream = false;
          currentInboundBytes.forEach((bytesReceived, id) => {
            const previousBytes = previousSample.bytesById.get(id);
            if (previousBytes !== undefined && bytesReceived >= previousBytes) {
              bytesDiff += bytesReceived - previousBytes;
              hasComparableStream = true;
            }
          });
          const timeDiff = (sampleTimestamp - previousSample.timestamp) / 1000;
          if (hasComparableStream && timeDiff > 0) {
            bitrate = (bytesDiff * 8) / timeDiff / 1000;
          }
        }

        // ── Packet loss over the recent window (not since the call began) ────
        const lossSamples = [
          ...(previousSample?.lossSamples || []),
          { packetsLost, packetsReceived },
        ].slice(-(LOSS_WINDOW_SAMPLES + 1));
        const oldest = lossSamples[0];
        const lostInWindow = Math.max(0, packetsLost - oldest.packetsLost);
        const receivedInWindow = Math.max(0, packetsReceived - oldest.packetsReceived);
        const expectedInWindow = lostInWindow + receivedInWindow;
        const packetLoss = expectedInWindow > 0 ? (lostInWindow / expectedInWindow) * 100 : null;

        prevSampleRef.current = sampleTimestamp === null
          ? null
          : { pc, timestamp: sampleTimestamp, bytesById: currentInboundBytes, lossSamples };

        setStats({
          peerId,
          latency: rtcpRtt ?? iceRtt,
          jitter: audioJitter ?? videoJitter,
          packetLoss,
          bitrate,
          fps,
        });
      } catch (err) {
        // getStats() can throw if connection closed
        console.warn('[QoS] getStats error:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [peerConnectionsRef]);

  const quality = getQuality(stats.latency, stats.jitter, stats.packetLoss);
  const peerName = stats.peerId ? remoteStreams?.get(stats.peerId)?.name : null;

  // Format bitrate nicely: show Mbps if >= 1000 kbps
  const bitrateDisplay = () => {
    if (stats.bitrate === null) return { value: 'N/A', unit: '' };
    if (stats.bitrate >= 1000) {
      return { value: fmt(stats.bitrate / 1000), unit: 'Mbps' };
    }
    return { value: fmt(stats.bitrate), unit: 'Kbps' };
  };
  const br = bitrateDisplay();

  return (
    <div className="qos-panel">
      <div className="panel-title">
        Quality of Service{peerName ? ` · ${peerName}` : ''}
      </div>

      <div className="qos-grid">
        <div className="qos-item">
          <div className="qos-label">Latency</div>
          <div className="qos-value">
            {fmt(stats.latency)}
            <span className="qos-unit">ms</span>
          </div>
        </div>

        <div className="qos-item">
          <div className="qos-label">Jitter</div>
          <div className="qos-value">
            {fmt(stats.jitter)}
            <span className="qos-unit">ms</span>
          </div>
        </div>

        <div className="qos-item">
          <div className="qos-label">Packet Loss</div>
          <div className="qos-value">
            {fmt(stats.packetLoss)}
            <span className="qos-unit">%</span>
          </div>
        </div>

        <div className="qos-item">
          <div className="qos-label">Bitrate</div>
          <div className="qos-value">
            {br.value}
            {br.unit && <span className="qos-unit">{br.unit}</span>}
          </div>
        </div>

        <div className="qos-item" style={{ gridColumn: 'span 2' }}>
          <div className="qos-label">Video FPS</div>
          <div className="qos-value">
            {fmt(stats.fps, 0)}
            <span className="qos-unit">fps</span>
          </div>
        </div>
      </div>

      {/* Connection quality indicator */}
      <div className="connection-quality">
        <span className="quality-label">Connection:</span>
        <span className={`quality-value ${quality}`}>
          {quality === 'waiting' && 'Waiting...'}
          {quality === 'good' && '● Good'}
          {quality === 'average' && '● Average'}
          {quality === 'poor' && '● Poor'}
        </span>
      </div>
    </div>
  );
}
