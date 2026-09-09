/**
 * Chat.jsx
 * --------
 * Real-time text chat via Socket.IO.
 *
 * Member 2 — Communication and Session Management
 *
 * Messages are broadcast to the room by the server.
 * No database — messages only exist in session memory.
 */

import { useState, useEffect, useRef } from 'react';

export default function Chat({ socketRef, roomId, myName }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  // ── Listen for incoming chat messages ────────────────────────────────────────
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const handleMessage = ({ name, message, timestamp }) => {
      setMessages((prev) => [...prev, { name, message, timestamp }]);
    };

    socket.on('chat-message', handleMessage);

    return () => {
      socket.off('chat-message', handleMessage);
    };
  // Re-register listener whenever the socket instance changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketRef?.current]);

  // ── Auto-scroll to newest message ────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = () => {
    const text = inputText.trim();
    const socket = socketRef?.current;
    if (!text || !socket) return;

    socket.emit('chat-message', { roomId, name: myName, message: text });
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="chat-panel">
      <div className="panel-title">Chat</div>

      {/* Messages */}
      <div className="chat-messages" id="chat-messages">
        {messages.length === 0 && (
          <div style={{ color: '#555', fontSize: '12px' }}>
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-message ${msg.name === myName ? 'own-message' : ''}`}
          >
            <div className="msg-name">{msg.name}</div>
            <div className="msg-text">{msg.message}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          id="chat-input"
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button id="send-message" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}
