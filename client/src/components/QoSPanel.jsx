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

  // Keep byte counters per inbound stream because stats reports can include
  // separate audio/video tracks whose counters start at different times.
  const prevBytesRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      // Get the first available peer connection
      const pcs = [...(peerConnectionsRef?.current?.values() || [])];
      if (pcs.length === 0) {
        prevBytesRef.current = null;
        return;
      }

      const pc = pcs[0];
      if (pc.connectionState !== 'connected') {
        prevBytesRef.current = null;
        return;
      }

      try {
        const statsReport = await pc.getStats();

        let latency = null;       // ms
        let jitter = null;        // ms
        let packetLoss = null;    // %
        let bitrate = null;       // kbps
        let fps = null;           // frames/sec
        const currentInboundBytes = new Map();
        let sampleTimestamp = null;

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

            if (typeof report.bytesReceived === 'number') {
              currentInboundBytes.set(report.id, report.bytesReceived);
              if (typeof report.timestamp === 'number') {
                sampleTimestamp = Math.max(sampleTimestamp || 0, report.timestamp);
              }
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

        const previousSample = prevBytesRef.current;
        if (previousSample?.pc === pc && sampleTimestamp !== null) {
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
        prevBytesRef.current = sampleTimestamp === null
          ? null
          : { pc, timestamp: sampleTimestamp, bytesById: currentInboundBytes };

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
