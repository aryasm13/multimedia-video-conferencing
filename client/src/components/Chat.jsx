import { useCallback, useEffect, useRef, useState } from 'react';

function mergeMessages(current, incoming) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort(
    (first, second) => first.timestamp - second.timestamp || first.id - second.id
  );
}

export default function Chat({ socketRef, roomId, myName, serverUrl, micEnabled }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const [captionNotice, setCaptionNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [captionStarting, setCaptionStarting] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [captionSupported] = useState(
    typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return undefined;

    const handleMessage = (message) => {
      setMessages((current) => mergeMessages(current, [message]));
    };

    socket.on('chat-message', handleMessage);
    socket.on('caption-message', handleMessage);

    const controller = new AbortController();
    const loadMessages = async () => {
      try {
        const response = await fetch(
          `${serverUrl}/api/rooms/${encodeURIComponent(roomId)}/messages`,
          { signal: controller.signal }
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Could not load conversation history.');
        }
        setMessages((current) => mergeMessages(current, result.messages));
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message || 'Could not load conversation history.');
        }
      }
    };

    loadMessages();
    return () => {
      socket.off('chat-message', handleMessage);
      socket.off('caption-message', handleMessage);
      controller.abort();
    };
  }, [roomId, serverUrl, socketRef]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  const stopCaptioning = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) recognition.stop();
    setCaptioning(false);
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    if (!micEnabled) stopCaptioning();
  }, [micEnabled, stopCaptioning]);

  useEffect(() => () => {
    if (recognitionRef.current) recognitionRef.current.stop();
  }, []);

  const toggleCaptioning = async () => {
    if (recognitionRef.current) {
      stopCaptioning();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Live captions are not supported by this browser. Try Chrome or Edge.');
      return;
    }

    const socket = socketRef?.current;
    if (!socket || !micEnabled) {
      setError('Connect to the room and turn on your microphone to start captions.');
      return;
    }

    setError('');
    setCaptionNotice('');
    setCaptionStarting(true);
    const language = 'en-US';
    let processLocally = false;

    try {
      if (
        typeof SpeechRecognition.available === 'function' &&
        typeof SpeechRecognition.install === 'function'
      ) {
        const availability = await SpeechRecognition.available({
          langs: [language],
          processLocally: true,
        });
        if (availability === 'downloadable') {
          setCaptionNotice('Preparing on-device English speech recognition…');
          const installed = await SpeechRecognition.install({ langs: [language] });
          if (installed) {
            processLocally = true;
            setCaptionNotice('');
          } else {
            setCaptionNotice('The on-device speech pack could not be installed. Trying browser speech recognition instead; an internet connection is required.');
          }
        } else if (availability === 'available') {
          processLocally = true;
        } else if (availability === 'downloading') {
          setCaptionNotice('The on-device speech pack is still downloading. Trying browser speech recognition instead; an internet connection is required.');
        } else {
          setCaptionNotice('On-device English speech recognition is unavailable. Trying browser speech recognition instead; an internet connection is required.');
        }
      }
    } catch (setupError) {
      setCaptionNotice(
        `Could not prepare on-device captions (${setupError.message}). Trying browser speech recognition instead; an internet connection is required.`
      );
    }

    if (!socketRef?.current || !micEnabled) {
      setCaptionStarting(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    if (processLocally) recognition.processLocally = true;
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim.trim());

      const message = finalTranscript.trim();
      if (message) {
        socket.emit('caption-message', { roomId, message }, (response) => {
          if (response?.error) setError(response.error);
        });
      }
    };
    recognition.onerror = (event) => {
      const messages = {
        network: processLocally
          ? 'On-device speech recognition failed. Check the installed English speech pack, then restart captions.'
          : 'The browser speech service is unreachable (network). Check your internet connection, VPN/firewall settings, and browser permissions, then retry. This browser does not have an available on-device English speech pack.',
        'not-allowed': 'The browser denied speech recognition. Allow microphone access for this site, then retry.',
        'audio-capture': 'Speech recognition could not access the microphone. Check that it is connected and not in use by another app.',
        'language-not-supported': 'English speech recognition is not available in this browser. Check its language pack settings.',
        'service-not-allowed': 'The browser blocked its speech recognition service. Check browser policies or try a browser that supports on-device captions.',
      };
      setError(messages[event.error] || `Live captioning stopped: ${event.error}.`);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setCaptioning(false);
      setInterimTranscript('');
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setCaptioning(true);
      setError('');
    } catch (startError) {
      setError(`Could not start live captions: ${startError.message}`);
    } finally {
      setCaptionStarting(false);
    }
  };

  const sendMessage = () => {
    const message = inputText.trim();
    const socket = socketRef?.current;
    if (!message) return;
    if (!socket) {
      setError('Not connected to the room. Rejoin before sending messages.');
      return;
    }

    setError('');
    socket.emit('chat-message', { roomId, message }, (response) => {
      if (response?.error) {
        setError(response.error);
      } else {
        setInputText('');
      }
    });
  };

  const exportConversation = async () => {
    setExporting(true);
    setError('');
    try {
      const response = await fetch(
        `${serverUrl}/api/rooms/${encodeURIComponent(roomId)}/export?format=csv`
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Could not export this conversation.');
      }

      const file = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      const safeRoomId = roomId.replace(/[^a-z0-9_-]/gi, '_');
      link.href = file;
      link.download = `${safeRoomId}-conversation.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(file), 1000);
    } catch (exportError) {
      setError(exportError.message || 'Could not export this conversation.');
    } finally {
      setExporting(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') sendMessage();
  };

  return (
    <div className="chat-panel">
      <div className="panel-title">Chat &amp; Captions</div>

      <div className="chat-tools">
        <div className="caption-control">
          <button
            className={`caption-toggle ${captioning ? 'active' : ''}`}
            onClick={toggleCaptioning}
            disabled={!captionSupported || !micEnabled || captionStarting}
          >
            {captionStarting ? 'Preparing…' : captioning ? 'Stop captions' : 'Start captions'}
          </button>
          <span className="caption-status">
            {captionStarting ? 'Setting up' : captioning ? 'Listening…' : captionSupported ? 'Captions off' : 'Unsupported'}
          </span>
        </div>
        <button
          className="export-button"
          onClick={exportConversation}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {!captionSupported && (
        <div className="caption-notice">
          Live captions require a browser with Web Speech support, such as Chrome or Edge.
        </div>
      )}
      {captionNotice && (
        <div className="caption-notice" role="status">{captionNotice}</div>
      )}
      {captioning && interimTranscript && (
        <div className="caption-interim" aria-live="polite">
          {interimTranscript}
        </div>
      )}
      {error && <div className="chat-error" role="alert">{error}</div>}

      <div className="chat-messages" id="chat-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet. Say hello!</div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.name === myName ? 'own-message' : ''} ${
              message.type === 'caption' ? 'caption-message' : ''
            }`}
          >
            <div className="msg-heading">
              <span className="msg-name">{message.name}</span>
              {message.type === 'caption' && <span className="msg-type">Caption</span>}
            </div>
            <div className="msg-text">{message.message}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          id="chat-input"
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button id="send-message" onClick={sendMessage}>
          Send
        </button>
      </div>
    </div>
  );
}
