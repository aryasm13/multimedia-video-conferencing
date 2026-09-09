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
 * Metrics collected:
 *   - Latency     → remote-inbound-rtp.roundTripTime (RTT from RTCP)
 *   - Jitter      → inbound-rtp.jitter (from RTCP receiver reports)
 *   - Packet Loss → inbound-rtp.packetsLost / total packets received
 *   - Bitrate     → calculated from bytesReceived difference over time
 *   - FPS         → inbound-rtp.framesPerSecond
 *
 * Connection quality:
 *   Good    → latency < 150ms AND jitter < 30ms AND loss < 1%
 *   Average → latency < 300ms AND jitter < 60ms AND loss < 5%
 *   Poor    → anything worse
 */

import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 1000;

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

  const lat = latency ?? 9999;
  const jit = jitter ?? 9999;
  const loss = packetLoss ?? 100;

  if (lat < 150 && jit < 30 && loss < 1) return 'good';
  if (lat < 300 && jit < 60 && loss < 5) return 'average';
  return 'poor';
}

export default function QoSPanel({ peerConnectionsRef }) {
  const [stats, setStats] = useState({
    latency: null,
    jitter: null,
    packetLoss: null,
    bitrate: null,
    fps: null,
  });

  // Store previous bytes for bitrate calculation
  const prevBytesRef = useRef(null);
  const prevTimeRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Get the first available peer connection
      const pcs = [...(peerConnectionsRef?.current?.values() || [])];
      if (pcs.length === 0) return;

      const pc = pcs[0];
      if (pc.connectionState !== 'connected') return;

      try {
        const statsReport = await pc.getStats();

        let latency = null;       // ms
        let jitter = null;        // ms
        let packetLoss = null;    // %
        let bitrate = null;       // kbps
        let fps = null;           // frames/sec

        statsReport.forEach((report) => {
          // ── Inbound RTP: jitter, packet loss, bytes, FPS ──────────────────
          if (report.type === 'inbound-rtp') {
            // Jitter is in seconds — convert to ms
            if (report.jitter !== undefined) {
              jitter = report.jitter * 1000;
            }

            // Packet loss percentage
            if (
              report.packetsLost !== undefined &&
              report.packetsReceived !== undefined
            ) {
              const total = report.packetsLost + report.packetsReceived;
              if (total > 0) {
                packetLoss = (report.packetsLost / total) * 100;
              }
            }

            // Bitrate calculation:
            //   bitrate = (byteDifference × 8) / timeDifference
            if (report.bytesReceived !== undefined) {
              const now = Date.now();
              if (prevBytesRef.current !== null && prevTimeRef.current !== null) {
                const bytesDiff = report.bytesReceived - prevBytesRef.current;
                const timeDiff = (now - prevTimeRef.current) / 1000; // seconds
                if (timeDiff > 0) {
                  bitrate = (bytesDiff * 8) / timeDiff / 1000; // kbps
                }
              }
              prevBytesRef.current = report.bytesReceived;
              prevTimeRef.current = Date.now();
            }

            // FPS (video only)
            if (report.framesPerSecond !== undefined) {
              fps = report.framesPerSecond;
            }
          }

          // ── Remote Inbound RTP: RTT (latency) ─────────────────────────────
          // This comes from RTCP sender reports — the browser computes RTT
          if (report.type === 'remote-inbound-rtp') {
            if (report.roundTripTime !== undefined) {
              latency = report.roundTripTime * 1000; // seconds → ms
            }
          }

          // ── Candidate pair: fallback latency ──────────────────────────────
          if (
            report.type === 'candidate-pair' &&
            report.state === 'succeeded' &&
            latency === null
          ) {
            if (report.currentRoundTripTime !== undefined) {
              latency = report.currentRoundTripTime * 1000;
            }
          }
        });

        setStats({ latency, jitter, packetLoss, bitrate, fps });
      } catch (err) {
        // getStats() can throw if connection closed
        console.warn('[QoS] getStats error:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [peerConnectionsRef]);

  const quality = getQuality(stats.latency, stats.jitter, stats.packetLoss);

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
      <div className="panel-title">Quality of Service</div>

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
